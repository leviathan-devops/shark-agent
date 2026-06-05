import * as ts from 'typescript';
import { ControlFlowGraph, pathsToExit } from './cfg-builder.js';
import { SemanticFinding } from '../report-types.js';

interface TimerRecord {
  varName: string;
  timerType: 'setInterval' | 'setTimeout';
  callNode: ts.CallExpression;
  line: number;
}

function collectTimers(sourceFile: ts.SourceFile): TimerRecord[] {
  const records: TimerRecord[] = [];

  const visitor = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && (expr.text === 'setInterval' || expr.text === 'setTimeout')) {
        if (node.parent && ts.isVariableDeclaration(node.parent)) {
          const varDecl = node.parent as ts.VariableDeclaration;
          if (ts.isIdentifier(varDecl.name)) {
            const line = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
            records.push({
              varName: varDecl.name.text,
              timerType: expr.text as 'setInterval' | 'setTimeout',
              callNode: node,
              line
            });
          }
        }
      }
    }
    ts.forEachChild(node, visitor);
  };

  visitor(sourceFile);
  return records;
}

function findClearCalls(sourceFile: ts.SourceFile): Map<string, ts.CallExpression> {
  const clearCalls = new Map<string, ts.CallExpression>();

  const visitor = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && (expr.text === 'clearInterval' || expr.text === 'clearTimeout')) {
        for (const arg of node.arguments) {
          if (ts.isIdentifier(arg)) {
            clearCalls.set(arg.text, node);
          }
        }
      }
    }
    ts.forEachChild(node, visitor);
  };

  visitor(sourceFile);
  return clearCalls;
}

export function trackUnpairedTimers(
  sourceFile: ts.SourceFile,
  _cfg: ControlFlowGraph
): SemanticFinding[] {
  const findings: SemanticFinding[] = [];
  const timers = collectTimers(sourceFile);
  const clearCalls = findClearCalls(sourceFile);

  for (const timer of timers) {
    const hasClear = clearCalls.has(timer.varName);

    if (!hasClear && timer.timerType === 'setInterval') {
      findings.push({
        ruleId: 'P4-TIMER',
        severity: 'HIGH',
        message: `'${timer.timerType}' timer stored in '${timer.varName}' at line ${timer.line} has no matching clearInterval() call. This timer will leak and run forever.`,
        file: sourceFile.fileName,
        line: timer.line
      });
    }

    if (!hasClear && timer.timerType === 'setTimeout') {
      let insideFunction = false;
      let parent = timer.callNode.parent;
      while (parent) {
        if (ts.isFunctionDeclaration(parent) || ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) {
          insideFunction = true;
          break;
        }
        if (parent.kind === ts.SyntaxKind.SourceFile) break;
        parent = parent.parent;
      }

      if (insideFunction) {
        findings.push({
          ruleId: 'P4-TIMER',
          severity: 'LOW',
          message: `'setTimeout' in '${timer.varName}' at line ${timer.line} is inside a function. Consider using clearTimeout for cleanup to avoid callback execution after component unmount.`,
          file: sourceFile.fileName,
          line: timer.line
        });
      }
    }
  }

  return findings;
}
