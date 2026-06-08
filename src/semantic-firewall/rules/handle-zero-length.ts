import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';
export function checkHandleZeroLength(): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isElementAccessExpression(node)) return null;
    let parent = node.parent;
    while (parent && !ts.isSourceFile(parent)) {
      if (ts.isIfStatement(parent)) {
        const arrText = node.expression.getText(sourceFile);
        if (parent.expression.getText(sourceFile).includes(arrText + '.length')) return null;
      }
      parent = parent.parent;
    }
    const p = getNodePosition(node, sourceFile);
    return { rule: 'handle-zero-length', severity: 'warning', file: sourceFile.fileName, line: p.line, column: p.column, message: '[P2] Array access without length check', nodeKind: 'ElementAccessExpression', sourceSnippet: getNodeSnippet(node, sourceFile) };
  };
}
