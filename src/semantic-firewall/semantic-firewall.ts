import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createInMemoryCompilerHost, createProjectCompilerHost, getSourceFiles } from './analyzers/ts-compiler-host.js';
import { walkAST, type ASTVisitResult } from './analyzers/ast-walker.js';
import { ExecutionContext } from './execution-context.js';
import type { RuleConfig, FirewallDiag, FirewallResult, Severity, AnalysisPhase } from './types.js';
import { checkNoEmptyCatches } from './rules/no-empty-catch.js';
import { checkNoUnsafeCasts } from './rules/no-unsafe-cast.js';
import { checkNoFloatingPromises } from './rules/no-floating-promises.js';
import { checkEvidenceBearingResults } from './rules/evidence-bearing-results.js';
import { checkNoHardcodedPaths } from './rules/no-hardcoded-paths.js';
import { checkCleanupPairedIntervals } from './rules/cleanup-paired-intervals.js';
import { checkHandleZeroLength } from './rules/handle-zero-length.js';
import { checkTheatricalReturn } from './rules/theatrical-return.js';
import { snapshotDirectory, diffSnapshots } from './rules/scope-violation.js';
import { findDeadExports } from './rules/dead-export.js';

export class SemanticFirewall {
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;
  private sourceFiles: Map<string, ts.SourceFile> = new Map();
  private fileMtimes: Map<string, number> = new Map();
  private previousScopeSnapshot: Record<string, unknown>[] = [];

  constructor(
    private projectRoot: string,
    private context: ExecutionContext
  ) {}

  initialize(): boolean {
    if (typeof ts.createProgram !== 'function') {
      console.warn('[SemanticFirewall] TypeScript API not available');
      return false;
    }
    const tsConfigPath = path.join(this.projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsConfigPath)) {
      try {
        const files = new Map<string, string>();
        this.scanDir(this.projectRoot, files, 20);
        if (files.size === 0) {
          console.warn('[SemanticFirewall] No TypeScript files found, running in reduced mode');
          return false;
        }
        const host = createInMemoryCompilerHost(files, {
          strict: true, noEmit: true, target: ts.ScriptTarget.ESNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true,
        });
        this.program = host.program;
        this.checker = host.checker;
        this.sourceFiles = this.collectSourceFiles(this.program);
        for (const [f] of files) {
          try { this.fileMtimes.set(f, fs.statSync(f).mtimeMs); } catch (e) { console.warn('[SF] mtime set failed:', e); }
        }
        return this.sourceFiles.size > 0;
      } catch (err) {
        console.warn('[SemanticFirewall] In-memory init failed:', err);
        return false;
      }
    }
    try {
      const host = createProjectCompilerHost(this.projectRoot);
      this.program = host.program;
      this.checker = host.checker;
      this.sourceFiles = this.collectSourceFiles(this.program);
      return this.sourceFiles.size > 0;
    } catch (err) {
      console.warn('[SemanticFirewall] Init failed:', err);
      return false;
    }
  }

  refresh(): boolean {
    let changed = false;
    const updatedFiles = new Map<string, string>();
    try {
      this.scanDir(this.projectRoot, updatedFiles, 20);
    } catch (e) { console.warn('[SF] refresh scan failed:', e); return false; }
    let hasNew = false;
    for (const [fpath] of updatedFiles) {
      const oldMtime = this.fileMtimes.get(fpath);
      try {
        const stat = fs.statSync(fpath);
        if (!oldMtime || stat.mtimeMs > oldMtime) {
          hasNew = true;
          this.fileMtimes.set(fpath, stat.mtimeMs);
        }
      } catch (e) { console.warn('[SF] stat failed:', e); }
    }
    if (hasNew && updatedFiles.size > 0) {
      try {
        const host = createInMemoryCompilerHost(updatedFiles, {
          strict: true, noEmit: true, target: ts.ScriptTarget.ESNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true,
        });
        this.program = host.program;
        this.checker = host.checker;
        this.sourceFiles = this.collectSourceFiles(this.program);
        changed = true;
      } catch (e) {
        console.warn('[SemanticFirewall] Refresh failed:', e);
      }
    }
    return changed;
  }

  analyze(phase: AnalysisPhase, rules: RuleConfig[]): FirewallResult {
    this.refresh();
    const maxOrder = phase === 'write-time' ? 2 : 5;
    const diagnostics: FirewallDiag[] = [];
    const activeRules = rules.filter(r => r.enabled && r.orders <= maxOrder);
    for (const rule of activeRules) {
      const ruleResults = this.evaluateRule(rule);
      for (const result of ruleResults) {
        diagnostics.push({ ...result, phase });
      }
    }
    const errors = diagnostics.filter(d => d.severity === 'CRITICAL' || d.severity === 'HIGH');
    return { passed: errors.length === 0, diagnostics, phase };
  }

  private evaluateRule(rule: RuleConfig): FirewallDiag[] {
    const visitors: Function[] = [];
    switch (rule.name) {
      case 'no-empty-catch': visitors.push(checkNoEmptyCatches()); break;
      case 'no-unsafe-cast': if (this.checker) visitors.push(checkNoUnsafeCasts()); break;
      case 'no-floating-promises':
        if (this.checker) visitors.push(checkNoFloatingPromises(this.checker));
        else console.warn('[SF] no-floating-promises skipped: TypeChecker not available');
        break;
      case 'evidence-bearing-results': visitors.push(checkEvidenceBearingResults()); break;
      case 'no-hardcoded-paths': visitors.push(checkNoHardcodedPaths()); break;
      case 'cleanup-paired-intervals': visitors.push(checkCleanupPairedIntervals()); break;
      case 'handle-zero-length': visitors.push(checkHandleZeroLength()); break;
      case 'theatrical-return':
        if (this.checker) visitors.push(checkTheatricalReturn());
        else console.warn('[SF] theatrical-return skipped: TypeChecker not available');
        break;
      case 'scope-violation': return this.evaluateScopeViolation();
      case 'dead-export': return this.evaluateDeadExport();
    }
    if (visitors.length === 0 || this.sourceFiles.size === 0) return [];
    const results: Record<string, unknown>[] = walkAST(this.sourceFiles, visitors);
    return results.map(r => ({
      ...r,
      severity: r.severity === 'error' ? rule.severity : 'MEDIUM' as Severity,
    }));
  }

  private evaluateScopeViolation(): FirewallDiag[] {
    try {
      const snapshot = snapshotDirectory(this.projectRoot, ['node_modules', '.git', 'dist']);
      const allowedScope = [this.projectRoot];
      const before = this.previousScopeSnapshot.length > 0 ? this.previousScopeSnapshot : [];
      const violations = diffSnapshots(before, snapshot, allowedScope);
      this.previousScopeSnapshot = snapshot;
      return violations.map(v => ({
        rule: 'scope-violation', severity: 'HIGH' as Severity, phase: 'post-write' as AnalysisPhase,
        file: v.file, line: 0, column: 0,
        message: 'Scope violation: ' + v.reason + ' -- ' + v.actual,
        nodeKind: 'File',
      }));
    } catch (e) {
      return [];
    }
  }

  private evaluateDeadExport(): FirewallDiag[] {
    if (!this.program || !this.checker) {
      console.warn('[SF] dead-export skipped: TypeChecker not available');
      return [];
    }
    try {
      const dead = findDeadExports(this.program, this.checker);
      return dead.map(d => ({
        rule: 'dead-export', severity: 'MEDIUM' as Severity, phase: 'post-write' as AnalysisPhase,
        file: d.file, line: d.line, column: 0,
        message: "Dead export: '" + d.exportName + "' is exported but never imported",
        nodeKind: 'ExportDeclaration',
      }));
    } catch (e) {
      return [];
    }
  }

  private collectSourceFiles(program: ts.Program): Map<string, ts.SourceFile> {
    const map = new Map<string, ts.SourceFile>();
    for (const file of program.getSourceFiles()) {
      if (!file.isDeclarationFile && !file.fileName.includes('node_modules')) {
        map.set(file.fileName, file);
      }
    }
    return map;
  }

  private scanDir(dir: string, files: Map<string, string>, depth: number): void {
    if (depth <= 0) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.scanDir(fullPath, files, depth - 1);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
          try { files.set(fullPath, fs.readFileSync(fullPath, 'utf-8')); } catch (e) { console.warn('[SF] read file failed:', e); }
        }
      }
    } catch (e) { console.warn('[SF] scanDir failed:', e); }
  }
}
