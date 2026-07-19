import * as ts from 'typescript';
import type { CodeConstructTree } from '../construct-tree.js';
import type { SemanticFinding } from '../report-types.js';

export interface DeadCodeFinding {
  ruleId: 'R14';
  severity: 'MEDIUM';
  message: string;
  file: string;
  line: number;
  endLine: number;
}

/**
 * R14: CFG Dead Code Detection
 *
 * Detects statements unreachable from the function entry point using
 * control flow analysis. After an unconditional return, throw, or break,
 * all subsequent statements in the same block are dead code.
 *
 * Algorithm:
 * 1. For each function, walk the body
 * 2. Track control flow terminators (return, throw, break, continue)
 * 3. After a terminator, all siblings in the same block are unreachable
 */
export function detectDeadCode(
  tree: CodeConstructTree,
  _checker: ts.TypeChecker | null,
  _sourceFiles: ts.SourceFile[]
): (DeadCodeFinding & SemanticFinding)[] {
  const findings: (DeadCodeFinding & SemanticFinding)[] = [];

  const functions = tree.getFunctions();

  for (const func of functions) {
    const sf = func.sourceFile;

    // Visit a block, flagging statements after terminators as dead.
    const visitBlock = (block: ts.Block): void => {
      const statements = block.statements;

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];

        // Check if previous statement was a terminator
        if (i > 0) {
          const prev = statements[i - 1];
          if (isTerminator(prev)) {
            const line = sf.getLineAndCharacterOfPosition(stmt.getStart()).line + 1;
            const endLine = sf.getLineAndCharacterOfPosition(stmt.getEnd()).line + 1;
            findings.push({
              ruleId: 'R14',
              severity: 'MEDIUM',
              message: `Dead code: unreachable statement after ${ts.SyntaxKind[prev.kind]}`,
              file: sf.fileName,
              line,
              endLine
            });
          }
        }

        // Recurse into nested blocks
        ts.forEachChild(stmt, (child: ts.Node) => {
          if (ts.isBlock(child)) {
            visitBlock(child);
          }
          // Check if(false) branches
          if (ts.isIfStatement(child) && child.expression.kind === ts.SyntaxKind.FalseKeyword) {
            const line = sf.getLineAndCharacterOfPosition(child.getStart()).line + 1;
            findings.push({
              ruleId: 'R14',
              severity: 'MEDIUM',
              message: 'Dead code: if(false) branch is never executed',
              file: sf.fileName,
              line,
              endLine: line
            });
          }
        });
      }
    };

    // Get function body
    const funcNode = func.node;
    if (ts.isFunctionDeclaration(funcNode) || ts.isMethodDeclaration(funcNode) || ts.isArrowFunction(funcNode)) {
      const body = funcNode.body;
      if (body && ts.isBlock(body)) {
        visitBlock(body);
      }
    }
  }

  return findings;
}

function isTerminator(stmt: ts.Statement): boolean {
  return ts.isReturnStatement(stmt) ||
    ts.isThrowStatement(stmt) ||
    ts.isBreakStatement(stmt) ||
    ts.isContinueStatement(stmt);
}
