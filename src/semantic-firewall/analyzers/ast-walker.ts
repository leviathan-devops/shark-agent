import * as ts from 'typescript';

export interface ASTVisitResult {
  rule: string;
  severity: 'error' | 'warning';
  file: string;
  line: number;
  column: number;
  message: string;
  nodeKind: string;
  sourceSnippet?: string;
}

export type ASTVisitor = (node: ts.Node, sourceFile: ts.SourceFile) => ASTVisitResult | null;

export function walkAST(
  sourceFiles: Map<string, ts.SourceFile>,
  visitors: ASTVisitor[]
): ASTVisitResult[] {
  const results: ASTVisitResult[] = [];
  for (const [, sourceFile] of sourceFiles) {
    visitNode(sourceFile, sourceFile, visitors, results);
  }
  return results;
}

function visitNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  visitors: ASTVisitor[],
  results: ASTVisitResult[]
): void {
  for (const visitor of visitors) {
    const result = visitor(node, sourceFile);
    if (result) results.push(result);
  }
  ts.forEachChild(node, child => visitNode(child, sourceFile, visitors, results));
}

export function getNodePosition(node: ts.Node, sourceFile: ts.SourceFile): { line: number; column: number } {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: pos.line + 1, column: pos.character + 1 };
}

export function getNodeSnippet(node: ts.Node, sourceFile: ts.SourceFile, contextLines: number = 1): string {
  const start = Math.max(0, node.getStart(sourceFile) - contextLines * 80);
  const end = Math.min(sourceFile.text.length, node.getEnd() + contextLines * 80);
  return sourceFile.text.substring(start, end);
}

export function findParentKind(node: ts.Node, kind: ts.SyntaxKind): ts.Node | null {
  let current = node.parent;
  while (current) {
    if (current.kind === kind) return current;
    if (ts.isSourceFile(current)) return null;
    current = current.parent;
  }
  return null;
}
