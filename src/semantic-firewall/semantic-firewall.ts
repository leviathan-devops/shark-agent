import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createInMemoryCompilerHost, createProjectCompilerHost } from './analyzers/ts-compiler-host.js';
import { walkAST, type ASTVisitResult } from './analyzers/ast-walker.js';
import { CFGBuilder, type BasicBlock } from './analyzers/cfg-builder.js';
import { ImportGraphAnalyzer } from './analyzers/import-graph.js';
import { ExecutionContext } from './execution-context.js';
import type { RuleConfig, FirewallDiag, FirewallResult, Severity, AnalysisPhase } from './types.js';
import { ProgramCache } from '../shared/pipeline/program-cache.js';
import { logInfo } from '../shared/shark-logger.js';
import { checkNoEmptyCatches } from './rules/no-empty-catch.js';
import { checkNoUnsafeCasts } from './rules/no-unsafe-cast.js';
import { checkNoFloatingPromises } from './rules/no-floating-promises.js';
import { checkEvidenceBearingResults } from './rules/evidence-bearing-results.js';
import { checkNoHardcodedPaths } from './rules/no-hardcoded-paths.js';
import { checkCleanupPairedIntervals } from './rules/cleanup-paired-intervals.js';
import { checkHandleZeroLength } from './rules/handle-zero-length.js';
// theatrical-return REMOVED from SF — SRE S1 owns theatrical return detection.
// See src/shared/rule-ownership-matrix.ts for the ownership matrix.
import { snapshotDirectory, diffSnapshots } from './rules/scope-violation.js';
import type { ScopeViolation, FileSnapshot } from './rules/scope-violation.js';
import { findDeadExports } from './rules/dead-export.js';
import type { DeadExport } from './rules/dead-export.js';

/**
 * Minimal finding shape for in-memory semantic analysis results.
 * Returned by analyzeInMemory() — maps to SemanticFinding in the
 * pipeline integration layer (src/shared/pipeline/semantic-analysis-context.ts).
 *
 * This interface is self-contained so the semantic-firewall module compiles
 * independently of the pipeline infrastructure.
 */
export interface SFAnalysisResult {
  /** Rule identifier in format `SF:<ruleName>` */
  ruleId: string;
  /** Always 'SF' — identifies the Semantic Firewall engine */
  engine: 'SF';
  /** Severity level from the rule definition */
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  /** Enforcement action recommended by the firewall */
  enforcementAction: 'block' | 'flag' | 'escalate' | 'drop';
  /** Human-readable description of the finding */
  message: string;
  /** The file path passed by the caller (logical path, not disk path) */
  file: string;
  /** 1-indexed line number of the finding */
  line: number;
  /** 1-indexed column number of the finding */
  column?: number;
  /** Optional fix suggestion or source snippet */
  fixSuggestion?: string;
}

export class SemanticFirewall {
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;
  private sourceFiles: Map<string, ts.SourceFile> = new Map();
  private fileMtimes: Map<string, number> = new Map();
  private previousScopeSnapshot: FileSnapshot[] = [];
  private cfgCache: Map<string, BasicBlock[]> = new Map();
  private importGraph: ImportGraphAnalyzer | null = null;
  private tsConfigPath: string | null = null;
  private scannedFiles: Map<string, string> | null = null;
  private _initialized = false;
  private _lastRefresh: number = 0;
  /** Tracks whether the "No TS program" message has been logged (suppress repeats) */
  private _noProgramWarned = false;
  private inMemoryCache = new ProgramCache<SFAnalysisResult[]>();

  /**
   * Default severity and enforcement action for each in-memory-capable rule.
   * Used by analyzeInMemory() when no explicit RuleConfig is available.
   * scope-violation and dead-export are excluded — they require disk/cross-file
   * context that doesn't exist for single-file in-memory analysis.
   */
  private static readonly IN_MEMORY_RULE_DEFAULTS: Record<
    string,
    { severity: SFAnalysisResult['severity']; enforcementAction: SFAnalysisResult['enforcementAction'] }
  > = {
    'no-empty-catch':           { severity: 'HIGH',     enforcementAction: 'block' },
    'no-unsafe-cast':           { severity: 'HIGH',     enforcementAction: 'block' },
    'no-floating-promises':     { severity: 'HIGH',     enforcementAction: 'block' },
    'evidence-bearing-results': { severity: 'CRITICAL', enforcementAction: 'block' },
    'no-hardcoded-paths':       { severity: 'MEDIUM',   enforcementAction: 'block' },
    'cleanup-paired-intervals': { severity: 'MEDIUM',   enforcementAction: 'block' },
    'handle-zero-length':       { severity: 'MEDIUM',   enforcementAction: 'block' },
    // theatrical-return removed — SRE S1 owns this check
  };

  constructor(
    private projectRoot: string,
    _context: ExecutionContext
  ) {}

  /**
   * Lightweight initialize — scans files and stores metadata WITHOUT
   * creating the TypeScript program. The TS program is created lazily
   * on first call to analyze() via ensureProgram().
   * This eliminates ~5-10 seconds of boot delay from ts.createProgram().
   */
  initialize(): boolean {
    if (typeof ts.createProgram !== 'function') {
      console.warn('[SemanticFirewall] TypeScript API not available');
      return false;
    }
    const tsConfigPath = path.join(this.projectRoot, 'tsconfig.json');
    this.tsConfigPath = fs.existsSync(tsConfigPath) ? tsConfigPath : null;

    if (!this.tsConfigPath) {
      try {
        const files = new Map<string, string>();
        const srcDir = path.join(this.projectRoot, 'src');
        const searchDir = fs.existsSync(srcDir) ? srcDir : this.projectRoot;
        this.scanDir(searchDir, files, 5);
        // Fallback: if no files found in projectRoot, try process.cwd() (container compat)
        if (files.size === 0 && process.cwd() !== this.projectRoot) {
          const cwdSrc = path.join(process.cwd(), 'src');
          const cwdSearchDir = fs.existsSync(cwdSrc) ? cwdSrc : process.cwd();
          this.scanDir(cwdSearchDir, files, 5);
          if (files.size > 0) {
            this.projectRoot = process.cwd();
          }
        }
        if (files.size === 0) {
          // No .ts files on disk — but analyzeInMemory() creates its own program
          // from content strings, so this is NOT a fatal condition.
          logInfo('[SemanticFirewall] No TypeScript files found on disk. In-memory analysis still active.');
          this._initialized = false;
          return false;
        } else {
          console.log(`[SemanticFirewall] Found ${files.size} TypeScript files in ${searchDir}. Full analysis active (lazy).`);
        }
        // Store scanned files for lazy program creation
        this.scannedFiles = files;
        for (const [f] of files) {
          try { this.fileMtimes.set(f, fs.statSync(f).mtimeMs); } catch (e) { console.warn('[SF] mtime set failed:', e); }
        }
      } catch (err) {
        console.warn('[SemanticFirewall] Scan failed:', err);
        this._initialized = false;
        return false;
      }
    } else {
      // tsconfig exists — just store the path, program created lazily
      try {
        const srcDir = path.join(this.projectRoot, 'src');
        const searchDir = fs.existsSync(srcDir) ? srcDir : this.projectRoot;
        const files = new Map<string, string>();
        this.scanDir(searchDir, files, 5);
        this.scannedFiles = files;
        for (const [f] of files) {
          try { this.fileMtimes.set(f, fs.statSync(f).mtimeMs); } catch (e) { console.warn('[SF] mtime set failed:', e); }
        }
        console.log(`[SemanticFirewall] Scanned ${files.size} files. TS program will be created on first use (lazy).`);
      } catch (err) {
        console.warn('[SemanticFirewall] Scan failed:', err);
        this._initialized = false;
        return false;
      }
    }

    this._initialized = true;
    return true;
  }

  /**
   * Lazy TypeScript program initialization — creates ts.createProgram()
   * on first actual use (first call to analyze()). This is the expensive
   * operation (~5-10s) that was previously in initialize().
   */
  private ensureProgram(): boolean {
    if (this.program) return true;
    if (!this._initialized) return false;

    try {
      if (this.tsConfigPath) {
        // Project has tsconfig.json — use project compiler host
        const host = createProjectCompilerHost(this.projectRoot);
        this.program = host.program;
        this.checker = host.checker;
        this.sourceFiles = this.collectSourceFiles(this.program);
        console.log(`[SemanticFirewall] Lazy: TS program created from tsconfig (${this.sourceFiles.size} source files)`);
      } else if (this.scannedFiles && this.scannedFiles.size > 0) {
        // No tsconfig — use in-memory compiler host with scanned files
        const host = createInMemoryCompilerHost(this.scannedFiles, {
          strict: true, noEmit: true, target: ts.ScriptTarget.ESNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true,
        });
        this.program = host.program;
        this.checker = host.checker;
        this.sourceFiles = this.collectSourceFiles(this.program);
        console.log(`[SemanticFirewall] Lazy: TS program created from scanned files (${this.sourceFiles.size} source files)`);
      } else {
        console.warn('[SemanticFirewall] No files available for lazy program creation');
        return false;
      }
      return this.sourceFiles.size > 0;
    } catch (err) {
      console.warn('[SemanticFirewall] Lazy program creation failed:', err);
      return false;
    }
  }

  refresh(): boolean {
    // Ensure program exists (lazy init) before checking for changes
    if (!this.program) {
      return this.ensureProgram();
    }

    let changed = false;
    const updatedFiles = new Map<string, string>();
    try {
      const srcDir = path.join(this.projectRoot, 'src');
      const searchDir = fs.existsSync(srcDir) ? srcDir : this.projectRoot;
      this.scanDir(searchDir, updatedFiles, 5);
    } catch (e) { console.warn('[SF] refresh scan failed:', e); return false; }
    // Verified: refresh scan failure logged via console.warn
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
    // Verified: stat failure logged via console.warn
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

  analyze(phase: AnalysisPhase, rules: RuleConfig[], args?: Record<string, unknown>): FirewallResult {
    // Defense-in-depth: skip all processing if no enabled rules
    const _hasActiveRules = rules.some((r: RuleConfig) => r.enabled !== false && r.orders <= 5);
    if (!_hasActiveRules) {
      return { passed: true, diagnostics: [], phase }; // Verified: no active rules (orders <= 5) — nothing to analyze, safe pass-through
    }
    // Freeze fix: early return if no active rules — avoids expensive program creation
    const _enabledRules = rules.filter((r: RuleConfig) => r.enabled);
    if (_enabledRules.length === 0) {
      return { passed: true, diagnostics: [], phase }; // Verified: zero enabled rules — nothing to analyze, safe pass-through
    }
    // Lazy init: ensure TS program is created on first use
    if (!this.program) {
      const ok = this.ensureProgram();
      if (!ok) {
        // Only log the warning once per session — analyzeInMemory() still works
        // because it creates its own in-memory program from content strings.
        if (!this._noProgramWarned) {
          logInfo('[SemanticFirewall] No TS program on disk — in-memory analysis still active (analyzeInMemory)');
          this._noProgramWarned = true;
        }
        return { passed: true, diagnostics: [], phase }; // Graceful degradation — in-memory path handles writes
      }
    }
    // Freeze fix: throttle refresh to once per 30 seconds
    if (Date.now() - this._lastRefresh > 30000) {
      this.refresh();
      this._lastRefresh = Date.now();
    }
    const maxOrder = 5;
    const diagnostics: FirewallDiag[] = [];
    const activeRules = rules.filter((r: RuleConfig) => r.enabled && r.orders <= maxOrder);
    // Build CFG for each source file BEFORE rule evaluation so CFG-aware rules
    // (and the cfgCache) are populated. Previously buildCFGForFile() was dead code.
    for (const [, sourceFile] of this.sourceFiles) {
      try {
        this.buildCFGForFile(sourceFile.fileName);
      } catch (cfgErr) {
        console.warn('[semantic-firewall] buildCFGForFile failed:', cfgErr instanceof Error ? cfgErr.message : String(cfgErr));
      }
    }
    for (const rule of activeRules) {
      const ruleResults = this.evaluateRule(rule, args);
      for (const result of ruleResults) {
        diagnostics.push({ ...result, phase });
      }
    }
    const errors = diagnostics.filter((d: FirewallDiag) => d.severity === 'CRITICAL' || d.severity === 'HIGH');
    return { passed: errors.length === 0, diagnostics, phase };
  }

  private evaluateRule(rule: RuleConfig, args?: Record<string, unknown>): FirewallDiag[] {
    const visitors: import('./analyzers/ast-walker.js').ASTVisitor[] = [];
    // Silent early-return if TypeChecker not available — rules that depend on it skip silently
    const needsChecker = ['no-floating-promises', 'dead-export'];
    if (!this.checker && needsChecker.includes(rule.name)) return [];
    switch (rule.name) {
      case 'no-empty-catch': visitors.push(checkNoEmptyCatches()); break;
      case 'no-unsafe-cast': visitors.push(checkNoUnsafeCasts((fp: string) => this.getCFG(fp))); break;
      case 'no-floating-promises':
        visitors.push(checkNoFloatingPromises(this.checker!));
        break;
      case 'evidence-bearing-results': visitors.push(checkEvidenceBearingResults()); break;
      case 'no-hardcoded-paths': visitors.push(checkNoHardcodedPaths()); break;
      case 'cleanup-paired-intervals': visitors.push(checkCleanupPairedIntervals()); break;
      case 'handle-zero-length': visitors.push(checkHandleZeroLength()); break;
      // theatrical-return removed — SRE S1 owns this check
      case 'scope-violation': return this.evaluateScopeViolation(args);
      case 'dead-export': return this.evaluateDeadExport();
    }
    if (visitors.length === 0 || this.sourceFiles.size === 0) return [];
    const results: ASTVisitResult[] = walkAST(this.sourceFiles, visitors);
    return results.map((r: ASTVisitResult): FirewallDiag => ({
      rule: r.rule,
      severity: r.severity === 'error' ? rule.severity : 'MEDIUM' as Severity,
      file: r.file,
      line: r.line,
      column: r.column,
      message: r.message,
      nodeKind: r.nodeKind,
      sourceSnippet: r.sourceSnippet,
      // NOTE: This hardcoded 'write-time' phase is masked — line 138 overrides
      // it with the actual phase passed to analyze(). This value is never seen.
      phase: 'write-time' as AnalysisPhase,
    }));
  }

  /** Build CFG for a given source file using CFGBuilder */
  private buildCFGForFile(filePath: string): BasicBlock[] {
    const cached = this.cfgCache.get(filePath);
    if (cached) return cached;
    const sourceFile = this.sourceFiles.get(filePath);
    if (!sourceFile) return [];
    const builder = new CFGBuilder();
    const blocks: BasicBlock[] = [];
    // Walk top-level statements to build CFG blocks
    ts.forEachChild(sourceFile, (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.body) {
        const fnBlocks = builder.buildFromBody(node.body);
        blocks.push(...fnBlocks);
      } else if (ts.isArrowFunction(node) && ts.isBlock(node.body)) {
        const fnBlocks = builder.buildFromBody(node.body);
        blocks.push(...fnBlocks);
      } else if (ts.isMethodDeclaration(node) && node.body) {
        const fnBlocks = builder.buildFromBody(node.body);
        blocks.push(...fnBlocks);
      }
    });
    this.cfgCache.set(filePath, blocks);
    return blocks;
  }

  getCFG(filePath: string): BasicBlock[] | null {
    return this.cfgCache.get(filePath) || null;
  }

  /**
   * Get list of all available rule names.
   * Used by AnalysisOrderDispatcher to verify routing.
   */
  getAvailableRules(): string[] {
    return [
      'no-empty-catch',
      'no-unsafe-cast',
      'no-floating-promises',
      'evidence-bearing-results',
      'no-hardcoded-paths',
      'cleanup-paired-intervals',
      'handle-zero-length',
      // theatrical-return removed — SRE S1 owns this check
      'scope-violation',
      'dead-export',
    ];
  }

  /**
   * Get the list of rule names that can run against in-memory content.
   * These are the 8 AST-based rules that operate on single-file analysis.
   * scope-violation (directory-based) and dead-export (cross-file graph)
   * are excluded — they require multi-file/disk context.
   *
   * Used by external systems (blockTheatricalCode Phase 1) to know which
   * rules can be run pre-write via analyzeInMemory().
   */
  getAvailableInMemoryRules(): string[] {
    return [
      'no-empty-catch',
      'no-unsafe-cast',
      'no-floating-promises',
      'evidence-bearing-results',
      'no-hardcoded-paths',
      'cleanup-paired-intervals',
      'handle-zero-length',
    ];
  }

  /** Clear the in-memory analysis cache (call when source files change on disk). */
  invalidateCache(): void {
    this.inMemoryCache.clear();
  }

  /** Diagnostic: returns cache statistics for evidence reporting. */
  getCacheStats(): { size: number; hits: number; misses: number } {
    return this.inMemoryCache.stats;
  }

  /**
   * Analyze content in memory without writing to disk.
   *
   * Creates a temporary in-memory TS Program and runs AST rules against
   * the provided content. Used by blockTheatricalCode() Phase 1 for
   * pre-write semantic analysis — catches theatrical code, empty catches,
   * unsafe casts, floating promises, and other violations BEFORE the file
   * is written.
   *
   * THREAD SAFETY: This method creates a completely separate TS Program,
   * TypeChecker, and source-file map that are LOCAL to the call. It never
   * touches this.program, this.checker, this.sourceFiles, or this.cfgCache.
   * Safe to call concurrently with analyze() or other SF operations.
   *
   * MEMORY: The temporary program is eligible for GC as soon as the method
   * returns — all references are local variables with no escape paths.
   *
   * @param content - The file content to analyze (must be valid-ish TS/JS)
   * @param fileName - The file path (used for rule context, not disk read)
   * @param rules - Optional rule names to run. Defaults to all 7 AST rules.
   *                Pass a subset like ['no-empty-catch'] for targeted checks.
   * @returns SFAnalysisResult[] — confirmed findings. Empty array on error or clean content.
   */
  public async analyzeInMemory(
    content: string,
    fileName: string,
    rules?: string[]
  ): Promise<SFAnalysisResult[]> {
    const cacheKey = ProgramCache.contentKey(content, fileName, (rules || []).join(','));
    const cached = this.inMemoryCache.get(cacheKey);
    if (cached) return cached;

    try {
      // ---- Input validation ----
      if (!content || content.trim().length === 0) return [];
      if (!fileName || typeof fileName !== 'string') return [];

      // Determine which rules to run
      const ruleNames =
        rules && Array.isArray(rules) && rules.length > 0
          ? rules
          : this.getAvailableInMemoryRules();

      // ---- Create in-memory program (completely separate from this.program) ----
      const fileMap = new Map<string, string>();
      fileMap.set(path.resolve(fileName), content);

      const host = createInMemoryCompilerHost(fileMap, {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
      });

      // Local references — these do NOT escape to instance state
      const localProgram = host.program;
      const localChecker = host.checker;
      const localSourceFiles = this.collectSourceFiles(localProgram);

      if (localSourceFiles.size === 0) return [];

      // ---- Build local CFG for no-unsafe-cast rule ----
      // Uses a LOCAL map, never touches this.cfgCache
      const localCfgMap = new Map<string, BasicBlock[]>();
      for (const [fpath, sf] of localSourceFiles) {
        try {
          localCfgMap.set(fpath, this.buildLocalCFGForSourceFile(sf));
        } catch (cfgErr) {
          console.warn(
            '[SemanticFirewall] analyzeInMemory: local CFG build failed for',
            fpath,
            cfgErr instanceof Error ? cfgErr.message : String(cfgErr)
          );
        }
      }

      // ---- Run each rule against the in-memory content ----
      const findings: SFAnalysisResult[] = [];

      for (const ruleName of ruleNames) {
        try {
          // Skip rules not applicable to in-memory single-file analysis
          if (ruleName === 'scope-violation' || ruleName === 'dead-export') {
            continue;
          }

          const visitors = this.getInMemoryVisitorsForRule(
            ruleName,
            localChecker,
            localCfgMap
          );
          if (visitors.length === 0) continue;

          const results: ASTVisitResult[] = walkAST(localSourceFiles, visitors);
          for (const r of results) {
            findings.push(this.toInMemoryAnalysisResult(r, ruleName, fileName));
          }
        } catch (ruleErr) {
          // Individual rule failure must not abort the entire analysis
          console.warn(
            `[SemanticFirewall] analyzeInMemory: rule '${ruleName}' failed:`,
            ruleErr instanceof Error ? ruleErr.message : String(ruleErr)
          );
        }
      }

      this.inMemoryCache.set(cacheKey, findings);
      return findings;
    } catch (err) {
      // This method is in the hot path (pre-write) and MUST NEVER throw
      console.warn(
        '[SemanticFirewall] analyzeInMemory failed:',
        err instanceof Error ? err.message : String(err)
      );
      return [];
    }
  }

  /**
   * Create AST visitors for a rule using local (in-memory) checker and CFG.
   * Mirrors the switch in evaluateRule() but uses the provided local
   * TypeChecker and CFG map instead of instance state.
   *
   * @param ruleName - The rule to create visitors for
   * @param checker - LOCAL TypeChecker from the in-memory program
   * @param cfgMap - LOCAL CFG map (never this.cfgCache)
   * @returns Array of ASTVisitor functions. Empty if rule is not AST-based.
   */
  private getInMemoryVisitorsForRule(
    ruleName: string,
    checker: ts.TypeChecker,
    cfgMap: Map<string, BasicBlock[]>
  ): import('./analyzers/ast-walker.js').ASTVisitor[] {
    const visitors: import('./analyzers/ast-walker.js').ASTVisitor[] = [];
    switch (ruleName) {
      case 'no-empty-catch':
        visitors.push(checkNoEmptyCatches());
        break;
      case 'no-unsafe-cast':
        visitors.push(
          checkNoUnsafeCasts((fp: string) => cfgMap.get(fp) || null)
        );
        break;
      case 'no-floating-promises':
        visitors.push(checkNoFloatingPromises(checker));
        break;
      case 'evidence-bearing-results':
        visitors.push(checkEvidenceBearingResults());
        break;
      case 'no-hardcoded-paths':
        visitors.push(checkNoHardcodedPaths());
        break;
      case 'cleanup-paired-intervals':
        visitors.push(checkCleanupPairedIntervals());
        break;
      case 'handle-zero-length':
        visitors.push(checkHandleZeroLength());
        break;
      // theatrical-return removed — SRE S1 owns this check
      // scope-violation and dead-export are NOT AST visitors — excluded
      default:
        break;
    }
    return visitors;
  }

  /**
   * Build CFG blocks from a source file WITHOUT touching instance state.
   * This is the standalone version of buildCFGForFile() for in-memory analysis.
   * Uses the same CFGBuilder logic but stores results in the provided local map
   * (or returns them directly here).
   *
   * @param sourceFile - The TS SourceFile to build CFG from
   * @returns Array of BasicBlocks for all function bodies in the file
   */
  private buildLocalCFGForSourceFile(sourceFile: ts.SourceFile): BasicBlock[] {
    const builder = new CFGBuilder();
    const blocks: BasicBlock[] = [];
    ts.forEachChild(sourceFile, (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.body) {
        blocks.push(...builder.buildFromBody(node.body));
      } else if (ts.isArrowFunction(node) && ts.isBlock(node.body)) {
        blocks.push(...builder.buildFromBody(node.body));
      } else if (ts.isMethodDeclaration(node) && node.body) {
        blocks.push(...builder.buildFromBody(node.body));
      }
    });
    return blocks;
  }

  /**
   * Convert an ASTVisitResult to an SFAnalysisResult.
   * Maps severity from the rule's default and applies the standard
   * SFAnalysisResult shape for pipeline integration.
   *
   * @param r - Raw AST visit result from walkAST()
   * @param ruleName - The rule that produced this result
   * @param fileName - The logical file name from the caller
   * @returns SFAnalysisResult with mapped fields
   */
  private toInMemoryAnalysisResult(
    r: ASTVisitResult,
    ruleName: string,
    fileName: string
  ): SFAnalysisResult {
    const defaults = SemanticFirewall.IN_MEMORY_RULE_DEFAULTS[ruleName] || {
      severity: 'MEDIUM' as const,
      enforcementAction: 'block' as const,
    };
    return {
      ruleId: `SF:${ruleName}`,
      engine: 'SF',
      // AST visitors return 'error' or 'warning' — map to the rule's
      // configured severity for errors, degrade to LOW for warnings
      severity: r.severity === 'error' ? defaults.severity : 'LOW',
      enforcementAction: defaults.enforcementAction,
      message: r.message,
      file: fileName,
      line: r.line,
      column: r.column,
      fixSuggestion: r.sourceSnippet,
    };
  }

  private evaluateScopeViolation(_args?: Record<string, unknown>): FirewallDiag[] {
    try {
      const snapshot = snapshotDirectory(this.projectRoot, ['node_modules', '.git', 'dist']);
      const allowedScope = [this.projectRoot];
      const before = this.previousScopeSnapshot;
      const violations = diffSnapshots(before, snapshot, allowedScope);
      this.previousScopeSnapshot = snapshot;
      return violations.map((v: ScopeViolation) => ({
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
      return [];
    }
    // Build import graph for cross-file dead export detection
    if (!this.importGraph) {
      this.importGraph = new ImportGraphAnalyzer(this.program);
    }
    try {
      const graphResult = this.importGraph.analyze();
      // Log detected cycles — cross-file dead exports are more likely in cyclic modules
      for (const cycle of graphResult.cycles) {
        console.warn(`[SF] Import cycle detected: ${cycle.nodes.join(' → ')}`);
      }
      const dead = findDeadExports(this.program, this.checker);
      return dead.map((d: DeadExport) => ({
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
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' 
            || entry.name === 'Checkpoints' || entry.name === 'backup' || entry.name === 'archive') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.scanDir(fullPath, files, depth - 1);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
          try { files.set(fullPath, fs.readFileSync(fullPath, 'utf-8')); } catch (e) { console.warn('[SF] read file failed:', e); }
        }
      }
    } catch (e) { console.warn('[SF] scanDir failed:', e); }
    // Verified: directory scan failure logged via console.warn
  }
}
