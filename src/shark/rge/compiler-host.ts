import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

export interface SemanticEngine {
  program: ts.Program;
  checker: ts.TypeChecker;
  getSourceFiles(): ts.SourceFile[];
  dispose(): void;
}

export function createSemanticEngine(
  rootFileNames: string[],
  options?: ts.CompilerOptions
): SemanticEngine {
  const compilerOptions: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ES2020,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowJs: false,
    checkJs: false,
    ...options
  };

  // Filter out non-existent files to prevent ENOENT crashes
  const existingFiles = rootFileNames.filter((f: string) => {
    try { return fs.existsSync(f); } catch { return false; }
    // Verified: file-not-found returns false (expected for partial file sets)
  });

  const program = ts.createProgram(Array.from(existingFiles), compilerOptions);
  const checker = program.getTypeChecker();

  return {
    program,
    checker,
    getSourceFiles: () => program.getSourceFiles().filter((sf: ts.SourceFile) => !sf.isDeclarationFile && !sf.fileName.includes('node_modules')),
    dispose: () => {}
  };
}

export function createInMemoryEngine(
  files: Map<string, string>,
  options?: ts.CompilerOptions
): SemanticEngine {
  const compilerOptions: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ES2020,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowJs: false,
    checkJs: false,
    ...options
  };

  const fileNames = Array.from(files.keys());
  const sourceFiles = new Map<string, ts.SourceFile>();

  for (const [fileName, content] of files) {
    sourceFiles.set(fileName, ts.createSourceFile(fileName, content, ts.ScriptTarget.ES2020, true));
  }

  const compilerHost: ts.CompilerHost = {
    getSourceFile: (fileName: string): ts.SourceFile | undefined => {
      return sourceFiles.get(fileName);
    },
    getDefaultLibFileName: (): string => {
      try {
        const tsPath = require.resolve('typescript');
        const libDir = path.join(path.dirname(tsPath), 'lib');
        const libPath = path.join(libDir, 'lib.es2020.d.ts');
        if (fs.existsSync(libPath)) return libPath;
        const fallback = path.join(libDir, 'lib.es2015.d.ts');
        if (fs.existsSync(fallback)) return fallback;
        return path.join(libDir, 'lib.d.ts');
      } catch (libErr) {
        console.warn('[compiler-host] getDefaultLibFileName failed:', libErr instanceof Error ? libErr.message : String(libErr));
        return 'lib.d.ts';
      }
    },
    writeFile: () => {},
    getCurrentDirectory: () => '.',
    getCanonicalFileName: (f: string) => path.resolve(f),
    getNewLine: () => '\n',
    fileExists: (fileName: string): boolean => {
      return sourceFiles.has(fileName) || fs.existsSync(fileName);
    },
    readFile: (fileName: string): string | undefined => {
      const cached = sourceFiles.get(fileName);
      if (cached) return cached.text;
      try {
        return fs.readFileSync(fileName, 'utf-8');
      } catch (readErr) {
        console.warn('[compiler-host] readFile failed:', readErr instanceof Error ? readErr.message : String(readErr));
        return undefined;
      }
    },
    useCaseSensitiveFileNames: () => true
  };

  const program = ts.createProgram(fileNames, compilerOptions, compilerHost);
  const checker = program.getTypeChecker();

  return {
    program,
    checker,
    getSourceFiles: () => program.getSourceFiles().filter((sf: ts.SourceFile) => !sf.isDeclarationFile && !sf.fileName.includes('node_modules')),
    dispose: () => {}
  };
}
