import * as ts from 'typescript';
import { createInMemoryCompilerHost } from '../../src/semantic-firewall/analyzers/ts-compiler-host';
import { walkAST } from '../../src/semantic-firewall/analyzers/ast-walker';
import { checkNoEmptyCatches } from '../../src/semantic-firewall/rules/no-empty-catch';
import { checkNoUnsafeCasts } from '../../src/semantic-firewall/rules/no-unsafe-cast';
import { checkNoFloatingPromises } from '../../src/semantic-firewall/rules/no-floating-promises';
import { checkEvidenceBearingResults } from '../../src/semantic-firewall/rules/evidence-bearing-results';
import { checkNoHardcodedPaths } from '../../src/semantic-firewall/rules/no-hardcoded-paths';
import { checkCleanupPairedIntervals } from '../../src/semantic-firewall/rules/cleanup-paired-intervals';
import { checkHandleZeroLength } from '../../src/semantic-firewall/rules/handle-zero-length';
import { checkTheatricalReturn } from '../../src/semantic-firewall/rules/theatrical-return';

function getChecker(source: string): { checker: ts.TypeChecker; sourceFiles: Map<string, ts.SourceFile> } {
  const files = new Map([['test.ts', source]]);
  const { program, checker } = createInMemoryCompilerHost(files, {
    strict: true, noEmit: true, target: ts.ScriptTarget.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const sourceFiles = new Map<string, ts.SourceFile>();
  for (const f of program.getSourceFiles()) {
    if (!f.isDeclarationFile) sourceFiles.set(f.fileName, f);
  }
  return { checker, sourceFiles };
}

function runVisitor(source: string, visitor: (node: ts.Node, sf: ts.SourceFile) => any): any[] {
  const { sourceFiles } = getChecker(source);
  return walkAST(sourceFiles, [visitor]);
}

describe('no-empty-catch', () => {
  it('flags empty catch block', () => {
    const results = runVisitor('try { x(); } catch(e) {}', checkNoEmptyCatches());
    expect(results.length).toBe(1);
    expect(results[0].rule).toBe('no-empty-catch');
  });

  it('passes non-empty catch block', () => {
    const results = runVisitor('try { x(); } catch(e) { console.error(e); }', checkNoEmptyCatches());
    expect(results.length).toBe(0);
  });

  it('passes catch with recovery', () => {
    const results = runVisitor('try { x(); } catch(e) { recover(e); }', checkNoEmptyCatches());
    expect(results.length).toBe(0);
  });
});

describe('no-unsafe-cast', () => {
  it('flags bare as cast without guard', () => {
    const results = runVisitor('const x = y as string;', checkNoUnsafeCasts());
    expect(results.length).toBe(1);
    expect(results[0].rule).toBe('no-unsafe-cast');
  });

  it('passes as unknown cast', () => {
    const results = runVisitor('const x = y as unknown;', checkNoUnsafeCasts());
    expect(results.length).toBe(0);
  });

  it('passes guarded as cast with typeof', () => {
    const results = runVisitor('if (typeof x === "string") { const y = x as string; }', checkNoUnsafeCasts());
    expect(results.length).toBe(0);
  });
});

describe('evidence-bearing-results', () => {
  it('flags theatrical success return without I/O', () => {
    const results = runVisitor('function test() { return { success: true }; }', checkEvidenceBearingResults());
    expect(results.length).toBe(1);
    expect(results[0].rule).toBe('evidence-bearing-results');
  });

  it('passes success return with prior write', () => {
    const src = 'function test() { writeFileSync("/tmp/x", "data"); return { success: true }; }';
    const results = runVisitor(src, checkEvidenceBearingResults());
    expect(results.length).toBe(0);
  });
});

describe('no-hardcoded-paths', () => {
  it('flags hardcoded /home/ path', () => {
    const results = runVisitor('const p = "/home/user/file.txt";', checkNoHardcodedPaths());
    expect(results.length).toBe(1);
  });

  it('passes dynamic path resolution', () => {
    const results = runVisitor('const p = path.join(os.homedir(), "file.txt");', checkNoHardcodedPaths());
    expect(results.length).toBe(0);
  });
});

describe('cleanup-paired-intervals', () => {
  it('flags setInterval without clearInterval', () => {
    const src = 'function test() { const x = setInterval(() => {}, 1000); }';
    const results = runVisitor(src, checkCleanupPairedIntervals());
    expect(results.length).toBe(1);
  });

  it('passes setInterval with clearInterval', () => {
    const src = 'function test() { const x = setInterval(() => {}, 1000); clearInterval(x); }';
    const results = runVisitor(src, checkCleanupPairedIntervals());
    expect(results.length).toBe(0);
  });
});

describe('theatrical-return', () => {
  it('flags theatrical success without side effects', () => {
    const src = 'function test() { return { success: true }; }';
    const results = runVisitor(src, checkTheatricalReturn());
    expect(results.length).toBe(1);
  });

  it('passes success with write API', () => {
    const src = 'function test() { writeFileSync("/tmp/x", "y"); return { success: true }; }';
    const results = runVisitor(src, checkTheatricalReturn());
    expect(results.length).toBe(0);
  });
});
