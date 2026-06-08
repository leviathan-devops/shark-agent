import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';
// @audited: called indirectly via rule engine registration
export function checkEvidenceBearingResults(): ASTVisitor {
  const WRITE_APIS = new Set(['writeFileSync','writeFile','appendFileSync','mkdirSync','execSync','push','log']);
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isReturnStatement(node) || !node.expression) return null;
    if (!ts.isObjectLiteralExpression(node.expression)) return null;
    const text = node.expression.getText(sourceFile);
    if (!/['"]?(success|passed)['"]?\s*:\s*true/i.test(text)) return null;
    let hasSideEffect = false;
    let parent = node.parent;
    while (parent && !ts.isSourceFile(parent)) {
      if (ts.isBlock(parent)) {
        const nodeIndex = parent.statements.indexOf(node as unknown as ts.Statement);
        if (nodeIndex > 0) {
          for (let i = nodeIndex - 1; i >= 0; i--) {
            const stmtText = parent.statements[i].getText(sourceFile);
            for (const api of WRITE_APIS) { if (stmtText.includes(api)) { hasSideEffect = true; break; } }
            if (hasSideEffect) break;
          }
        }
      }
      if (hasSideEffect) break;
      parent = parent.parent;
    }
    if (!hasSideEffect) {
      const pos = getNodePosition(node, sourceFile);
      return { rule: 'evidence-bearing-results', severity: 'error', file: sourceFile.fileName, line: pos.line, column: pos.column, message: '[P10] Theatrical return without evidence', nodeKind: 'ReturnStatement', sourceSnippet: getNodeSnippet(node, sourceFile) };
    }
    return null;
  };
}
