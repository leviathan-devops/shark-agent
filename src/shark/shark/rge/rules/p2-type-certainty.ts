import * as ts from 'typescript';
import { SemanticRule, SemanticFinding } from './rule-engine.js';

function getEnclosingStatement(node: ts.Node): ts.Statement | null {
  let current = node;
  while (current.parent) {
    if (ts.isSourceFile(current.parent)) return null;
    if (current.parent.kind === ts.SyntaxKind.Block || current.parent.kind === ts.SyntaxKind.CaseClause) {
      return current as ts.Statement;
    }
    current = current.parent;
  }
  return null;
}

function getEnclosingBlock(node: ts.Node): ts.Block | null {
  let current = node;
  while (current.parent) {
    if (ts.isBlock(current.parent)) return current.parent;
    if (ts.isSourceFile(current.parent)) return null;
    current = current.parent;
  }
  return null;
}

function hasParentIfGuard(node: ts.AsExpression): boolean {
  let parent = node.parent;
  while (parent) {
    if (ts.isIfStatement(parent)) {
      const ifText = parent.expression.getText();
      if (
        ifText.includes('typeof') ||
        ifText.includes('instanceof') ||
        ifText.includes('.parse(') ||
        ifText.includes('.safeParse(') ||
        (ifText.includes('.is') && ifText.includes('(')) ||
        ifText.includes('kind === ts.SyntaxKind.') ||
        ifText.includes('kind !== ts.SyntaxKind.')
      ) {
        return true;
      }
      return false;
    }
    if (ts.isSourceFile(parent)) return false;
    if (ts.isBlock(parent)) {
      if (parent.parent && (ts.isIfStatement(parent.parent) || ts.isTryStatement(parent.parent) || ts.isForStatement(parent.parent) || ts.isWhileStatement(parent.parent))) {
        parent = parent.parent;
        continue;
      }
      return false;
    }
    parent = parent.parent;
  }
  return false;
}

function hasEarlyReturnGuard(node: ts.AsExpression): boolean {
  const stmt = getEnclosingStatement(node);
  if (!stmt) return false;

  const block = getEnclosingBlock(node);
  if (!block) return false;

  const stmtIndex = block.statements.indexOf(stmt);
  if (stmtIndex <= 0) return false;

  for (let i = stmtIndex - 1; i >= 0; i--) {
    const prev = block.statements[i];
    if (!ts.isIfStatement(prev)) continue;

    const ifText = prev.expression.getText();
    if (!ifText.includes('.is') && !ifText.includes('kind === ts.SyntaxKind.') && !ifText.includes('kind !== ts.SyntaxKind.')) continue;

    const thenExits = (s: ts.Statement): boolean => {
      if (ts.isReturnStatement(s) || ts.isThrowStatement(s) || ts.isBreakStatement(s) || ts.isContinueStatement(s)) return true;
      if (ts.isBlock(s)) {
        const stmts = s.statements;
        if (stmts.length > 0) {
          const last = stmts[stmts.length - 1];
          return ts.isReturnStatement(last) || ts.isThrowStatement(last) || ts.isBreakStatement(last) || ts.isContinueStatement(last);
        }
      }
      return false;
    };

    if (thenExits(prev.thenStatement)) return true;
    if (prev.elseStatement && thenExits(prev.elseStatement)) return true;
  }

  return false;
}

function isSafeWidening(node: ts.AsExpression): boolean {
  if (!node.type) return false;
  const targetType = node.type.getText();
  return targetType === 'unknown' || targetType === 'never';
}

function isObjectLiteralCast(node: ts.AsExpression): boolean {
  return ts.isObjectLiteralExpression(node.expression);
}

function hasFunctionLevelGuard(node: ts.AsExpression): boolean {
  let current: ts.Node = node;
  while (current.parent) {
    if (ts.isSourceFile(current.parent)) return false;
    if (ts.isFunctionDeclaration(current.parent) || ts.isArrowFunction(current.parent) || ts.isFunctionExpression(current.parent) || ts.isMethodDeclaration(current.parent)) break;
    current = current.parent;
  }

  const func = current.parent;
  if (!func) return false;

  let body: ts.Block | undefined;
  if (ts.isFunctionDeclaration(func) && func.body) body = func.body;
  else if (ts.isArrowFunction(func) && func.body && ts.isBlock(func.body)) body = func.body;
  else if (ts.isFunctionExpression(func) && func.body) body = func.body;
  else if (ts.isMethodDeclaration(func) && func.body) body = func.body;

  if (!body || !ts.isBlock(body)) return false;

  const asLine = node.getStart();
  for (const stmt of body.statements) {
    if (stmt.getStart() >= asLine) break;
    if (!ts.isIfStatement(stmt)) continue;
    const ifText = stmt.expression.getText();
    if (!ifText.includes('.is') && !ifText.includes('kind === ts.SyntaxKind.') && !ifText.includes('kind !== ts.SyntaxKind.')) continue;
    const thenExits = (s: ts.Statement): boolean => {
      if (ts.isReturnStatement(s) || ts.isThrowStatement(s)) return true;
      if (ts.isBlock(s) && s.statements.length > 0) {
        const last = s.statements[s.statements.length - 1];
        return ts.isReturnStatement(last) || ts.isThrowStatement(last);
      }
      return false;
    };
    if (thenExits(stmt.thenStatement)) return true;
    if (stmt.elseStatement && thenExits(stmt.elseStatement)) return true;
  }

  return false;
}

export const p2TypeCertainty: SemanticRule = {
  id: 'P2',
  description: 'Unchecked `as` casts are forbidden. Every narrowing cast must follow a runtime type guard.',
  layer: 'type_contract',
  check: (node: ts.Node, _checker: ts.TypeChecker, sourceFile: ts.SourceFile) => {
    if (!ts.isAsExpression(node)) return [];

    if (isSafeWidening(node)) return [];

    if (isObjectLiteralCast(node)) return [];

    const findings: SemanticFinding[] = [];
    const castLine = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
    const targetType = node.type ? node.type.getText() : 'unknown';

    const hasGuard = hasParentIfGuard(node) || hasEarlyReturnGuard(node) || hasFunctionLevelGuard(node);

    if (!hasGuard) {
      findings.push({
        ruleId: 'P2',
        severity: 'CRITICAL',
        message: `Unchecked 'as ${targetType}' cast at line ${castLine}. Every narrowing cast must be preceded by a runtime type guard (typeof, instanceof, kind check, ts.is*(), zod.parse) in a parent if-block or an early-returning if-statement.`,
        file: sourceFile.fileName,
        line: castLine
      } as SemanticFinding);
    }

    return findings;
  }
};
