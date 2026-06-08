import * as ts from 'typescript';

interface ASTVisitResult {
  rule: string; severity: 'error' | 'warning'; file: string; line: number; column: number;
  message: string; nodeKind: string; sourceSnippet?: string;
}
type ASTVisitor = (node: ts.Node, sourceFile: ts.SourceFile) => ASTVisitResult | null;

function getNodePosition(node: ts.Node, sourceFile: ts.SourceFile): { line: number; column: number } {
  const p = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: p.line + 1, column: p.character + 1 };
}
function getNodeSnippet(node: ts.Node, sourceFile: ts.SourceFile, cl: number = 1): string {
  const s = Math.max(0, node.getStart(sourceFile) - cl * 80);
  const e = Math.min(sourceFile.text.length, node.getEnd() + cl * 80);
  return sourceFile.text.substring(s, e);
}
function findParentKind(node: ts.Node, kind: ts.SyntaxKind): ts.Node | null {
  let cur = node.parent;
  while (cur) { if (cur.kind === kind) return cur; if (ts.isSourceFile(cur)) return null; cur = cur.parent; }
  return null;
}

export function checkNoUnsafeCasts(): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isAsExpression(node)) return null;
    if (node.type.kind === ts.SyntaxKind.UnknownKeyword) return null;
    let hasValidation = false;

    // Check parent IfStatement condition for typeof/instanceof guards
    const parentIf = findParentKind(node, ts.SyntaxKind.IfStatement);
    if (parentIf && ts.isIfStatement(parentIf)) {
      const condText = parentIf.expression.getText(sourceFile);
      if (/typeof\s+\w+\s*===/.test(condText) || /instanceof/.test(condText) || /is[A-Z]\w+\(/.test(condText) || /z\.(safe)?parse/.test(condText)) {
        hasValidation = true;
      }
    }

    // Check preceding statements in the same block
    if (!hasValidation) {
      const parentBlock = findParentKind(node, ts.SyntaxKind.Block);
      if (parentBlock && ts.isBlock(parentBlock)) {
        const nodeStart = node.getStart(sourceFile);
        for (const stmt of parentBlock.statements) {
          if (stmt.getEnd() > nodeStart) break;
          const stmtText = stmt.getText(sourceFile);
          if (/typeof\s+\w+\s*===/.test(stmtText) || /instanceof/.test(stmtText) || /is[A-Z]\w+\(/.test(stmtText) || /z\.(safe)?parse/.test(stmtText)) {
            hasValidation = true; break;
          }
        }
      }
    }

    if (!hasValidation) {
      const pos = getNodePosition(node, sourceFile);
      return { rule: 'no-unsafe-cast', severity: 'error', file: sourceFile.fileName, line: pos.line, column: pos.column, message: `[P2] Unchecked cast to '${node.type.getText(sourceFile)}'`, nodeKind: 'AsExpression', sourceSnippet: getNodeSnippet(node, sourceFile) };
    }
    return null;
  };
}
