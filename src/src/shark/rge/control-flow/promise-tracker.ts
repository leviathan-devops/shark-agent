import * as ts from 'typescript';
import { ControlFlowGraph, pathsToExit } from './cfg-builder.js';
import { SemanticFinding } from '../report-types.js';

interface PromiseRecord {
  varName: string;
  promiseNode: ts.CallExpression;
  line: number;
}

function collectPromiseCreations(sourceFile: ts.SourceFile): PromiseRecord[] {
  const records: PromiseRecord[] = [];

  const visitor = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && (expr.text === 'Promise' || expr.text === 'newPromise')) {
        if (node.parent && ts.isVariableDeclaration(node.parent)) {
          const varDecl = node.parent as ts.VariableDeclaration;
          if (ts.isIdentifier(varDecl.name)) {
            const line = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
            records.push({ varName: varDecl.name.text, promiseNode: node, line });
          }
        }
      }
    }

    if (ts.isNewExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === 'Promise') {
        if (node.parent && ts.isVariableDeclaration(node.parent)) {
          const varDecl = node.parent as ts.VariableDeclaration;
          if (ts.isIdentifier(varDecl.name)) {
            const line = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
            records.push({ varName: varDecl.name.text, promiseNode: node as unknown as ts.CallExpression, line });
          }
        }
      }
    }

    ts.forEachChild(node, visitor);
  };

  visitor(sourceFile);
  return records;
}

export function trackFloatingPromises(
  sourceFile: ts.SourceFile,
  _cfg: ControlFlowGraph
): SemanticFinding[] {
  const findings: SemanticFinding[] = [];
  const promises = collectPromiseCreations(sourceFile);

  for (const promise of promises) {
    let hasAwait = false;
    let hasCatch = false;
    let hasTry = false;

    const varVisitor = (node: ts.Node): void => {
      if (ts.isAwaitExpression(node)) {
        const expr = node.expression;
        if (ts.isIdentifier(expr) && expr.text === promise.varName) {
          hasAwait = true;
        }
      }

      if (ts.isCallExpression(node)) {
        const callText = node.expression.getText();
        if (
          (callText === promise.varName || callText.endsWith('.' + promise.varName)) &&
          (callText.includes('.catch') || callText.includes('.then'))
        ) {
          hasCatch = true;
        }
      }

      ts.forEachChild(node, varVisitor);
    };
    varVisitor(sourceFile);

    let parent = promise.promiseNode.parent;
    while (parent) {
      if (ts.isTryStatement(parent)) {
        hasTry = true;
        break;
      }
      if (parent.kind === ts.SyntaxKind.SourceFile) break;
      parent = parent.parent;
    }

    if (!hasAwait && !hasCatch && !hasTry) {
      findings.push({
        ruleId: 'P9-FLOAT',
        severity: 'HIGH',
        message: `Promise created in variable '${promise.varName}' at line ${promise.line} is never awaited and has no .catch(). This promise may reject silently.`,
        file: sourceFile.fileName,
        line: promise.line
      });
    }
  }

  return findings;
}
