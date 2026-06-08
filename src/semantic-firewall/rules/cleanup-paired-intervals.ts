import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';
export function checkCleanupPairedIntervals(): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isCallExpression(node)) return null;
    if (node.expression.getText(sourceFile) !== 'setInterval') return null;
    let scope = node.parent;
    while (scope && !ts.isSourceFile(scope) && !ts.isFunctionDeclaration(scope) && !ts.isArrowFunction(scope) && !ts.isMethodDeclaration(scope)) scope = scope.parent;
    if (!scope || ts.isSourceFile(scope)) return null;
    if (!scope.getText(sourceFile).includes('clearInterval')) {
      const p = getNodePosition(node, sourceFile);
      return { rule: 'cleanup-paired-intervals', severity: 'error', file: sourceFile.fileName, line: p.line, column: p.column, message: '[P4] setInterval without clearInterval', nodeKind: 'CallExpression', sourceSnippet: getNodeSnippet(node, sourceFile) };
    }
    return null;
  };
}
