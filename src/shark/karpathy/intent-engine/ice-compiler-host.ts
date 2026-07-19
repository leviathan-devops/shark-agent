/**
 * ICE Compiler Host — ICE's own in-memory TypeScript Program.
 * =================================================================
 *
 * Law 8: Peer Not Puppet — ICE does NOT share a Program with RGE or SRE.
 * Each engine creates and disposes its own Program so they never interfere.
 *
 * This module provides `createInMemoryIceEngine()` which builds a real
 * `ts.Program` with a custom `CompilerHost` backed by an in-memory file map.
 * The resulting `ts.TypeChecker` gives ICE genuine type-resolution capability
 * instead of the parser-only `ts.createSourceFile()` path used previously.
 */

import * as ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface IceEngine {
  program: ts.Program;
  checker: ts.TypeChecker;
  getSourceFiles(): readonly ts.SourceFile[];
  dispose(): void;
}

const DEFAULT_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ES2020,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  allowJs: true,
  esModuleInterop: true,
};

/**
 * Create ICE's own TypeScript Program for in-memory analysis.
 * Law 8: Peer Not Puppet — ICE does NOT share a Program with RGE or SRE.
 */
export function createInMemoryIceEngine(
  files: Array<{ filename: string; content: string }>,
  options?: ts.CompilerOptions,
): IceEngine {
  const opts: ts.CompilerOptions = { ...DEFAULT_OPTIONS, ...options };

  const fileMap = new Map<string, string>();
  for (const f of files) {
    fileMap.set(f.filename, f.content);
  }

  const host: ts.CompilerHost = {
    getSourceFile: (
      fileName: string,
      languageVersion: ts.ScriptTarget,
    ): ts.SourceFile | undefined => {
      // Check in-memory files first
      const mem = fileMap.get(fileName);
      if (mem !== undefined) {
        return ts.createSourceFile(
          fileName,
          mem,
          languageVersion,
          /* setParentNodes */ true,
        );
      }
      // Try to read from disk for dependency resolution
      try {
        const content = fs.readFileSync(fileName, 'utf-8');
        return ts.createSourceFile(
          fileName,
          content,
          languageVersion,
          true,
        );
      } catch {
        return undefined;
      }
    },
    getDefaultLibFileName: (_options: ts.CompilerOptions): string => {
      return ts.getDefaultLibFilePath(opts);
    },
    writeFile: (
      _fileName: string,
      _data: string,
      _writeByteOrderMark: boolean,
    ): void => {
      /* ICE never emits */
    },
    getCurrentDirectory: (): string => process.cwd(),
    getCanonicalFileName: (fn: string): string => path.resolve(fn),
    useCaseSensitiveFileNames: (): boolean => true,
    getNewLine: (): string => '\n',
    fileExists: (fileName: string): boolean => {
      return fileMap.has(fileName) || fs.existsSync(fileName);
    },
    readFile: (fileName: string): string | undefined => {
      const mem = fileMap.get(fileName);
      if (mem !== undefined) return mem;
      return fs.existsSync(fileName)
        ? fs.readFileSync(fileName, 'utf-8')
        : undefined;
    },
  };

  const program = ts.createProgram(
    Array.from(fileMap.keys()),
    opts,
    host,
  );
  const checker = program.getTypeChecker();

  return {
    program,
    checker,
    getSourceFiles: (): readonly ts.SourceFile[] =>
      program.getSourceFiles(),
    dispose: (): void => {
      /* GC will clean up */
    },
  };
}
