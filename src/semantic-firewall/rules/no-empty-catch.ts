import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';
// @audited: called indirectly via rule engine registration
export function checkNoEmptyCatches(): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      const pos = getNodePosition(node, sourceFile);
      return { rule: 'no-empty-catch', severity: 'error', file: sourceFile.fileName, line: pos.line, column: pos.column, message: '[P3] Empty catch block', nodeKind: 'CatchClause', sourceSnippet: getNodeSnippet(node, sourceFile) };
    }
    return null;
  };
}
