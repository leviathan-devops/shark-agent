/**
 * SRE Honesty Compiler Host — OWN TypeScript Program.
 *
 * Law 8 (Peer Not Puppet): The SRE creates its OWN ts.Program. It does NOT
 * import from RGE (src/shark/rge/compiler-host.ts) or SF
 * (src/semantic-firewall/analyzers/ts-compiler-host.ts). They may look
 * textually similar — that is the point: structural parallelism, runtime
 * independence. A bug in RGE's host must never corrupt SRE analysis, and a
 * refactor of RGE's host must never break SRE silently.
 *
 * Two factories:
 *   - createSlopRemovalEngine(rootFileNames, options?)     -> on-disk files
 *   - createInMemorySlopRemovalEngine(files, options?)     -> pre-write analysis
 *
 * Both return the SRESemanticEngine shape: { program, checker,
 * getSourceFiles(), dispose() }.
 */

import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

/**
 * The SRE's own semantic engine handle. Carries the program, the type
 * checker, and a filtered source-file accessor (decl files and node_modules
 * are excluded from honesty analysis).
 */
export interface SRESemanticEngine {
  /** The SRE's own TypeScript Program. */
  readonly program: ts.Program;
  /** The TypeChecker derived from the SRE's program. */
  readonly checker: ts.TypeChecker;
  /**
   * Source files owned by this engine, with declaration files and
   * node_modules excluded. These are the files honesty rules analyze.
   */
  getSourceFiles(): ts.SourceFile[];
  /** Release resources. Currently a no-op; reserved for future caching. */
  dispose(): void;
}

/**
 * SRE compiler options. Intentionally identical in spirit to RGE's options
 * (strict, ES2020, ESNext module resolution) but defined here so the SRE is
 * free to change its own config without coordinating with RGE.
 */
function defaultHonestyOptions(): ts.CompilerOptions {
  return {
    strict: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ES2020,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowJs: false,
    checkJs: false,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
  };
}

/**
 * Resolve the default lib file path. Tries ts.getDefaultLibFilePath first
 * (robust across ESM/CJS), then falls back to a filesystem probe of the
 * TypeScript lib directory, then a final fallback name.
 */
function resolveDefaultLib(options: ts.CompilerOptions): string {
  try {
    const libPath = ts.getDefaultLibFilePath(options);
    if (libPath) return libPath;
  } catch (libErr) {
    console.warn(
      '[honesty-host] ts.getDefaultLibFilePath failed:',
      libErr instanceof Error ? libErr.message : String(libErr)
    );
  }
  try {
    const tsModulePath = require.resolve('typescript');
    const libDir = path.join(path.dirname(tsModulePath), 'lib');
    const candidates = ['lib.es2020.d.ts', 'lib.es2015.d.ts', 'lib.d.ts'];
    for (const candidate of candidates) {
      const fullPath = path.join(libDir, candidate);
      if (fs.existsSync(fullPath)) return fullPath;
    }
  } catch (resolveErr) {
    console.warn(
      '[honesty-host] lib directory probe failed:',
      resolveErr instanceof Error ? resolveErr.message : String(resolveErr)
    );
  }
  return 'lib.d.ts';
}

/**
 * Filter the program's source files down to the files the SRE actually
 * analyzes: not declaration files, not anything under node_modules.
 */
function getUserSourceFiles(program: ts.Program): ts.SourceFile[] {
  return program
    .getSourceFiles()
    .filter(
      (sf: ts.SourceFile) => !sf.isDeclarationFile && !sf.fileName.includes('node_modules')
    );
}

/**
 * SRE's OWN program factory for on-disk files.
 *
 * Filters out non-existent files to prevent ENOENT crashes (a missing file
 * should not abort the entire honesty audit), then constructs a fresh
 * ts.Program with the SRE's compiler options.
 */
export function createSlopRemovalEngine(
  rootFileNames: string[],
  options?: ts.CompilerOptions
): SRESemanticEngine {
  const compilerOptions: ts.CompilerOptions = {
    ...defaultHonestyOptions(),
    ...options,
  };

  const existing = rootFileNames.filter((f) => {
    try {
      return fs.existsSync(f);
    } catch {
      return false;
    }
  });

  const program = ts.createProgram(existing, compilerOptions);
  const checker = program.getTypeChecker();

  return {
    program,
    checker,
    getSourceFiles: () => getUserSourceFiles(program),
    dispose: () => {
      /* reserved for future program cache invalidation */
    },
  };
}

/**
 * SRE's OWN in-memory program factory. Used by checkWriteTime (the pre-write
 * hook in blockTheatricalCode) so a single file can be analyzed without
 * touching disk. Identical contract to createSlopRemovalEngine.
 *
 * A custom CompilerHost serves the provided file contents from memory while
 * still allowing the lib.d.ts to resolve from disk.
 */
export function createInMemorySlopRemovalEngine(
  files: { filename: string; content: string }[],
  options?: ts.CompilerOptions
): SRESemanticEngine {
  const compilerOptions: ts.CompilerOptions = {
    ...defaultHonestyOptions(),
    ...options,
  };

  const sourceFiles = new Map<string, ts.SourceFile>();
  const fileNames: string[] = [];

  for (const { filename, content } of files) {
    fileNames.push(filename);
    sourceFiles.set(
      filename,
      ts.createSourceFile(filename, content, ts.ScriptTarget.ES2020, true)
    );
  }

  const compilerHost: ts.CompilerHost = {
    getSourceFile: (
      fileName: string,
      languageVersion: ts.ScriptTarget
    ): ts.SourceFile | undefined => {
      const cached = sourceFiles.get(fileName);
      if (cached) return cached;
      // Allow lib files and other on-disk dependencies to load normally.
      try {
        const diskContent = fs.readFileSync(fileName, 'utf-8');
        return ts.createSourceFile(
          fileName,
          diskContent,
          languageVersion,
          true
        );
      } catch {
        return undefined;
      }
    },
    getDefaultLibFileName: (): string => resolveDefaultLib(compilerOptions),
    writeFile: () => {
      /* SRE never emits; no-op */
    },
    getCurrentDirectory: () => '.',
    getCanonicalFileName: (f: string) => path.resolve(f),
    getNewLine: () => '\n',
    fileExists: (fileName: string): boolean =>
      sourceFiles.has(fileName) ||
      (() => {
        try {
          return fs.existsSync(fileName);
        } catch {
          return false;
        }
      })(),
    readFile: (fileName: string): string | undefined => {
      const cached = sourceFiles.get(fileName);
      if (cached) return cached.text;
      try {
        return fs.readFileSync(fileName, 'utf-8');
      } catch {
        return undefined;
      }
    },
    useCaseSensitiveFileNames: () => true,
  };

  const program = ts.createProgram(fileNames, compilerOptions, compilerHost);
  const checker = program.getTypeChecker();

  return {
    program,
    checker,
    getSourceFiles: () => getUserSourceFiles(program),
    dispose: () => {
      /* reserved */
    },
  };
}
