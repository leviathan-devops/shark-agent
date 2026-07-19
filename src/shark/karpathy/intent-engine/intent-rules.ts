/**
 * Intent Rules — I-1 through I-5 + ConfidenceCalculator + blind-spot compiler.
 * ===========================================================================
 *
 * Implements the five intent rules that turn a CodeConstruct tree + FrameMatch
 * + gate context into a list of IntentFindings, a confidence score, and a
 * transparent BlindSpotReport.
 *
 *  I-1-KEYWORD-MISMATCH    — enforcement-named function that cannot fail (HIGH)
 *  I-1-INAPPROPRIATE-IMPORT— fs write imports during PLAN gate (HIGH)
 *  I-2-SRC-DURING-PLAN     — writing source code during PLAN (CRITICAL) ★
 *  I-2-TEST-UTILS-IN-BUILD — test framework imports in production src (HIGH)
 *  I-2-SPEC-DURING-BUILD   — writing spec files during BUILD (LOW)
 *  I-3-FRAME-MATCH         — report FrameMatcher match quality (INFO)
 *  I-4-CONFIDENCE          — evidence-grounded confidence score (computed)
 *  I-5-BLIND-SPOT          — transparent blind-spot report (compiled)
 *
 * ★ I-2-SRC-DURING-PLAN is the MOST CRITICAL rule: it must block any source
 *   write during the PLAN gate.
 */

import type {
  BlindSpotReport,
  CodeConstruct,
  ConfidenceInput,
  FrameMatch,
  FrameSlot,
  GateType,
  InferredIntent,
  IntentFinding,
} from './intent-types.js';
import * as path from 'node:path';

// ─── Rule context ──────────────────────────────────────────────────────────

export interface RuleContext {
  readonly constructs: CodeConstruct[];
  readonly intent: InferredIntent;
  readonly gate: GateType;
  readonly fileName: string;
  readonly workspaceDir: string;
  readonly frameMatch: FrameMatch;
  readonly typeCheckerAvailable: boolean;
}

// ─── I-4: ConfidenceCalculator ─────────────────────────────────────────────

/**
 * Evidence-grounded confidence scorer (Bible section 2).
 *
 *   confidence = clamp(
 *     slotFillRatio     * 0.35 +
 *     frameSpecificity  * 0.25 +
 *     gateAlignment     * 0.25 +
 *     evidenceGround    * 0.15,
 *     0.30, 1.00
 *   )
 *
 * Confidence is NEVER guessed — every factor is computed from observable
 * signals, and the result is clamped so we never claim zero knowledge.
 */
export class ConfidenceCalculator {
  static readonly W_SLOT = 0.35;
  static readonly W_SPECIFICITY = 0.25;
  static readonly W_GATE = 0.25;
  static readonly W_EVIDENCE = 0.15;
  static readonly MIN_CONFIDENCE = 0.30;
  static readonly MAX_CONFIDENCE = 1.00;

  calculate(input: ConfidenceInput): number {
    const slotFillRatio = this.computeSlotFillRatio(input.frameMatch);
    const frameSpecificity = this.computeFrameSpecificity(input.frameMatch);
    const gateAlignment = this.computeGateAlignment(
      input.frameMatch,
      input.gateFindings,
    );
    const evidenceGround = this.computeEvidenceGround(
      input.typeCheckerAvailable,
      input.frameMatch,
    );

    const raw =
      slotFillRatio * ConfidenceCalculator.W_SLOT +
      frameSpecificity * ConfidenceCalculator.W_SPECIFICITY +
      gateAlignment * ConfidenceCalculator.W_GATE +
      evidenceGround * ConfidenceCalculator.W_EVIDENCE;

    return this.clamp(
      raw,
      ConfidenceCalculator.MIN_CONFIDENCE,
      ConfidenceCalculator.MAX_CONFIDENCE,
    );
  }

  /** Required slots filled / total required. Most important factor (35%). */
  private computeSlotFillRatio(frameMatch: FrameMatch): number {
    if (!frameMatch.frame) return 0.0;
    /** @internal Used by slot fill ratio — filters required slots for ratio calc */
    const required = frameMatch.slots.filter((s: FrameSlot) => s.required);
    if (required.length === 0) return 1.0;
    /** @internal Used by slot fill ratio — counts filled required slots */
    const filled = required.filter((s: FrameSlot) => s.filled).length;
    return filled / required.length;
  }

  /** specificity = min(1.0, slotCount * 0.15). */
  private computeFrameSpecificity(frameMatch: FrameMatch): number {
    if (!frameMatch.frame) return 0.0;
    return Math.min(1.0, frameMatch.frame.slots.length * 0.15);
  }

  /**
   * Gate alignment measures CONFIDENCE IN THE GATE VERDICT, not appropriateness:
   *   • a frame with explicit allowedGates gives a definitive verdict (compliant
   *     or not) → alignment 1.0 (we are certain of our determination);
   *   • a frame with no allowedGates → ambiguous → 0.5.
   *
   * This decouples classification-certainty from appropriateness so that a
   * clear CRITICAL gate violation does not paradoxically lower our confidence
   * below the block threshold. (Appropriateness is handled separately by the
   * gateCompliant flag + the action determination.)
   */
  private computeGateAlignment(
    frameMatch: FrameMatch,
    _gateFindings: IntentFinding[],
  ): number {
    if (!frameMatch.frame) return 0.5;
    if (frameMatch.frame.allowedGates.length === 0) return 0.5;
    return 1.0;
  }

  /** Evidence ground: TypeChecker availability (+ evidence-count bonus). */
  private computeEvidenceGround(
    typeCheckerAvailable: boolean,
    frameMatch: FrameMatch,
  ): number {
    if (!typeCheckerAvailable) return 0.5;
    const evidenceCount = frameMatch.evidence.length;
    const boost = Math.min(0.3, evidenceCount * 0.1);
    return Math.min(1.0, 0.7 + boost);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

// ─── I-5: blind-spot compiler ──────────────────────────────────────────────

/**
 * Compile a BlindSpotReport from the construct tree + analysis signals.
 * Pillar 5: an analysis without a blind-spot report is incomplete.
 */
export function compileBlindSpots(
  constructs: CodeConstruct[],
  typeCheckerAvailable: boolean,
): BlindSpotReport {
  const limitations: string[] = [];

  if (!typeCheckerAvailable) {
    limitations.push(
      'TypeChecker was not available — type-based intent inference was ' +
        'skipped; only syntactic patterns were analyzed.',
    );
  }

  // Dynamic code detection (eval / new Function)
  const hasEval = constructs.some(
    (c: CodeConstruct) => c.kind === 'call_expression' && c.properties.calleeName === 'eval',
  );
  const hasNewFunction = constructs.some(
    (c: CodeConstruct) => c.kind === 'new_expression' && c.properties.calleeName === 'Function',
  );
  if (hasEval || hasNewFunction) {
    limitations.push(
      'Dynamic code execution detected (eval / new Function). Intent of ' +
        'dynamically generated code cannot be statically analyzed.',
    );
  }

  // External module imports (not analyzed)
  const externalModules: string[] = [];
  const seen = new Set<string>();
  for (const c of constructs) {
    if (c.kind === 'import' && c.properties.importSource) {
      const src = c.properties.importSource;
      if ((src.startsWith('@') || !src.startsWith('.')) && !seen.has(src)) {
        seen.add(src);
        externalModules.push(src);
      }
    }
  }
  if (externalModules.length > 0) {
    const preview = externalModules.slice(0, 5).join(', ');
    limitations.push(
      `${externalModules.length} external module(s) imported but not ` +
        `analyzed: ${preview}` +
        (externalModules.length > 5 ? '...' : ''),
    );
  }

  // Call-graph coverage estimation
  const callExpressions = constructs.filter((c: CodeConstruct) => c.kind === 'call_expression');
  const resolvedCalls = callExpressions.filter((c: CodeConstruct) => c.properties.calleeName);
  const callGraphCoverage =
    callExpressions.length > 0
      ? resolvedCalls.length / callExpressions.length
      : 1.0;

  const analysisDepth = determineAnalysisDepth(
    typeCheckerAvailable,
    constructs.length,
  );

  return {
    typeCheckerAvailable,
    callGraphCoverage,
    analysisDepth,
    unresolvedImports: [],
    externalModules,
    limitations,
    dynamicCode: hasEval || hasNewFunction,
    generatedCode: false,
  };
}

function determineAnalysisDepth(
  typeCheckerAvailable: boolean,
  constructCount: number,
): BlindSpotReport['analysisDepth'] {
  if (constructCount === 0) return 'regex_only';
  if (!typeCheckerAvailable) return 'ast_surface';
  return 'ast_with_typechecker';
}

// ─── I-5 helper: source markers for generated code ─────────────────────────

/** Detect generated-code markers in string-literal constructs. */
export function detectGeneratedCode(constructs: CodeConstruct[]): boolean {
  return constructs.some(
    (c: CodeConstruct) =>
      c.kind === 'string_literal' &&
      typeof c.properties.stringValue === 'string' &&
      (c.properties.stringValue.includes('sourceMappingURL') ||
        c.properties.stringValue.includes('auto-generated') ||
        c.properties.stringValue.includes('@generated')),
  );
}

// ─── IntentRuleEngine ──────────────────────────────────────────────────────

/**
 * IntentRuleEngine — runs I-1 through I-5 over a RuleContext.
 *
 * Usage:
 *   const engine = new IntentRuleEngine();
 *   const findings = engine.runAll(ctx);
 *   const confidence = new ConfidenceCalculator().calculate({...});
 *   const blindSpots = compileBlindSpots(ctx.constructs, ctx.typeCheckerAvailable);
 */
export class IntentRuleEngine {
  /**
   * Run every applicable rule and return the aggregated findings.
   * Gate-compliance findings (I-1, I-2) are returned first so the confidence
   * calculator can fold them into gateAlignment.
   */
  runAll(ctx: RuleContext): IntentFinding[] {
    const findings: IntentFinding[] = [];
    findings.push(...this.i1KeywordMismatch(ctx));
    findings.push(...this.i1InappropriateImport(ctx));
    findings.push(...this.i2SrcDuringPlan(ctx));
    findings.push(...this.i2TestUtilsInBuild(ctx));
    findings.push(...this.i2SpecDuringBuild(ctx));
    findings.push(...this.i3FrameMatch(ctx));
    findings.push(...this.i5BlindSpotFindings(ctx));
    return findings;
  }

  // ── I-1-KEYWORD-MISMATCH ─────────────────────────────────────────────────

  /**
   * A function named after an enforcement keyword (validate/check/verify/...)
   * that structurally cannot fail (no throw/reject/return false) AND that
   * returns a value → it is theatrical: it claims to enforce but cannot.
   */
  i1KeywordMismatch(ctx: RuleContext): IntentFinding[] {
    const findings: IntentFinding[] = [];
    for (const c of ctx.constructs) {
      if (c.kind !== 'function') continue;
      const p = c.properties;
      if (!p.isNamedAfterKeyword) continue;
      if (p.canFail) continue; // has a real failure path → OK
      if (!p.hasReturnStatement) continue; // nothing returned → not theatrical

      findings.push({
        ruleId: 'I-1-KEYWORD-MISMATCH',
        severity: 'HIGH',
        message:
          `Function "${c.name}" is named after an enforcement keyword but ` +
          `cannot fail (no throw/reject/return-false). It returns without any ` +
          `enforcement effect — this is theatrical validation.`,
        file: c.file,
        line: c.line,
        column: c.column,
        fixSuggestion:
          `Add a real failure path to "${c.name}" (throw, reject, or return a ` +
          `failure value) OR rename it to reflect what it actually does.`,
        intentCategory: ctx.intent.category,
        gateContext: ctx.gate,
        constructKind: c.kind,
        confidence: 0.8,
      });
    }
    return findings;
  }

  // ── I-1-INAPPROPRIATE-IMPORT ─────────────────────────────────────────────

  /**
   * Imports inappropriate for the current gate — primarily the filesystem
   * write module pulled in during the PLAN gate (no writes should happen yet).
   */
  i1InappropriateImport(ctx: RuleContext): IntentFinding[] {
    const findings: IntentFinding[] = [];
    if (ctx.gate !== 'PLAN') return findings;

    for (const c of ctx.constructs) {
      if (c.kind !== 'import') continue;
      const src = c.properties.importSource ?? '';
      if (src === 'fs' || src === 'node:fs' || src === 'fs/promises' || src === 'node:fs/promises') {
        findings.push({
          ruleId: 'I-1-INAPPROPRIATE-IMPORT',
          severity: 'HIGH',
          message:
            `Filesystem module "${src}" imported during the PLAN gate. No ` +
            `writes should occur during planning.`,
          file: c.file,
          line: c.line,
          column: c.column,
          fixSuggestion:
            `Defer filesystem imports to the BUILD gate, or perform the write ` +
            `through a tool rather than a direct fs call.`,
          intentCategory: ctx.intent.category,
          gateContext: ctx.gate,
          constructKind: c.kind,
          confidence: 0.7,
        });
      }
    }
    return findings;
  }

  // ── I-2-SRC-DURING-PLAN (★ MOST CRITICAL) ────────────────────────────────

  /**
   * Writing .ts/.js source files during the PLAN gate → CRITICAL.
   * This is the single most important rule: no source code may be authored
   * before a plan is approved.
   *
   * EXEMPTION: Files outside the workspace directory (e.g. /tmp/, /var/tmp/)
   * are not subject to gate enforcement. Gate rules only apply to project
   * source files; temporary/test files written outside the workspace can
   * proceed regardless of gate phase.
   */
  i2SrcDuringPlan(ctx: RuleContext): IntentFinding[] {
    if (ctx.gate !== 'PLAN') return [];
    if (!ctx.intent.isSourceCode) return [];

    // Skip gate enforcement for files outside the workspace
    const ws = ctx.workspaceDir
      ? path.resolve(ctx.workspaceDir)
      : '';
    if (ws) {
      const resolved = path.resolve(ctx.fileName);
      if (!resolved.startsWith(ws + path.sep) && resolved !== ws) {
        return []; // file is outside workspace — exempt from PLAN gate enforcement
      }
    }

    if (ctx.intent.isTestFile) return []; // tests are not "source" here

    return [
      {
        ruleId: 'I-2-SRC-DURING-PLAN',
        severity: 'CRITICAL',
        message:
          `Source file "${ctx.fileName}" is being written during the PLAN ` +
          `gate. Source authoring is forbidden until the plan is approved.`,
        file: ctx.fileName,
        line: 1,
        column: 1,
        fixSuggestion:
          `Move to the BUILD gate before writing source code, or write a ` +
          `specification (SPEC.md) instead during PLAN.`,
        intentCategory: ctx.intent.category,
        gateContext: ctx.gate,
        confidence: 0.95,
      },
    ];
  }

  // ── I-2-TEST-UTILS-IN-BUILD ──────────────────────────────────────────────

  /**
   * Test framework imports (jest/vitest/mocha/...) inside production source
   * during the BUILD gate → HIGH. Production modules must not depend on test
   * harnesses.
   */
  i2TestUtilsInBuild(ctx: RuleContext): IntentFinding[] {
    const findings: IntentFinding[] = [];
    // Only fires for production source (not test files themselves).
    if (ctx.intent.isTestFile) return findings;
    if (!ctx.intent.isSourceCode) return findings;

    for (const c of ctx.constructs) {
      if (c.kind !== 'import') continue;
      if (!c.properties.isTestImport) continue;
      findings.push({
        ruleId: 'I-2-TEST-UTILS-IN-BUILD',
        severity: 'HIGH',
        message:
          `Test framework "${c.properties.importSource}" imported into ` +
          `production source file "${c.file}". Production code must not ` +
          `depend on test harnesses.`,
        file: c.file,
        line: c.line,
        column: c.column,
        fixSuggestion:
          `Move this import into a co-located *.test.ts file, or remove it.`,
        intentCategory: ctx.intent.category,
        gateContext: ctx.gate,
        constructKind: c.kind,
        confidence: 0.75,
      });
    }
    return findings;
  }

  // ── I-2-SPEC-DURING-BUILD ────────────────────────────────────────────────

  /**
   * Writing spec/markdown files during the BUILD gate → LOW.
   * Specs belong to PLAN; authoring them during BUILD is a process smell.
   */
  i2SpecDuringBuild(ctx: RuleContext): IntentFinding[] {
    if (ctx.gate !== 'BUILD') return [];
    if (!ctx.intent.isSpecFile) return [];

    return [
      {
        ruleId: 'I-2-SPEC-DURING-BUILD',
        severity: 'LOW',
        message:
          `Specification file "${ctx.fileName}" is being written during the ` +
          `BUILD gate. Specs should be finalized during PLAN.`,
        file: ctx.fileName,
        line: 1,
        column: 1,
        fixSuggestion: `Write spec files during the PLAN gate.`,
        intentCategory: ctx.intent.category,
        gateContext: ctx.gate,
        confidence: 0.6,
      },
    ];
  }

  // ── I-3-FRAME-MATCH ──────────────────────────────────────────────────────

  /** Report the FrameMatcher match quality as an INFO finding. */
  i3FrameMatch(ctx: RuleContext): IntentFinding[] {
    const fm = ctx.frameMatch;
    if (!fm.frame) {
      return [
        {
          ruleId: 'I-3-FRAME-MATCH',
          severity: 'INFO',
          message: `No verb frame matched this tool call (matchQuality: no_match).`,
          file: ctx.fileName,
          line: 1,
          column: 1,
          fixSuggestion: `Classify the tool manually if enforcement is needed.`,
          intentCategory: ctx.intent.category,
          gateContext: ctx.gate,
          confidence: 0.4,
        },
      ];
    }
    return [
      {
        ruleId: 'I-3-FRAME-MATCH',
        severity: 'INFO',
        message:
          `Tool matched frame "${fm.frame.verb}" (intent ${fm.frame.intent}) ` +
          `with matchQuality "${fm.matchQuality}" and frame-confidence ` +
          `${fm.confidence.toFixed(2)}.`,
        file: ctx.fileName,
        line: 1,
        column: 1,
        fixSuggestion: ``,
        intentCategory: ctx.intent.category,
        gateContext: ctx.gate,
        confidence: fm.confidence,
      },
    ];
  }

  // ── I-5-BLIND-SPOT (findings surface) ────────────────────────────────────

  /**
   * Surface dynamic-code and low-coverage conditions as findings so they are
   * visible in the report (the full structured report is compiled separately).
   */
  i5BlindSpotFindings(ctx: RuleContext): IntentFinding[] {
    const findings: IntentFinding[] = [];
    const report = compileBlindSpots(ctx.constructs, ctx.typeCheckerAvailable);

    if (report.dynamicCode) {
      findings.push({
        ruleId: 'I-5-BLIND-SPOT',
        severity: 'MEDIUM',
        message: `Dynamic code (eval/new Function) detected — static intent inference may be incomplete.`,
        file: ctx.fileName,
        line: 1,
        column: 1,
        fixSuggestion: `Avoid dynamic code generation where intent must be enforceable.`,
        intentCategory: ctx.intent.category,
        gateContext: ctx.gate,
        confidence: 0.7,
      });
    }
    if (report.callGraphCoverage < 0.5 && ctx.constructs.length > 0) {
      findings.push({
        ruleId: 'I-5-BLIND-SPOT',
        severity: 'LOW',
        message:
          `Call-graph coverage is ${(report.callGraphCoverage * 100).toFixed(0)}% — ` +
          `intent inference may miss unresolved calls.`,
        file: ctx.fileName,
        line: 1,
        column: 1,
        fixSuggestion: `Resolve dynamic callees or annotate them for the engine.`,
        intentCategory: ctx.intent.category,
        gateContext: ctx.gate,
        confidence: 0.6,
      });
    }
    return findings;
  }
}
