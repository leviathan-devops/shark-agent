import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';
export function checkTheatricalReturn(checker: ts.TypeChecker): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isReturnStatement(node) || !node.expression) return null;
    if (!ts.isObjectLiteralExpression(node.expression)) return null;
    const text = node.expression.getText(sourceFile);
    if (!/['"]?(success|passed)['"]?\s*:\s*true/i.test(text)) return null;
    let fn = node.parent;
    while (fn && !ts.isSourceFile(fn) && !ts.isFunctionDeclaration(fn) && !ts.isArrowFunction(fn) && !ts.isMethodDeclaration(fn)) fn = fn.parent;
    if (!fn || ts.isSourceFile(fn)) return null;
    const body = ts.isFunctionDeclaration(fn) ? fn.body : ts.isArrowFunction(fn) ? fn.body : null;
    if (!body || !ts.isBlock(body)) return null;
    const bodyText = body.getText(sourceFile);
    const writeAPIs = ['writeFileSync', 'appendFileSync', 'execSync'];
    const hasWriteAPI = writeAPIs.some(api => bodyText.includes(api));
    if (!hasWriteAPI) {
      const p = getNodePosition(node, sourceFile);
      return { rule: 'theatrical-return', severity: 'error', file: sourceFile.fileName, line: p.line, column: p.column, message: '[P10] Theatrical return without evidence-producing API', nodeKind: 'ReturnStatement', sourceSnippet: getNodeSnippet(node, sourceFile) };
    }
    return null;
  };
}
