import * as ts from 'typescript';
import { SemanticRule, SemanticFinding } from './rule-engine.js';

function hasCatchChain(node: ts.AwaitExpression): boolean {
  let current: ts.Node = node.parent;
  while (current) {
    if (ts.isCallExpression(current)) {
      const callText = current.expression.getText();
      if (callText.endsWith('.catch') || callText.endsWith('.then')) return true;
      if (callText.endsWith('.finally')) return true;
      const fullText = current.getText();
      if (fullText.includes('.catch(') || fullText.includes('.then(')) return true;
      break;
    }
    if (
      current.kind === ts.SyntaxKind.ExpressionStatement ||
      current.kind === ts.SyntaxKind.VariableDeclaration ||
      current.kind === ts.SyntaxKind.BinaryExpression
    ) {
      break;
    }
    current = current.parent;
  }
  return false;
}

export const p9AsyncDiscipline: SemanticRule = {
  id: 'P9',
  description: 'No floating promises — every await must have error handling',
  layer: 'control_flow',
  check: (node: ts.Node, _checker: ts.TypeChecker, sourceFile: ts.SourceFile) => {
    if (!ts.isAwaitExpression(node)) return [];

    const findings: SemanticFinding[] = [];

    let parent = node.parent;
    let inTryBlock = false;
    while (parent) {
      if (ts.isTryStatement(parent)) {
        inTryBlock = true;
        break;
      }
      if (parent.kind === ts.SyntaxKind.ArrowFunction || parent.kind === ts.SyntaxKind.FunctionDeclaration || parent.kind === ts.SyntaxKind.FunctionExpression) {
        break;
      }
      if (parent === sourceFile) break;
      parent = parent.parent;
    }

    if (!inTryBlock && !hasCatchChain(node)) {
      const awaitLine = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
      const awaitText = node.expression.getText();
      findings.push({
        ruleId: 'P9',
        severity: 'HIGH',
        message: `Floating promise at line ${awaitLine}: 'await ${awaitText}' is not inside a try/catch and has no .catch() chain. Add error handling.`,
        file: sourceFile.fileName,
        line: awaitLine
      });
    }

    return findings;
  }
};
