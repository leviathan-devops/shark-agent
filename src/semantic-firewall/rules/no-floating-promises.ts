import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';
export function checkNoFloatingPromises(checker: ts.TypeChecker): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isCallExpression(node)) return null;
    const type = checker.getTypeAtLocation(node);
    const typeText = checker.typeToString(type);
    if (!typeText.startsWith('Promise') && !typeText.includes('Promise<')) return null;
    if (ts.isAwaitExpression(node.parent)) return null;
    if (ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === 'catch') return null;
    if (ts.isReturnStatement(node.parent)) return null;
    if (ts.isCallExpression(node.parent)) return null;
    if (ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) return null;
    const pos = getNodePosition(node, sourceFile);
    return { rule: 'no-floating-promises', severity: 'error', file: sourceFile.fileName, line: pos.line, column: pos.column, message: '[P9] Floating Promise', nodeKind: 'CallExpression', sourceSnippet: getNodeSnippet(node, sourceFile) };
  };
}
