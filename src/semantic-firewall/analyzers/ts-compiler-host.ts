import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';

interface InMemoryFile {
  content: string;
  version: number;
}

export interface CompilerHostResult {
  program: ts.Program;
  checker: ts.TypeChecker;
}

export function createInMemoryCompilerHost(
  files: Map<string, string>,
  compilerOptions: ts.CompilerOptions = {}
): CompilerHostResult {
  if (!files || files.size === 0) throw new Error('[P2] No source files provided');
  if (typeof ts.createProgram !== 'function') throw new Error('[P1] TypeScript API not available');

  const defaultOptions: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    esModuleInterop: true,
    skipLibCheck: true,
    ...compilerOptions,
  };

  const fileMap = new Map<string, InMemoryFile>();
  for (const [name, content] of files) {
    fileMap.set(path.resolve(name), { content, version: 0 });
  }

  const host: ts.CompilerHost = {
    getSourceFile(fileName, languageVersion) {
      const resolved = path.resolve(fileName);
      const mem = fileMap.get(resolved);
      if (mem) return ts.createSourceFile(resolved, mem.content, languageVersion, true);
      try {
        const diskContent = fs.readFileSync(fileName, 'utf-8');
        return ts.createSourceFile(fileName, diskContent, languageVersion, true);
      } catch { return undefined; }
    },
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    writeFile: () => {},
    getCurrentDirectory: () => process.cwd(),
    getDirectories: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
    fileExists(fileName) {
      const resolved = path.resolve(fileName);
      return fileMap.has(resolved) || fs.existsSync(fileName);
    },
    readFile(fileName) {
      const resolved = path.resolve(fileName);
      const mem = fileMap.get(resolved);
      if (mem) return mem.content;
      try { return fs.readFileSync(fileName, 'utf-8'); } catch { return undefined; }
    },
    realpath: (fileName) => { try { return fs.realpathSync(fileName); } catch { return fileName; } },
    getNewLine: () => '\n',
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (f) => f,
  };

  const program = ts.createProgram(Array.from(fileMap.keys()), defaultOptions, host);
  const checker = program.getTypeChecker();
  return { program, checker };
}

export function createProjectCompilerHost(projectRoot: string): CompilerHostResult {
  if (!projectRoot || typeof projectRoot !== 'string') throw new Error('[P2] Invalid project root');
  const tsConfigPath = path.resolve(projectRoot, 'tsconfig.json');
  if (!fs.existsSync(tsConfigPath)) throw new Error(`[P2] tsconfig not found at ${tsConfigPath}`);

  const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
  if (configFile.error) throw new Error(`[P8] Invalid tsconfig: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`);

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config, ts.sys, projectRoot, {}, tsConfigPath
  );

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });
  const checker = program.getTypeChecker();
  return { program, checker };
}

export function getSourceFiles(program: ts.Program): Map<string, ts.SourceFile> {
  const map = new Map<string, ts.SourceFile>();
  for (const file of program.getSourceFiles()) {
    if (!file.isDeclarationFile && !file.fileName.includes('node_modules')) {
      map.set(file.fileName, file);
    }
  }
  return map;
}
