import * as ts from 'typescript';
import * as path from 'node:path';

export interface DeadExport { file: string; exportName: string; line: number; }

interface ModuleInfo {
  sourceFile: ts.SourceFile;
  /** exported name -> line number where it is declared */
  exports: Map<string, number>;
}

interface ExternalReference {
  targetPath: string;
  names: string[];
  wildcard: boolean;
}

/**
 * Find exported declarations that are never referenced (imported or re-exported)
 * by another source file in the program.
 *
 * Implementation note: the TypeChecker obtained from `ts.createProgram` does NOT
 * expose `findReferences` (that is a LanguageService-only API), so we detect dead
 * exports via pure AST reference counting instead:
 *   1. Record every exported name declared in each source file.
 *   2. Record every name imported / re-exported FROM another module file.
 *   3. An export with no external reference is dead.
 *
 * This keeps the rule Order-2 (pure AST) and free of LanguageService coupling.
 */
export function findDeadExports(program: ts.Program, _checker?: ts.TypeChecker): DeadExport[] {
  const dead: DeadExport[] = [];

  const sourceFiles: ts.SourceFile[] = [];
  const knownPaths = new Set<string>();
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf.fileName.includes('node_modules')) continue;
    sourceFiles.push(sf);
    knownPaths.add(sf.fileName);
  }

  // Step 1: collect exports per file.
  const modules = new Map<string, ModuleInfo>();
  for (const sf of sourceFiles) {
    modules.set(sf.fileName, { sourceFile: sf, exports: collectExports(sf) });
  }

  // Step 2: collect externally referenced names per target module file.
  const referenced = new Map<string, Set<string>>();
  const ensure = (p: string): Set<string> => {
    let s = referenced.get(p);
    if (!s) { s = new Set(); referenced.set(p, s); }
    return s;
  };
  for (const sf of sourceFiles) {
    for (const ref of collectExternalReferences(sf, knownPaths)) {
      const set = ensure(ref.targetPath);
      if (ref.wildcard) {
        set.add('*');
      } else {
        for (const n of ref.names) set.add(n);
      }
    }
  }

  // Step 3: an export is dead if it has no external reference and no wildcard import.
  for (const [filePath, info] of modules) {
    const refs = referenced.get(filePath);
    for (const [name, line] of info.exports) {
      if (refs?.has('*')) continue;       // wildcard re-export or namespace import
      if (refs?.has(name)) continue;      // explicitly imported / re-exported
      dead.push({ file: filePath, exportName: name, line });
    }
  }

  return dead.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
  );
}

/** Collect exported names (name -> line) declared at the top level of a source file. */
function collectExports(sf: ts.SourceFile): Map<string, number> {
  const out = new Map<string, number>();
  const record = (name: string, node: ts.Node): void => {
    const pos = sf.getLineAndCharacterOfPosition(node.getStart());
    out.set(name, pos.line + 1);
  };

  for (const node of sf.statements) {
    // export function/class/interface/type/enum
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      if (hasExportModifier(node)) {
        if (hasDefaultModifier(node)) record('default', node);
        else if (node.name) record(node.name.text, node);
      }
      continue;
    }
    // export const/let/var
    if (ts.isVariableStatement(node) && hasExportModifier(node as unknown as ts.Declaration)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) record(d.name.text, d);
      }
      continue;
    }
    // export default ...
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      record('default', node);
      continue;
    }
    // export { a, b }; export { x } from './m' (only local specifiers here)
    if (ts.isExportDeclaration(node) && !node.moduleSpecifier) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const sp of node.exportClause.elements) {
          record(sp.name.text, sp);
        }
      }
    }
  }
  return out;
}

/** Collect names imported / re-exported FROM external modules, resolved to file paths. */
function collectExternalReferences(sf: ts.SourceFile, knownPaths: Set<string>): ExternalReference[] {
  const refs: ExternalReference[] = [];
  const push = (specifier: string, names: string[], wildcard: boolean): void => {
    const target = resolveModulePath(specifier, sf.fileName, knownPaths);
    if (target) refs.push({ targetPath: target, names, wildcard });
  };

  for (const node of sf.statements) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const clause = node.importClause;
      const names: string[] = [];
      let wildcard = false;
      if (clause) {
        if (clause.name) names.push('default');
        if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            wildcard = true;
          } else if (ts.isNamedImports(clause.namedBindings)) {
            for (const sp of clause.namedBindings.elements) {
              names.push(sp.propertyName ? sp.propertyName.text : sp.name.text);
            }
          }
        }
      }
      if (names.length > 0 || wildcard) push(spec, names, wildcard);
      continue;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        const names = node.exportClause.elements.map((sp) =>
          sp.propertyName ? sp.propertyName.text : sp.name.text,
        );
        push(spec, names, false);
      } else {
        push(spec, [], true); // export * from '...'
      }
    }
  }
  return refs;
}

function hasExportModifier(node: ts.Declaration): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!mods && mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function hasDefaultModifier(node: ts.Declaration): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!mods && mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
}

/** Resolve a relative module specifier to a known source-file path, or null. */
function resolveModulePath(specifier: string, importingFile: string, knownPaths: Set<string>): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(importingFile), specifier);
  const candidates = [
    base,
    base.replace(/\.js$/i, '.ts'),
    base.replace(/\.js$/i, '.tsx'),
    base.replace(/\.jsx$/i, '.tsx'),
    base.replace(/\.mjs$/i, '.ts'),
    base.replace(/\.cjs$/i, '.ts'),
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const c of candidates) if (knownPaths.has(c)) return c;
  return null;
}
