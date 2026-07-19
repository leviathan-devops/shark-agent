import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';

/**
 * FIXED (v5.1): Walk ancestor chain to detect if a node is inside a
 * CatchClause. Promise-returning calls inside catch blocks are in an
 * established error-handling context and should not be flagged as
 * "theatrical floating promises". Only truly unhandled promises at the
 * top level or inside try blocks without catch are flagged.
 */
function isInsideCatchClause(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isCatchClause(current)) return true;
    // Stop at function boundaries — a catch in an outer function doesn't count
    if (ts.isFunctionLike(current) || ts.isArrowFunction(current) || ts.isMethodDeclaration(current)) return false;
    current = current.parent;
  }
  return false;
}

export function checkNoFloatingPromises(checker: ts.TypeChecker): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isCallExpression(node)) return null;
    const type = checker.getTypeAtLocation(node);
    const typeText = checker.typeToString(type);
    if (!typeText.startsWith('Promise') && !typeText.includes('Promise<')) return null;
    if (ts.isAwaitExpression(node.parent)) return null;
    if (ts.isPropertyAccessExpression(node.parent) && (node.parent.name.text === 'catch' || node.parent.name.text === 'then' || node.parent.name.text === 'finally')) return null;
    // A .then()/.catch()/.finally() method invocation is itself considered handled —
    // attaching a handler means the developer has acknowledged the promise.
    if (ts.isPropertyAccessExpression(node.expression) && (node.expression.name.text === 'catch' || node.expression.name.text === 'then' || node.expression.name.text === 'finally')) return null;
    if (ts.isReturnStatement(node.parent)) return null;
    if (ts.isCallExpression(node.parent)) return null;
    if (ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) return null;
    // A promise captured into a variable declaration (const/let/var x = ...) is not floating.
    if (ts.isVariableDeclaration(node.parent)) return null;
    // FIXED (v5.1): Promise calls inside catch blocks are in an error-handling
    // context — do not flag as theatrical floating promises. The catch clause
    // itself is the error handler; fire-and-forget async calls here are deliberate.
    if (isInsideCatchClause(node)) return null;
    const pos = getNodePosition(node, sourceFile);
    return { rule: 'no-floating-promises', severity: 'error', file: sourceFile.fileName, line: pos.line, column: pos.column, message: '[P9] Floating Promise', nodeKind: 'CallExpression', sourceSnippet: getNodeSnippet(node, sourceFile) };
  };
}
