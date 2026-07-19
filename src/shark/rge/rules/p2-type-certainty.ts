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

// ═══════════════════════════════════════════════
// PHASE 6: ANY TYPE CHECKING — Exported/Public API only
// ═══════════════════════════════════════════════

/**
 * Check if a type node is the `any` keyword.
 */
function isTypeAny(typeNode: ts.TypeNode | undefined): boolean {
  if (!typeNode) return false;
  return typeNode.kind === ts.SyntaxKind.AnyKeyword;
}

/**
 * Check if a FunctionDeclaration or VariableDeclaration (arrow function) is exported.
 *
 * Covers two patterns:
 *   1. `export function foo(x: any)` — FunctionDeclaration with export modifier
 *   2. `export const foo = (x: any) => ...` — VariableDeclaration with ArrowFunction initializer
 */
function isExportedFunction(node: ts.Node): boolean {
  // Check FunctionDeclaration with export modifier
  if (ts.isFunctionDeclaration(node)) {
    const modifiers = ts.getModifiers?.(node) ??
      (node as any).modifiers as ts.Modifier[] | undefined;
    return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }

  // Check VariableDeclaration containing ArrowFunction with export modifier
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer)) {
    // Walk up to VariableStatement to check for export
    const parent = node.parent?.parent;
    if (parent && ts.isVariableStatement(parent)) {
      const modifiers = ts.getModifiers?.(parent) ??
        (parent as any).modifiers as ts.Modifier[] | undefined;
      return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    }
  }

  return false;
}

/**
 * Check if a PropertyDeclaration belongs to an exported class.
 * Walks up: PropertyDeclaration → ClassDeclaration → check export modifier.
 */
function isExportedClassProperty(node: ts.Node): boolean {
  if (!ts.isPropertyDeclaration(node)) return false;
  // Walk up: PropertyDeclaration → ClassDeclaration → check export
  let parent: ts.Node | undefined = node.parent;
  while (parent && !ts.isClassDeclaration(parent)) {
    parent = parent.parent;
  }
  if (parent && ts.isClassDeclaration(parent)) {
    const modifiers = ts.getModifiers?.(parent) ??
      (parent as any).modifiers as ts.Modifier[] | undefined;
    return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }
  return false;
}

/**
 * Check if a MethodDeclaration is public (no `private` or `protected` modifier).
 * In TypeScript, methods without access modifiers are public by default.
 */
function isPublicMethod(node: ts.MethodDeclaration): boolean {
  if (!node.modifiers) return true; // No modifiers = public by default
  const hasPrivate = node.modifiers.some(m => m.kind === ts.SyntaxKind.PrivateKeyword);
  const hasProtected = node.modifiers.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword);
  return !hasPrivate && !hasProtected;
}

/**
 * Check if a parameter is a catch clause variable (e.g., `catch (e: any)`).
 * Catch clause variables are legitimate uses of `any` — never flag them.
 */
function isCatchClauseParameter(node: ts.Node): boolean {
  return !!node.parent && ts.isCatchClause(node.parent);
}

/**
 * Walk up the AST from a node to find the enclosing function-like declaration.
 * Returns the FunctionDeclaration, MethodDeclaration, ConstructorDeclaration,
 * FunctionExpression, or ArrowFunction that contains the node.
 */
function getEnclosingFunctionLike(node: ts.Node): ts.Node | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isConstructorDeclaration(current)
    ) {
      return current;
    }
    if (ts.isSourceFile(current)) return null;
    current = current.parent;
  }
  return null;
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
  description: 'Unchecked `as` casts are forbidden. Every narrowing cast must follow a runtime type guard. `any` in public API signatures is forbidden.',
  layer: 'type_contract',
  check: (node: ts.Node, _checker: ts.TypeChecker, sourceFile: ts.SourceFile) => {
    const findings: SemanticFinding[] = [];

    // ─── AS CAST CHECKING (existing) ───
    if (ts.isAsExpression(node)) {
      if (isSafeWidening(node)) return findings;
      if (isObjectLiteralCast(node)) return findings;

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

    // ─── ANY TYPE CHECKING (Phase 6: Enforcement Threshold Tuning) ───
    // Only flag `any` in public API signatures:
    //   - Exported function parameters (export function foo(x: any))
    //   - Exported function return types (export function foo(): any)
    //   - Public class method parameters
    // Do NOT flag `any` in:
    //   - Internal/local variables
    //   - Private function parameters
    //   - Catch clause variables (catch (e: any) — legitimate)

    // Exported function with `any` return type
    // Covers: function declarations AND arrow functions (VariableDeclaration with ArrowFunction initializer)
    if (isExportedFunction(node) && isTypeAny((node as ts.FunctionDeclaration).type)) {
      const line = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
      findings.push({
        ruleId: 'P2',
        severity: 'HIGH',
        message: `Exported function has 'any' return type at line ${line}. Use a specific return type or 'unknown' for type safety in public API.`,
        file: sourceFile.fileName,
        line
      } as SemanticFinding);
      return findings;
    }

    // Exported arrow function (VariableDeclaration) — check for `any` return type on the ArrowFunction
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer) && isExportedFunction(node)) {
      const arrowFn = node.initializer;
      if (isTypeAny(arrowFn.type)) {
        const line = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
        findings.push({
          ruleId: 'P2',
          severity: 'HIGH',
          message: `Exported arrow function has 'any' return type at line ${line}. Use a specific return type or 'unknown' for type safety in public API.`,
          file: sourceFile.fileName,
          line
        } as SemanticFinding);
      }
      // Also check arrow function parameters for `any`
      for (const param of arrowFn.parameters) {
        if (isTypeAny(param.type)) {
          const line = ts.getLineAndCharacterOfPosition(sourceFile, param.pos).line + 1;
          findings.push({
            ruleId: 'P2',
            severity: 'HIGH',
            message: `Exported arrow function parameter has 'any' type at line ${line}. Use a specific type or 'unknown' for type safety in public API signatures.`,
            file: sourceFile.fileName,
            line
          } as SemanticFinding);
        }
      }
    }

    // Exported class property with `any` type
    if (ts.isPropertyDeclaration(node) && isExportedClassProperty(node)) {
      const typeNode = node.type;
      if (isTypeAny(typeNode)) {
        const line = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
        findings.push({
          ruleId: 'P2',
          severity: 'HIGH',
          message: `Exported class property has 'any' type at line ${line}. Use a specific type or 'unknown' for type safety in public API.`,
          file: sourceFile.fileName,
          line
        } as SemanticFinding);
      }
    }

    // Parameter with `any` type — only in exported/public contexts
    if (ts.isParameter(node) && isTypeAny(node.type)) {
      // Exclude catch clause variables — catch (e: any) is legitimate
      if (isCatchClauseParameter(node)) return findings;

      const enclosingFn = getEnclosingFunctionLike(node);
      if (!enclosingFn) return findings;

      // Only flag in exported functions or public class methods
      const shouldFlag =
        (ts.isFunctionDeclaration(enclosingFn) && isExportedFunction(enclosingFn)) ||
        (ts.isMethodDeclaration(enclosingFn) && isPublicMethod(enclosingFn));

      if (shouldFlag) {
        const line = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
        const context = ts.isFunctionDeclaration(enclosingFn)
          ? 'Exported function'
          : 'Public class method';
        findings.push({
          ruleId: 'P2',
          severity: 'HIGH',
          message: `${context} parameter has 'any' type at line ${line}. Use a specific type or 'unknown' for type safety in public API signatures.`,
          file: sourceFile.fileName,
          line
        } as SemanticFinding);
      }
      return findings;
    }

    return findings;
  }
};
