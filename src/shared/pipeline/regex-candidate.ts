/**
 * RegexCandidate — Phase 0 tip-of-spear output.
 *
 * Represents a SUSPECTED violation detected by regex/structural detectors.
 * NEVER blocks. Must be confirmed by a semantic engine in Phase 1.
 *
 * This file is the foundation of the 3-phase enforcement pipeline:
 *   Phase 0: buildCandidatesFromDetectors() — regex/structural scan produces candidates
 *   Phase 1: RGE.checkWriteTime + SF.analyze — semantic confirmation produces findings
 *   Phase 2: applyDecisionLayer() — confirmed candidates get enforcementAction applied
 *
 * ARCHITECTURE NOTE:
 *   This file defines structural types compatible with EnforcementRule and
 *   CodeContext from injectables/t1-runtime-grade-engineering.ts WITHOUT
 *   importing them. This breaks the circular dependency:
 *     injectables/index.ts imports pipeline/regex-candidate.ts (one direction only)
 *   TypeScript structural typing makes the types assignable at call sites.
 */

import { logInfo } from '../shark-logger.js';

// ═══════════════════════════════════════════════
// STRUCTURAL TYPES — compatible with injectables types, no import needed
// ═══════════════════════════════════════════════

/**
 * Minimal structural type for CodeContext.
 * Assignable from/to CodeContext in t1-runtime-grade-engineering.ts.
 */
interface PipelineCodeContext {
  filePath: string;
  toolName: string;
  gate: string;
  surroundingCode: string;
}

/**
 * Minimal structural type for ViolationDetector.
 * Assignable from/to ViolationDetector in t1-runtime-grade-engineering.ts.
 */
interface PipelineDetector {
  id: string;
  category: string;
  description: string;
  severity: 'critical' | 'high' | 'medium';
  detect: (code: string, context: PipelineCodeContext) => boolean;
  fix: string;
}

/**
 * Minimal structural type for EnforcementRule.
 * Assignable from/to EnforcementRule in t1-runtime-grade-engineering.ts.
 */
interface PipelineEnforcementRule {
  detector: PipelineDetector;
  enforcementAction: 'block' | 'flag' | 'escalate';
}

/**
 * Semantic map entry — maps a detector rule ID to its semantic engine rule.
 * Used by injectables/index.ts to configure the pipeline.
 */
export interface SemanticMapEntry {
  semanticRule?: string;
  enforcementAction: 'block' | 'flag' | 'escalate' | 'drop';
}

// ═══════════════════════════════════════════════
// RegexCandidate INTERFACE
// ═══════════════════════════════════════════════

/**
 * RegexCandidate — output of Phase 0 tip-of-spear.
 *
 * Represents a SUSPECTED violation detected by regex/structural analysis.
 * This is NOT a confirmed violation. The decision layer (Phase 2) will
 * either confirm it via a SemanticFinding or DROP it.
 *
 * Fields:
 *   ruleId            — detector rule ID (e.g., "P3", "TUI-01")
 *   category          — violation category (e.g., "error-handling")
 *   severity          — uppercase severity (CRITICAL/HIGH/MEDIUM/LOW)
 *   enforcementAction — what to do if confirmed (block/flag/escalate/drop)
 *   semanticRule      — target semantic engine rule for confirmation
 *                       (e.g., "SF:no-empty-catch"). If absent, candidate
 *                       can only be confirmed by line+category matching.
 *   match             — text snippet of the match (for debugging)
 *   line              — 1-based line number, or 0 if unknown
 *   column            — 0-based column, optional
 *   correction        — the detector's fix suggestion
 *   source            — detector module name (e.g., "t1-runtime-grade-engineering")
 */
export interface RegexCandidate {
  ruleId: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  /**
   * Enforcement action for this CANDIDATE.
   *
   * Regex candidates with 'block' action are NOT blocked directly.
   * They must be CONFIRMED by an AST semantic engine before the decision
   * layer elevates them to blocks. The decision layer's isConfirmed()
   * must match the candidate before blocking.
   *
   * 'block'     = will BLOCK if confirmed by semantic engine (AST-confirmed)
   * 'flag'      = will warn if confirmed by semantic engine
   * 'escalate'  = will escalate if confirmed by semantic engine
   * 'drop'      = will be dropped by decision layer
   */
  enforcementAction: 'block' | 'flag' | 'escalate' | 'drop';
  semanticRule?: string;
  match: string;
  line: number;
  column?: number;
  correction?: string;
  source: string;
}

// ═══════════════════════════════════════════════
// LINE FINDER PATTERNS
// ═══════════════════════════════════════════════

/**
 * Simplified patterns for locating the APPROXIMATE line of a violation.
 *
 * These are NOT the detector patterns — the detectors use complex
 * multi-line structural analysis. These patterns are lightweight regex
 * searches that find the FIRST occurrence of the violation's signature,
 * good enough for line-range matching in the decision layer.
 *
 * Only P1-P12 have patterns. Behavioral detectors (TUI/ADV/CT) are
 * pattern-based but their exact line doesn't matter for semantic
 * confirmation — they rely on category+line proximity matching.
 */
const LINE_FINDER_PATTERNS: Readonly<Record<string, RegExp>> = {
  // P1: relative named import statements
  P1: /import\s+\{[^}]+\}\s+from\s+['"]\.\.?\/[^'"]+['"]/,
  // P2: unguarded type assertion keyword
  P2: /\bas\s+(?!const\b(?:\s*[;.,})]|$))\w+/,
  // P3: error handler blocks — matches typed and untyped catch parameters
  P3: /\bcatch\s*(?:\(\s*[\w: ]+\s*\))?\s*\{/,
  // P4: resource acquisition calls without cleanup
  P4: /\b(?:setInterval|setTimeout|openSync|createReadStream|createWriteStream|addEventListener)\s*\(/,
  // P5: state flags toggled to truthy
  P5: /\b\w+\s*\.\s*(?:loading|pending|busy|fetching)\s*=\s*(?:true|1)\b/,
  // P6: external API calls without guards
  P6: /\b(?:fs\s*\.\s*(?:readFileSync|readFile)|crypto\s*\.\s*randomBytes|require\s*\(\s*['"])/,
  // P7: hardcoded filesystem paths
  P7: /['"](?:\/home\/[a-zA-Z_]\w*\/|\/Users\/[a-zA-Z_]\w*\/|C:\\Users\\[a-zA-Z_]\w*\\|\/var\/www\/)/,
  // P8: environment variable references
  P8: /\bprocess\.env\.\w+/,
  // P9: unhandled async chains
  P9: /\.then\s*\(|\bnew\s+Promise\s*\(|\bvoid\s+\w+\s*\(/,
  // P10: function return type annotations
  P10: /(?:function\s+\w+|(?:const|let)\s+\w+\s*=)[^=]*:\s*[A-Z]\w*(?:\[\])?\s*(?:=>|\{)/,
  // P11: anti-theatrical pattern — booleans claiming completion
  P11: /\breturn\s*\{[^}]*(?:dispersed|processed|finished)\s*:\s*(?:true|1)\b/,
  // P12: collection operations without empty guards
  P12: /new\s+Set\s*\([^)]*\)\s*\.size|\.\s*length\s*(?:<=|>=)\s*[01]\b|\.\s*every\s*\(\s*(?:\([^)]*\)\s*=>|\w+\s*=>)/,
};

/**
 * Convert detector severity (lowercase) to candidate severity (uppercase).
 */
function toCandidateSeverity(
  severity: 'critical' | 'high' | 'medium',
): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  switch (severity) {
    case 'critical':
      return 'CRITICAL';
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

/**
 * Find the approximate line number of a violation in the content.
 *
 * Uses the LINE_FINDER_PATTERNS lookup. Returns 0 if the pattern
 * is not found (unknown rule ID or pattern didn't match despite
 * the detector returning true — which can happen because detectors
 * use more complex multi-pass logic).
 *
 * @param ruleId - Detector rule ID (e.g., "P3")
 * @param content - Full file content
 * @returns 1-based line number, or 0 if not found
 */
function findMatchLine(ruleId: string, content: string): number {
  const pattern = LINE_FINDER_PATTERNS[ruleId];
  if (!pattern) return 0;

  try {
    const match = pattern.exec(content);
    if (!match || match.index < 0) return 0;

    // Count newlines before the match index to get the line number
    let line = 1;
    for (let i = 0; i < match.index && i < content.length; i++) {
      if (content[i] === '\n') line++;
    }
    return line;
  } catch {
    return 0;
  }
}

/**
 * Extract a short text snippet around the match for debugging.
 *
 * @param ruleId - Detector rule ID
 * @param content - Full file content
 * @param maxLength - Maximum snippet length
 * @returns Matched text snippet, or generic placeholder if not found
 */
function findMatchSnippet(ruleId: string, content: string, maxLength: number = 80): string {
  const pattern = LINE_FINDER_PATTERNS[ruleId];
  if (!pattern) return `[detected by ${ruleId}]`;

  try {
    const match = pattern.exec(content);
    if (!match) return `[${ruleId}: pattern not found]`;

    const text = match[0];
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  } catch {
    return `[${ruleId}: snippet extraction failed]`;
  }
}

/**
 * Keep raw action from the semantic map.
 *
 * Regex candidates with 'block' action are NOT blocked directly.
 * They must be CONFIRMED by an AST semantic engine before the decision
 * layer elevates them to blocks. The decision layer's isConfirmed()
 * must match the candidate before blocking.
 *
 * @param action - The action from the semantic map or rule
 * @returns The candidate-safe action (pass-through, no downgrade)
 */
function toCandidateAction(
  action: 'block' | 'flag' | 'escalate' | 'drop',
): RegexCandidate['enforcementAction'] {
  return action;  // Keep raw action; AST confirmation required for blocks
}

// ═══════════════════════════════════════════════
// CORE FUNCTION: buildCandidatesFromDetectors
// ═══════════════════════════════════════════════

/**
 * Build RegexCandidate[] from enforcement rules.
 *
 * For each rule:
 *   1. Run rule.detector.detect(content, context) — fault-tolerant
 *   2. If detect returns truthy, create a RegexCandidate
 *   3. Look up the semantic map for enforcementAction override + semanticRule
 *   4. Find approximate line number via LINE_FINDER_PATTERNS
 *
 * NEVER throws. Returns empty array on any catastrophic error.
 *
 * @param rules - Array of enforcement rules to scan
 * @param content - File content being analyzed
 * @param context - Code context (filePath, toolName, gate, surroundingCode)
 * @param source - Detector module name for attribution
 * @param semanticMap - Maps rule IDs to semantic engine rules and enforcementAction
 * @returns Array of RegexCandidate — NEVER blocks, just suspects
 */
export function buildCandidatesFromDetectors(
  rules: ReadonlyArray<PipelineEnforcementRule>,
  content: string,
  context: PipelineCodeContext,
  source: string,
  semanticMap: Readonly<Record<string, SemanticMapEntry>>,
): RegexCandidate[] {
  const candidates: RegexCandidate[] = [];

  for (const rule of rules) {
    const detector = rule.detector;

    try {
      // Run the detector — this is the actual regex/structural check
      const detected = detector.detect(content, context);

      if (!detected) continue;

      // Look up semantic map entry for this rule
      const mapEntry = semanticMap[detector.id];

      // Determine enforcementAction:
      //   - If semantic map has an entry, use its action (authoritative)
      //   - Otherwise, use the rule's own enforcementAction as fallback
      //   - 'block' actions require AST confirmation before the decision layer
      //     elevates them to actual blocks. See isConfirmed() in decision-layer.ts.
      const rawAction: 'block' | 'flag' | 'escalate' | 'drop' =
        mapEntry?.enforcementAction ?? rule.enforcementAction;
      const enforcementAction: RegexCandidate['enforcementAction'] =
        toCandidateAction(rawAction);

      // Determine semanticRule — only from the map
      const semanticRule: string | undefined = mapEntry?.semanticRule;

      // Find approximate line number
      const line = findMatchLine(detector.id, content);

      // Extract match snippet
      const match = findMatchSnippet(detector.id, content);

      const candidate: RegexCandidate = {
        ruleId: detector.id,
        category: detector.category,
        severity: toCandidateSeverity(detector.severity),
        enforcementAction,
        semanticRule,
        match,
        line,
        correction: detector.fix,
        source,
      };

      candidates.push(candidate);

      logInfo(
        `[pipeline] Candidate: ${detector.id} ` +
          `(sev=${candidate.severity} action=${enforcementAction} ` +
          `line=${line} src=${source})`,
      );
    } catch (detectErr) {
      // Detector threw — log and continue. One failing detector must not
      // prevent other detectors from running.
      logInfo(
        `[pipeline] Detector ${detector.id} threw: ` +
          `${detectErr instanceof Error ? detectErr.message : String(detectErr)}`,
      );
      continue;
    }
  }

  return candidates;
}

// ═══════════════════════════════════════════════
// SCAN CANDIDATES — standalone convenience wrapper
// ═══════════════════════════════════════════════

/**
 * Scan content for regex candidates using a custom set of rules.
 *
 * This is a convenience wrapper around buildCandidatesFromDetectors
 * for callers that have their own rule sets and semantic maps.
 * The primary scanRegexCandidates (importing ALL T1 detectors) lives
 * in injectables/index.ts to avoid circular imports.
 *
 * NEVER throws. Returns empty array on any error.
 *
 * @param content - File content to scan
 * @param rules - Enforcement rules to scan with
 * @param context - Code context
 * @param source - Source module name
 * @param semanticMap - Semantic rule mapping
 * @returns Array of RegexCandidate
 */
export function scanCandidates(
  content: string,
  rules: ReadonlyArray<PipelineEnforcementRule>,
  context: PipelineCodeContext,
  source: string,
  semanticMap: Readonly<Record<string, SemanticMapEntry>>,
): RegexCandidate[] {
  try {
    if (!content || content.length === 0) return [];
    if (!rules || rules.length === 0) return [];
    return buildCandidatesFromDetectors(rules, content, context, source, semanticMap);
  } catch (err) {
    logInfo(
      `[pipeline] scanCandidates failed: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}
