import * as ts from 'typescript';
export interface DeadExport { file: string; exportName: string; line: number; }
export function findDeadExports(program: ts.Program, checker: ts.TypeChecker): DeadExport[] {
  const dead: DeadExport[] = [];
  const seenExports = new Set<string>();
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('node_modules')) continue;
    ts.forEachChild(sourceFile, function visit(node: ts.Node) {
      if (ts.isExportAssignment(node)) {
        const symbol = checker.getSymbolAtLocation(node.expression);
        if (symbol) {
          try {
            const refs = checker.findReferences(symbol);
            const hasExternal = refs?.some(r => r.references.some(ref => ref.getSourceFile().fileName !== sourceFile.fileName)) ?? false;
            if (!hasExternal) {
              const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
              const key = sourceFile.fileName + ':default';
              if (!seenExports.has(key)) {
                seenExports.add(key);
                dead.push({ file: sourceFile.fileName, exportName: 'default', line: pos.line + 1 });
              }
            }
          } catch { /* findReferences can throw on certain symbols */ }
        }
      }
      ts.forEachChild(node, visit);
    });
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) continue;
    const exports = checker.getExportsOfModule(moduleSymbol);
    for (const exportSymbol of exports) {
      const name = exportSymbol.getName();
      if (name === 'default') continue;
      const key = sourceFile.fileName + ':' + name;
      if (seenExports.has(key)) continue;
      const declarations = exportSymbol.getDeclarations();
      if (!declarations || declarations.length === 0) continue;
      const decl = declarations[0];
      const line = decl.getSourceFile().getLineAndCharacterOfPosition(decl.getStart()).line + 1;
      try {
        const references = checker.findReferences(decl);
        const hasExternal = references?.some(r => r.references.some(ref => ref.getSourceFile().fileName !== sourceFile.fileName)) ?? false;
        if (!hasExternal) {
          seenExports.add(key);
          dead.push({ file: sourceFile.fileName, exportName: name, line });
        }
      } catch { /* findReferences can throw on certain symbols */ }
    }
  }
  return dead;
}
