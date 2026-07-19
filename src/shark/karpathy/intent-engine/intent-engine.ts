/**
 * IntentEngine — the ICE main orchestrator.
 * =================================================================
 *
 * Answers: "What is the agent TRYING to do, and is this action APPROPRIATE for
 * the current gate?"
 *
 * Two paths:
 *   • WRITE TOOLS (write/edit/patch) → FULL AST path:
 *       classify → frame-match → build CodeConstruct tree (REAL TS AST) →
 *       run I-1..I-5 rules → confidence → blind spots → action.
 *   • NON-WRITE TOOLS (bash/read/glob/...) → FAST path:
 *       classify by tool name only (no AST parse) → frame-match → rules →
 *       confidence → action. Keeps the common case under a few ms.
 *
 * The engine is pure and deterministic: no LLM, no network. Every decision is
 * traceable through the FrameMatch evidence chain and the IntentFinding list.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  BlindSpotReport,
  CodeConstruct,
  ConfidenceInput,
  FrameMatch,
  GateType,
  InferredIntent,
  IntentAction,
  IntentCategory,
  IntentFinding,
  IntentReport,
  OperationType,
} from './intent-types.js';
import { CodeConstructBuilder } from './construct-builder.js';
import { FrameMatcher } from './frame-matcher.js';
import {
  ConfidenceCalculator,
  IntentRuleEngine,
  compileBlindSpots,
  type RuleContext,
} from './intent-rules.js';
import { createInMemoryIceEngine } from './ice-compiler-host.js';
import { ProgramCache } from '../../../shared/pipeline/program-cache.js';

// ─── Tool name → IntentCategory ────────────────────────────────────────────

const TOOL_TO_CATEGORY: ReadonlyMap<string, IntentCategory> = new Map<
  string,
  IntentCategory
>([
  ['write', 'WRITE_FILE'],
  ['write_file', 'WRITE_FILE'],
  ['edit', 'EDIT_FILE'],
  ['patch', 'EDIT_FILE'],
  ['replace', 'EDIT_FILE'],
  ['bash', 'BASH'],
  ['shell', 'BASH'],
  ['exec', 'BASH'],
  ['run', 'BASH'],
  ['build', 'BUILD'],
  ['test', 'TEST'],
  ['shark-test-runner', 'TEST'],
  ['verify', 'VERIFY'],
  ['shark-run-trident', 'EXTERNAL_AUDIT'],
  ['audit', 'EXTERNAL_AUDIT'],
  ['shark-audit', 'EXTERNAL_AUDIT'],
  ['shark-gate', 'GATE_ADVANCE'],
  ['gate', 'GATE_ADVANCE'],
  ['spawn', 'CONTAINER_SPAWN'],
  ['shark-spawn-container', 'CONTAINER_SPAWN'],
  ['browser', 'BROWSER_ACTION'],
  ['shark-browser', 'BROWSER_ACTION'],
  ['vision', 'VISION_CHECK'],
  ['shark-vision', 'VISION_CHECK'],
  ['read', 'READ_EXPLORE'],
  ['glob', 'READ_EXPLORE'],
  ['grep', 'READ_EXPLORE'],
  ['ls', 'READ_EXPLORE'],
  ['find', 'READ_EXPLORE'],
  ['explore', 'READ_EXPLORE'],
  ['webfetch', 'WEB_FETCH'],
  ['fetch', 'WEB_FETCH'],
  ['checkpoint', 'CHECKPOINT'],
  ['shark-checkpoint', 'CHECKPOINT'],
  ['evidence', 'EVIDENCE_QUERY'],
  ['shark-evidence', 'EVIDENCE_QUERY'],
  ['task', 'TASK_DISPATCH'],
  ['compact', 'COMPACT'],
]);

/** Tools that modify files on disk → full AST analysis path. */
const WRITE_TOOLS: ReadonlySet<string> = new Set([
  'write', 'write_file', 'edit', 'patch', 'replace',
]);

// ─── File classification regexes ───────────────────────────────────────────

const SOURCE_CODE_RE = /\.(ts|js|tsx|jsx|mjs|cjs)$/i;
const TEST_FILE_RE = /\.(test|spec)\.(ts|js|tsx|jsx|mjs|cjs)$/i;
const SPEC_FILE_RE = /\.(md|markdown|json|yaml|yml)$/i;
const SPEC_NAME_RE = /SPEC/i;
const EVIDENCE_FILE_RE = /(evidence|ContainerTestResult)/i;

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizeGate(gate: unknown): GateType {
  if (typeof gate !== 'string') return 'IDLE';
  const upper = gate.toUpperCase().trim();
  const valid: GateType[] = ['PLAN', 'BUILD', 'VERIFY', 'TEST', 'AUDIT', 'DELIVERY', 'IDLE'];
  return (valid as string[]).includes(upper) ? (upper as GateType) : 'IDLE';
}

function classifyFileFlags(fileName: string): {
  isSourceCode: boolean;
  isTestFile: boolean;
  isSpecFile: boolean;
  isEvidenceFile: boolean;
} {
  return {
    isSourceCode: SOURCE_CODE_RE.test(fileName) && !TEST_FILE_RE.test(fileName),
    isTestFile: TEST_FILE_RE.test(fileName),
    isSpecFile: SPEC_FILE_RE.test(fileName) || SPEC_NAME_RE.test(fileName),
    isEvidenceFile: EVIDENCE_FILE_RE.test(fileName),
  };
}

function categoryToOperation(category: IntentCategory): OperationType {
  switch (category) {
    case 'WRITE_FILE':
    case 'EDIT_FILE':
      return 'WRITE';
    case 'READ_EXPLORE':
    case 'WEB_FETCH':
    case 'EVIDENCE_QUERY':
      return 'READ';
    case 'BASH':
    case 'BUILD':
    case 'TEST':
    case 'CONTAINER_SPAWN':
    case 'TASK_DISPATCH':
    case 'COMPACT':
      return 'EXECUTE';
    case 'VERIFY':
    case 'EXTERNAL_AUDIT':
    case 'VISION_CHECK':
    case 'GATE_ADVANCE':
      return 'VERIFY';
    case 'CHECKPOINT':
      return 'MANAGE';
    default:
      return 'UNKNOWN';
  }
}

function describeIntent(
  category: IntentCategory,
  target: string,
  gate: GateType,
): string {
  const verbs: Record<IntentCategory, string> = {
    WRITE_FILE: 'WRITE file',
    EDIT_FILE: 'EDIT file',
    BASH: 'EXECUTE shell command',
    TEST: 'RUN tests',
    BUILD: 'RUN build',
    VERIFY: 'VERIFY correctness',
    GATE_ADVANCE: 'ADVANCE gate',
    CONTAINER_SPAWN: 'SPAWN container',
    EXTERNAL_AUDIT: 'RUN external audit',
    BROWSER_ACTION: 'PERFORM browser action',
    VISION_CHECK: 'CHECK vision',
    READ_EXPLORE: 'READ/explore',
    WEB_FETCH: 'FETCH web content',
    CHECKPOINT: 'CREATE checkpoint',
    EVIDENCE_QUERY: 'QUERY evidence',
    TASK_DISPATCH: 'DISPATCH task',
    COMPACT: 'COMPACT context',
    UNKNOWN: 'UNKNOWN action',
  };
  return `${verbs[category]} "${target}" during ${gate} gate`;
}

// ─── IntentEngine ──────────────────────────────────────────────────────────

export class IntentEngine {
  private readonly workspaceDir: string;
  private readonly builder: CodeConstructBuilder;
  private readonly matcher: FrameMatcher;
  private readonly rules: IntentRuleEngine;
  private readonly confCalc: ConfidenceCalculator;
  private readonly evidenceDir: string;
  private readonly auditCache: ProgramCache<IntentReport>;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
    this.evidenceDir = path.join(workspaceDir, '.shark', 'intent-evidence');
    this.auditCache = new ProgramCache<IntentReport>();
    this.builder = new CodeConstructBuilder();
    this.matcher = new FrameMatcher();
    this.rules = new IntentRuleEngine();
    this.confCalc = new ConfidenceCalculator();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Audit a tool call (or raw file content) against the current gate.
   *
   * @param content  - file content to analyze (required for write tools).
   * @param fileName - target file path.
   * @param gate     - current gate phase.
   * @param toolName - optional tool name; when absent, treated as a write.
   * @param args     - optional tool arguments for frame matching.
   */
  async auditInMemory(
    content: string,
    fileName: string,
    gate: string,
    toolName?: string,
    args?: unknown,
  ): Promise<IntentReport> {
    const cacheKey = ProgramCache.contentKey(content, fileName, gate);
    const cached = this.auditCache.get(cacheKey);
    if (cached) return cached;

    const normalizedGate = normalizeGate(gate);
    const safeContent = typeof content === 'string' ? content : '';
    const safeFile = typeof fileName === 'string' ? fileName : '<unknown>';
    const tool = typeof toolName === 'string' ? toolName.toLowerCase().trim() : '';
    const isWrite = this.isWriteTool(tool);

    // Phase 1: classify intent
    const intent = isWrite && tool
      ? this.classifyToolCall(tool, safeFile, normalizedGate)
      : tool
        ? this.classifyToolCall(tool, safeFile, normalizedGate)
        : this.classifyFromFileName(safeFile, normalizedGate);

    // Phase 2: frame matching
    const frameMatch: FrameMatch = this.matcher.match(
      tool || 'unknown',
      args ?? {},
      normalizedGate,
    );

    // Phase 3: AST analysis (write tools only) or fast path.
    // Build the parent→child tree, then FLATTEN it so rules + blind-spot
    // analysis see nested constructs (e.g. a call_expression inside a
    // variable_declaration, or eval() inside a const initializer).
    //
    // M10: ICE now creates its own ts.Program (Law 8: Peer Not Puppet) for
    // genuine TypeChecker access, instead of parser-only createSourceFile.
    let constructs: CodeConstruct[] = [];
    let typeCheckerAvailable = false;
    if ((isWrite || !tool) && safeContent.length > 0) {
      try {
        const engine = createInMemoryIceEngine([
          { filename: safeFile, content: safeContent },
        ]);
        const sourceFile = engine.program.getSourceFile(safeFile);
        if (sourceFile) {
          const tree = this.builder.build(sourceFile, safeFile, engine.checker);
          constructs = this.builder.collectAll(tree);
          // Genuinely true now: ICE has a real TypeChecker from its own Program.
          typeCheckerAvailable =
            typeof engine.checker.getTypeAtLocation === 'function';
        }
        engine.dispose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[IntentEngine] ICE engine analysis failed for "${safeFile}": ${msg}`,
        );
      }
    }

    // Phase 4: run rules I-1..I-3, I-5
    const ruleCtx: RuleContext = {
      constructs,
      intent,
      gate: normalizedGate,
      fileName: safeFile,
      workspaceDir: this.workspaceDir,
      frameMatch,
      typeCheckerAvailable,
    };
    const findings = this.rules.runAll(ruleCtx);

    // Phase 5: confidence (I-4) — folds gate findings into gateAlignment
    const confInput: ConfidenceInput = {
      frameMatch,
      inferredIntent: intent,
      gateFindings: findings,
      typeCheckerAvailable,
      constructCount: constructs.length,
    };
    const confidence = this.confCalc.calculate(confInput);

    // Phase 6: blind spots (I-5)
    const blindSpots: BlindSpotReport = compileBlindSpots(
      constructs,
      typeCheckerAvailable,
    );

    // Phase 7: gate compliance + action
    const gateViolations = this.extractGateViolations(findings);
    /** @internal Used by determineAction() and returned in analysis result */
    const gateCompliant = !gateViolations.some(
      (f: IntentFinding) => f.severity === 'CRITICAL' || f.severity === 'HIGH',
    );
    const action = this.determineAction(findings, confidence, gateCompliant);

    const report: IntentReport = {
      overallPassed: action === 'ALLOW' || action === 'ALLOW_WITH_WARNING',
      confidence,
      intent,
      frameMatch,
      gateCompliant,
      gateViolations,
      findings,
      blindSpots,
      action,
      analyzedAt: new Date().toISOString(),
      totalConstructsAnalyzed: constructs.length,
    };

    this.writeEvidence(report);
    this.auditCache.set(cacheKey, report);
    return report;
  }

  /**
   * Write an intent report evidence artifact to disk (best-effort).
   * M9: ICE writes to its own per-engine evidence directory.
   */
  private writeEvidence(report: IntentReport): void {
    try {
      fs.mkdirSync(this.evidenceDir, { recursive: true });
      const evidencePath = path.join(
        this.evidenceDir,
        `INTENT_REPORT_${Date.now()}.json`,
      );
      fs.writeFileSync(
        evidencePath,
        JSON.stringify(
          {
            ...report,
            engineVersion: 'ICE-v5.0',
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    } catch {
      // Evidence writing is best-effort
    }
  }

  // ─── Intent classification ───────────────────────────────────────────────

  private classifyToolCall(
    toolName: string,
    fileName: string,
    gate: GateType,
  ): InferredIntent {
    const category = TOOL_TO_CATEGORY.get(toolName) ?? 'UNKNOWN';
    const flags = classifyFileFlags(fileName);

    // Refine WRITE_FILE vs EDIT_FILE when the tool is generic
    let resolved = category;
    if (category === 'WRITE_FILE' && /edit/i.test(toolName)) resolved = 'EDIT_FILE';

    return {
      category: resolved,
      operationType: categoryToOperation(resolved),
      description: describeIntent(resolved, fileName, gate),
      targetFile: fileName,
      gateContext: gate,
      isSourceCode: flags.isSourceCode,
      isTestFile: flags.isTestFile,
      isSpecFile: flags.isSpecFile,
      isEvidenceFile: flags.isEvidenceFile,
    };
  }

  private classifyFromFileName(
    fileName: string,
    gate: GateType,
  ): InferredIntent {
    const flags = classifyFileFlags(fileName);
    let category: IntentCategory = 'UNKNOWN';
    if (flags.isSpecFile && gate === 'PLAN') category = 'WRITE_FILE';
    else if (flags.isSourceCode) category = 'WRITE_FILE';
    else if (flags.isTestFile) category = 'WRITE_FILE';
    else if (flags.isSpecFile) category = 'WRITE_FILE';
    else if (flags.isEvidenceFile) category = 'WRITE_FILE';

    return {
      category,
      operationType: categoryToOperation(category),
      description: describeIntent(category, fileName, gate),
      targetFile: fileName,
      gateContext: gate,
      ...flags,
    };
  }

  // ─── Gate compliance ─────────────────────────────────────────────────────

  /** Findings that represent gate-policy violations (I-1-*, I-2-*). */
  private extractGateViolations(findings: IntentFinding[]): IntentFinding[] {
    return findings.filter(
      (f: IntentFinding) => f.ruleId.startsWith('I-1') || f.ruleId.startsWith('I-2'),
    );
  }

  // ─── Action determination ────────────────────────────────────────────────

  /**
   * Map findings + confidence + gateCompliance to an enforcement action.
   *
   *   • CRITICAL gate violation (e.g. I-2-SRC-DURING-PLAN):
   *       confidence >= 0.40 → BLOCK  (we know enough to deny decisively)
   *       else               → ESCALATE
   *   • HIGH gate violation (e.g. I-2-TEST-UTILS-IN-BUILD):
   *       confidence >= 0.70 → BLOCK
   *       else               → ESCALATE
   *   • confidence < 0.40                      → ESCALATE (don't know enough)
   *   • MEDIUM/LOW findings present            → ALLOW_WITH_WARNING
   *   • otherwise                              → ALLOW
   *
   * CRITICAL violations use the lower 0.40 floor because they are explicit,
   * high-certainty policy breaches — the engine must block them as soon as it
   * understands the intent, rather than waiting for a confidence level the
   * violation itself cannot reach.
   */
  private determineAction(
    findings: IntentFinding[],
    confidence: number,
    gateCompliant: boolean,
  ): IntentAction {
    if (!gateCompliant) {
      const hasCritical = findings.some((f: IntentFinding) => f.severity === 'CRITICAL');
      if (hasCritical) {
        return confidence >= 0.40 ? 'BLOCK' : 'ESCALATE';
      }
      return confidence >= 0.70 ? 'BLOCK' : 'ESCALATE';
    }
    if (confidence < 0.40) return 'ESCALATE';
    const hasMediumOrLow = findings.some(
      (f: IntentFinding) => f.severity === 'MEDIUM' || f.severity === 'LOW',
    );
    return hasMediumOrLow ? 'ALLOW_WITH_WARNING' : 'ALLOW';
  }

  // ─── Utilities ───────────────────────────────────────────────────────────

  /** Clear the in-memory audit cache (call when source files change on disk). */
  invalidateCache(): void {
    this.auditCache.clear();
  }

  /** Diagnostic: returns cache statistics for evidence reporting. */
  getCacheStats(): { size: number; hits: number; misses: number } {
    return this.auditCache.stats;
  }

  /** True when the tool modifies files on disk (full AST path applies). */
  isWriteTool(toolName: string): boolean {
    return WRITE_TOOLS.has(toolName.toLowerCase().trim());
  }

  /** Expose the underlying FrameMatcher (for tests / external wiring). */
  getFrameMatcher(): FrameMatcher {
    return this.matcher;
  }

  /** Expose the underlying CodeConstructBuilder. */
  getConstructBuilder(): CodeConstructBuilder {
    return this.builder;
  }
}
