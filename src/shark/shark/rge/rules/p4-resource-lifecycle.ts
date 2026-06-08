import * as ts from 'typescript';
import { SemanticRule, SemanticFinding } from './rule-engine.js';

function collectTimerVariables(sourceFile: ts.SourceFile): Map<string, ts.CallExpression> {
  const timers = new Map<string, ts.CallExpression>();

  const visitor = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && (expr.text === 'setInterval' || expr.text === 'setTimeout')) {
        let varName: string | null = null;
        let parent = node.parent;
        while (parent) {
          if (ts.isVariableDeclaration(parent)) {
            if (ts.isIdentifier(parent.name)) {
              varName = parent.name.text;
            }
            break;
          }
          if (parent.kind === ts.SyntaxKind.ExpressionStatement) break;
          parent = parent.parent;
        }
        if (varName) {
          timers.set(varName, node);
        }
      }
    }
    ts.forEachChild(node, visitor);
  };

  visitor(sourceFile);
  return timers;
}

function collectClearCalls(sourceFile: ts.SourceFile): Set<string> {
  const cleared = new Set<string>();

  const visitor = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && (expr.text === 'clearInterval' || expr.text === 'clearTimeout')) {
        for (const arg of node.arguments) {
          if (ts.isIdentifier(arg)) {
            cleared.add(arg.text);
          }
        }
      }
    }
    ts.forEachChild(node, visitor);
  };

  visitor(sourceFile);
  return cleared;
}

export const p4ResourceLifecycle: SemanticRule = {
  id: 'P4',
  description: 'Every setInterval/setTimeout must have a matching clearInterval/clearTimeout',
  layer: 'control_flow',
  check: (node: ts.Node, _checker: ts.TypeChecker, sourceFile: ts.SourceFile) => {
    if (!ts.isSourceFile(node)) return [];

    const findings: SemanticFinding[] = [];
    const timers = collectTimerVariables(sourceFile);
    const cleared = collectClearCalls(sourceFile);

    for (const [varName, callExpr] of timers) {
      if (!cleared.has(varName)) {
        const callLine = ts.getLineAndCharacterOfPosition(sourceFile, callExpr.pos).line + 1;
        const kind = ts.isIdentifier(callExpr.expression) ? callExpr.expression.text : 'timer';
        findings.push({
          ruleId: 'P4',
          severity: 'HIGH',
          message: `${kind} timer stored in '${varName}' at line ${callLine} has no matching clear${kind === 'setInterval' ? 'Interval' : 'Timeout'}() call. Add cleanup in all exit paths.`,
          file: sourceFile.fileName,
          line: callLine
        });
      }
    }

    return findings;
  }
};
