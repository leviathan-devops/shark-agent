import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';
// @audited: called indirectly via rule engine registration
export function checkNoHardcodedPaths(): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node) && !ts.isTemplateExpression(node)) return null;
    const text = ts.isTemplateExpression(node) ? '' : node.text;
    if (/\/home\/[^/]/.test(text)) { const p = getNodePosition(node, sourceFile); return { rule: 'no-hardcoded-paths', severity: 'error', file: sourceFile.fileName, line: p.line, column: p.column, message: '[P7] Hardcoded /home/ path', nodeKind: 'StringLiteral', sourceSnippet: getNodeSnippet(node, sourceFile) }; }
    if (/\/Users\/[^/]/.test(text)) { const p = getNodePosition(node, sourceFile); return { rule: 'no-hardcoded-paths', severity: 'error', file: sourceFile.fileName, line: p.line, column: p.column, message: '[P7] Hardcoded /Users/ path', nodeKind: 'StringLiteral', sourceSnippet: getNodeSnippet(node, sourceFile) }; }
    if (/[A-Za-z]:\\/.test(text)) { const p = getNodePosition(node, sourceFile); return { rule: 'no-hardcoded-paths', severity: 'error', file: sourceFile.fileName, line: p.line, column: p.column, message: '[P7] Hardcoded Windows path', nodeKind: 'StringLiteral', sourceSnippet: getNodeSnippet(node, sourceFile) }; }
    if (ts.isTemplateExpression(node) && node.head && /\/(home|Users)\//.test(node.head.text)) {
      const p = getNodePosition(node, sourceFile);
      return { rule: 'no-hardcoded-paths', severity: 'error', file: sourceFile.fileName, line: p.line, column: p.column, message: '[P7] Hardcoded path in template', nodeKind: 'TemplateExpression', sourceSnippet: getNodeSnippet(node, sourceFile) };
    }
    return null;
  };
}
