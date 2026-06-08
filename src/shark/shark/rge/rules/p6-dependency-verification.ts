import * as ts from 'typescript';
import { SemanticRule, SemanticFinding } from './rule-engine.js';

function isBuiltInOrExternal(node: ts.Node, checker: ts.TypeChecker): boolean {
  if (!ts.isCallExpression(node)) return false;
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return false;

  const obj = expr.expression;
  if (!ts.isIdentifier(obj)) return false;

  const symbol = checker.getSymbolAtLocation(obj);
  if (!symbol) return false;

  const decls = symbol.declarations;
  if (!decls) return false;

  for (const decl of decls) {
    const fileName = decl.getSourceFile().fileName;
    if (fileName.includes('node_modules')) {
      if (fileName.includes('typescript/lib/lib.')) continue;
      return true;
    }
  }

  return false;
}

export const p6DependencyVerification: SemanticRule = {
  id: 'P6',
  description: 'External API calls must have dependency verification',
  layer: 'type_contract',
  check: (node: ts.Node, checker: ts.TypeChecker, sourceFile: ts.SourceFile) => {
    if (!ts.isCallExpression(node)) return [];

    const expr = node.expression;
    if (!ts.isPropertyAccessExpression(expr)) return [];

    if (!isBuiltInOrExternal(node, checker)) return [];

    const findings: SemanticFinding[] = [];

    let parent = node.parent;
    let inTryBlock = false;
    while (parent) {
      if (ts.isTryStatement(parent)) {
        inTryBlock = true;
        break;
      }
      if (parent === sourceFile) break;
      parent = parent.parent;
    }

    if (!inTryBlock) {
      const callLine = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
      const propAccess = expr as ts.PropertyAccessExpression;
      const methodName = propAccess.name.text;
      findings.push({
        ruleId: 'P6',
        severity: 'HIGH',
        message: `External API call '${methodName}' at line ${callLine} is not inside a try/catch block. Wrap calls to external dependencies in error handling.`,
        file: sourceFile.fileName,
        line: callLine
      });
    }

    return findings;
  }
};
