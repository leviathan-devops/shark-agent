/**
 * src/eie/pse-loop-prevention.ts — PSE Graduated Loop Escalation
 *
 * Spec: 06_BRAIN_COORDINATION.md §8
 *
 * Implements the graduated escalation protocol for PSE loop detection:
 *
 *   Occurrence 1  → INFORM:  bullet guidance, no block
 *   Occurrence 2  → WARN:    bullet + PSM warhead queued, no block
 *   Occurrence 3+ → BLOCK:   eieBlock + PSM warhead + GUIDED profile
 *
 * This module is the OCCURRENCE TRACKING + ESCALATION layer that sits
 * between the PSE engine (which detects loops) and the tool.execute.before
 * hook (which enforces). It tracks each failure pattern (FM-01 through
 * FM-08) separately and graduates the response based on cumulative count.
 *
 * The PSE engine (behavioral-loop-engine.ts) still handles detection and
 * classification. This module takes over the ESCALATION decision:
 *   - FindingBus.emit() at every occurrence
 *   - Orchestrator.setPendingWarhead() at occurrence 2+
 *   - Orchestrator.triggerPsmActivation() + StateTracker GUIDED at occurrence 3+
 *   - eieBlock() at occurrence 3+ (canonical EIE block)
 *
 * Reset on gate transition: clear() is called when the gate changes.
 * Compaction survival: exportState() / importState() for compaction hooks.
 */

import { getFindingBus } from './finding-bus.js';
import { getIntelligenceOrchestrator } from './intelligence-orchestrator.js';
import { getStateTracker } from './state-tracker.js';
import { logInfo } from '../shared/shark-logger.js';
import type { FindingSeverity } from './finding-bus.js';

// ── FM Pattern Definitions ─────────────────────────────────────

/**
 * Maps PSE LoopType (TYPE_1 through TYPE_6) to spec FM-XX pattern IDs.
 * Each PSE type maps to a unique FM pattern for independent occurrence tracking.
 */
const LOOP_TYPE_TO_FM: Record<string, string> = {
  'TYPE_1_EXACT_REPEAT': 'FM-01',
  'TYPE_2_SEMANTIC_REPEAT': 'FM-08',
  'TYPE_3_FAILED_APPROACH_CYCLE': 'FM-06',
  'TYPE_4_SCOPE_EXPANSION': 'FM-07',
  'TYPE_5_CLAIM_WITHOUT_PROGRESS': 'FM-05',
  'TYPE_6_CONTEXT_LOSS': 'FM-03',
};

/** Human-readable names for the 8 failure patterns. */
const FM_PATTERN_NAMES: Record<string, string> = {
  'FM-01': 'Same-error-retry (retry-loop)',
  'FM-02': 'Tool-swap-without-progress (tool-cycle)',
  'FM-03': 'Read-write-read cycle (io-cycle)',
  'FM-04': 'Gate-stuck (gate-stall)',
  'FM-05': 'Evidence-fabrication-retry (fabrication-loop)',
  'FM-06': 'Theatrical-fix-retry (theatrical-loop)',
  'FM-07': 'Scope-creep (scope-expansion)',
  'FM-08': 'Analysis-paralysis (read-only-loop)',
};

// ── Gate Tool Whitelist ─────────────────────────────────────────

/**
 * GATE TOOLS that should NEVER be blocked by PSE loop detection.
 *
 * These tools ARE the gate pipeline itself — gate evaluation, audit,
 * testing, delivery, evidence collection, status, checkpoint. Blocking
 * any of them deadlocks the agent permanently, especially at the AUDIT
 * gate where read-heavy calls trigger FM-08 (analysis-paralysis) on
 * every iteration.
 *
 * If a gate tool triggers a loop pattern, we track the occurrence for
 * diagnostics but immediately pass through with no block.
 */
const GATE_TOOLS = new Set([
  'shark-gate',
  'shark-audit',
  'shark-test-runner',
  'shark-deliver',
  'shark-evidence',
  'shark-evidence-query',
  'shark-status',
  'shark-checkpoint',
]);

// ── Occurrence Tracking ────────────────────────────────────────

/**
 * Pattern occurrence map: FM-XX patternId → cumulative count.
 *
 * Tracks how many times each failure pattern has been detected within
 * the current gate. Reset to empty on gate transition.
 */
const pseOccurrenceMap = new Map<string, number>();

/**
 * WARN-ONCE tracking: records which `${gate}:${patternId}` pairs have
 * already issued a BLOCK at the block threshold.
 *
 * Once a pattern has blocked ONCE at a given gate, every subsequent
 * occurrence at that threshold passes through (no block). This prevents a
 * single loop pattern from permanently deadlocking the agent — e.g.
 * FM-08 (analysis-paralysis) blocking ALL tools forever at the AUDIT gate.
 *
 * Cleared on gate transition (resetPseOccurrences).
 */
const pseWarned = new Set<string>();

/**
 * Track a PSE loop occurrence for the given pattern.
 * Increments the count and returns the NEW count (1-based).
 *
 * @param patternId - FM-XX pattern identifier
 * @returns The updated occurrence count (1, 2, 3, ...)
 */
export function trackPseOccurrence(patternId: string): number {
  const count = (pseOccurrenceMap.get(patternId) || 0) + 1;
  pseOccurrenceMap.set(patternId, count);
  return count;
}

/**
 * Get the current occurrence count for a pattern without incrementing.
 *
 * @param patternId - FM-XX pattern identifier
 * @returns The current count (0 if never seen)
 */
export function getPseOccurrence(patternId: string): number {
  return pseOccurrenceMap.get(patternId) ?? 0;
}

/**
 * Reset ALL PSE occurrences. Called on gate transition.
 * The occurrence map is gate-scoped — each gate starts fresh.
 */
export function resetPseOccurrences(): void {
  pseOccurrenceMap.clear();
  pseWarned.clear();
}

/**
 * Reset a single pattern's occurrence count.
 */
export function resetPseOccurrence(patternId: string): void {
  pseOccurrenceMap.delete(patternId);
}

// ── Compaction Survival ────────────────────────────────────────

/**
 * Export PSE occurrence state for compaction survival.
 * Produces a plain object safe to stash on globalThis or write to disk.
 */
export function exportPseOccurrences(): Record<string, number> {
  return Object.fromEntries(pseOccurrenceMap);
}

/**
 * Import PSE occurrence state after compaction.
 * Overwrites the current map entirely.
 */
export function importPseOccurrences(data: Record<string, number>): void {
  pseOccurrenceMap.clear();
  for (const [key, value] of Object.entries(data)) {
    pseOccurrenceMap.set(key, value);
  }
}

/**
 * Export the WARN-ONCE set for compaction survival.
 * Returns a plain array of `${gate}:${patternId}` keys.
 */
export function exportPseWarned(): string[] {
  return [...pseWarned];
}

/**
 * Import the WARN-ONCE set after compaction.
 */
export function importPseWarned(data: string[]): void {
  pseWarned.clear();
  for (const key of data) {
    pseWarned.add(key);
  }
}

// ── Pattern Mapping ────────────────────────────────────────────

/**
 * Map a PSE LoopType to an FM-XX pattern ID.
 *
 * @param loopType - PSE LoopType (e.g., 'TYPE_3_FAILED_APPROACH_CYCLE')
 * @returns FM-XX pattern ID (e.g., 'FM-06'), or 'FM-UNKNOWN' if unmapped
 */
export function mapLoopTypeToPatternId(loopType: string | null | undefined): string {
  if (!loopType) return 'FM-UNKNOWN';
  return LOOP_TYPE_TO_FM[loopType] ?? 'FM-UNKNOWN';
}

/**
 * Get the human-readable name for an FM-XX pattern ID.
 */
export function getPatternName(patternId: string): string {
  return FM_PATTERN_NAMES[patternId] ?? patternId;
}

// ── PSM Warhead Generation ─────────────────────────────────────

/**
 * Generate a PSM (Problem Solving Mode) warhead content string.
 * This is queued via Orchestrator.setPendingWarhead() and consumed
 * by messages.transform on the next turn.
 *
 * @param patternId - FM-XX pattern identifier
 * @param gate - Current gate phase
 */
export function generatePsmWarhead(patternId: string, gate: string): string {
  const patternName = getPatternName(patternId);
  return [
    '# Problem Solving Mode Activated',
    '',
    `Loop pattern: **${patternId}** — ${patternName}`,
    `Gate: ${gate.toUpperCase()}`,
    '',
    'You have triggered the same failure pattern 3+ times.',
    'STOP retrying the same approach. Use the 6-layer scientific method:',
    '',
    '1. **ASSUMPTION** — state your hypothesis + success/disproof criteria',
    '2. **ACTION** — execute one specific command with expected output',
    '3. **OBSERVATION** — record what ACTUALLY happened (raw output)',
    '4. **GAP_ANALYSIS** — identify the root cause of the gap',
    '5. **META_REFLECTION** — what assumption was wrong? Double-loop learn.',
    '6. **VERIFICATION** — confirm the fix works mechanically',
    '',
    '---',
    '_Generated by PSE Loop Prevention — Graduated Escalation_',
  ].join('\n');
}

// ── Graduated Escalation ───────────────────────────────────────

/**
 * The escalation level determined by occurrence count.
 *   INFORM (1) → bullet guidance only
 *   WARN (2)   → bullet + PSM warhead queued
 *   BLOCK (3+) → eieBlock + PSM warhead + GUIDED profile
 */
export type PseEscalationLevel = 'inform' | 'warn' | 'block';

/**
 * Result of graduated escalation evaluation.
 */
export interface PseEscalationResult {
  /** The escalation level */
  level: PseEscalationLevel;
  /** The occurrence count after tracking */
  occurrence: number;
  /** FM-XX pattern ID */
  patternId: string;
  /** Human-readable pattern name */
  patternName: string;
  /** Bullet to push to output.system (null if blocking via eieBlock) */
  bullet: string | null;
  /** Whether to block the tool call (occurrence >= 3) */
  shouldBlock: boolean;
}

/**
 * Apply graduated PSE loop escalation.
 *
 * CALIBRATION FIX: FM-05 (fabrication-loop / TYPE_5) now requires 5+ occurrences
 * before blocking, instead of 3. This prevents false-positive blocks on
 * legitimate iterative work. Other patterns (FM-01 through FM-08) keep
 * the original 3-occurrence threshold.
 *
 * This is the MAIN entry point, called from tool.execute.before when the
 * PSE engine detects a loop. It:
 *
 *   1. Tracks the occurrence (increments pseOccurrenceMap)
 *   2. Emits a FindingBus finding at every occurrence
 *   3. Queues a PSM warhead via Orchestrator at occurrence 2+
 *   4. Triggers PSM activation + GUIDED profile at block threshold (3 or 5+)
 *
 * The caller is responsible for:
 *   - Pushing the bullet to output.system at occurrence 1 and 2
 *   - Calling eieBlock() at block threshold (which throws)
 *
 * @param params - Loop detection parameters
 * @returns Escalation result with bullet and shouldBlock flag
 */
export function applyPseGraduatedEscalation(params: {
  /** PSE LoopType (e.g., 'TYPE_3_FAILED_APPROACH_CYCLE') or FM-XX pattern directly */
  loopType?: string | null;
  /** FM-XX pattern ID (overrides loopType mapping if provided) */
  patternId?: string;
  /** Current gate phase */
  gate: string;
  /** Tool name that triggered the detection */
  toolName: string;
}): PseEscalationResult {
  const { loopType, gate, toolName } = params;

  // Resolve the FM-XX pattern ID
  const patternId = params.patternId ?? mapLoopTypeToPatternId(loopType);
  const patternName = getPatternName(patternId);

  // ═══════════════════════════════════════════════════════════════════════
  // GATE TOOL WHITELIST: Never block gate-pipeline tools. These tools ARE
  // the gate machinery — blocking them deadlocks the agent permanently.
  // We still track the occurrence for diagnostics, but pass through with no
  // block. This is the #1 fix for FM-08 blocking ALL tools at the AUDIT gate.
  // ═══════════════════════════════════════════════════════════════════════
  if (GATE_TOOLS.has(toolName)) {
    const occurrence = trackPseOccurrence(patternId);
    logInfo(
      `[PSE] GATE TOOL '${toolName}' passed through — gate tools are never blocked (pattern ${patternId}, occ ${occurrence})`,
    );
    return {
      level: 'inform' as PseEscalationLevel,
      occurrence,
      patternId,
      patternName,
      bullet: null,
      shouldBlock: false,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ESCAPE HATCH: Don't block FM-03 (read-write-read / io-cycle) during
  // TEST gate. Read→fix→test IS the normal testing pattern, not a loop.
  // The agent NEEDS to iterate (read results → fix code → re-run tests).
  // Blocking this pattern kills the test iteration loop.
  // ═══════════════════════════════════════════════════════════════════════
  if (gate === 'test' && (
    patternId === 'FM-03' ||
    patternId === 'TYPE_3' ||
    patternId === 'io-cycle' ||
    loopType === 'TYPE_6_CONTEXT_LOSS' ||
    loopType === 'TYPE_3_FAILED_APPROACH_CYCLE'
  )) {
    // Track but don't block — this is normal test iteration
    const occurrence = trackPseOccurrence(patternId);
    return {
      level: 'inform' as PseEscalationLevel,
      occurrence,
      patternId,
      patternName,
      bullet: null, // No bullet — don't nag the agent for normal iteration
      shouldBlock: false,
    };
  }

  // Track the occurrence (increments and returns new count)
  const occurrence = trackPseOccurrence(patternId);

  // CALIBRATION FIX: FM-05 (TYPE_5) requires 5+ occurrences before blocking.
  // PLAN gate escape hatch for FM-08: legitimate research reads multiple files
  // at the PLAN gate, so block threshold is raised from 3 to 5 to avoid false
  // positives when the agent reads spec/reference files during planning.
  // Other patterns keep the original threshold of 3.
  const BLOCK_THRESHOLD = patternId === 'FM-05' ? 5 : (gate === 'plan' && patternId === 'FM-08') ? 5 : 3;
  const WARN_THRESHOLD = patternId === 'FM-05' ? 3 : 2;

  // Get FindingBus + Orchestrator singletons
  const bus = getFindingBus();
  const orchestrator = getIntelligenceOrchestrator();

  // ── INFORM: Occurrence 1 (and 2 for FM-05) ─────────────────
  // Push bullet guidance, no block. Emit medium finding.
  if (occurrence < WARN_THRESHOLD) {
    bus.emit({
      source: 'planning-brain',
      engine: 'PSE',
      category: 'loop-detected',
      severity: 'medium' as FindingSeverity,
      message: `Loop pattern detected: ${patternName} (occurrence ${occurrence})`,
      evidence: { extra: { patternId, occurrence }, toolName },
      gateContext: gate,
      toolContext: toolName,
    });

    return {
      level: 'inform',
      occurrence,
      patternId,
      patternName,
      bullet: `Loop: ${patternId} (${patternName.split(' (')[0]}). Review approach.`,
      shouldBlock: false,
    };
  }

  // ── WARN: Between WARN_THRESHOLD and BLOCK_THRESHOLD ──────
  // Push bullet + queue PSM warhead, no block. Emit high finding.
  if (occurrence < BLOCK_THRESHOLD) {
    // Queue the PSM warhead via Orchestrator (newest wins per deadlock prevention)
    orchestrator.setPendingWarhead(generatePsmWarhead(patternId, gate));

    bus.emit({
      source: 'planning-brain',
      engine: 'PSE',
      category: 'loop-detected',
      severity: 'high' as FindingSeverity,
      message: `Loop recurring: ${patternName} (occurrence ${occurrence}). PSM warhead queued.`,
      evidence: { extra: { patternId, occurrence }, toolName },
      gateContext: gate,
      toolContext: toolName,
    });

    return {
      level: 'warn',
      occurrence,
      patternId,
      patternName,
      bullet: `! LOOP WARNING: ${patternId}. PSM framework queued. Change approach.`,
      shouldBlock: false,
    };
  }

  // ── BLOCK: At or above BLOCK_THRESHOLD ────────────────────
  // WARN-ONCE: Block the FIRST occurrence at threshold only, carrying a
  // bullet. Every subsequent occurrence at this gate:patternId passes
  // through with no block. This prevents a single loop pattern from
  // permanently deadlocking the agent (e.g. FM-08 blocking ALL tools at
  // the AUDIT gate forever).
  const warnKey = `${gate}:${patternId}`;
  if (!pseWarned.has(warnKey)) {
    pseWarned.add(warnKey);

    // First time reaching block threshold — full escalation
    orchestrator.triggerPsmActivation(patternId);
    orchestrator.setPendingWarhead(generatePsmWarhead(patternId, gate));

    // Switch to GUIDED enforcement profile (maximum enforcement)
    const tracker = getStateTracker();
    tracker.setEnforcementProfile('guided');

    bus.emit({
      source: 'planning-brain',
      engine: 'PSE',
      category: 'loop-escalation',
      severity: 'critical' as FindingSeverity,
      message: `Loop ESCALATION: ${patternName} (occurrence ${occurrence}). PSM activated + GUIDED profile.`,
      evidence: { extra: { patternId, occurrence }, toolName },
      gateContext: gate,
      toolContext: toolName,
    });

    // Also emit a profile-change finding for audit trail
    bus.emit({
      source: 'planning-brain',
      engine: 'PSE',
      category: 'profile-change',
      severity: 'high' as FindingSeverity,
      message: `Enforcement switched to GUIDED (PSE escalation: ${patternId})`,
      evidence: { extra: { patternId, occurrence, profile: 'guided' }, toolName },
      gateContext: gate,
      toolContext: toolName,
    });

    return {
      level: 'block',
      occurrence,
      patternId,
      patternName,
      bullet: `⛔ LOOP BLOCK: ${patternId} (${patternName.split(' (')[0]}). Change approach — subsequent occurrences pass through.`,
      shouldBlock: true,
    };
  }

  // Already warned for this gate:patternId — pass through (WARN-ONCE)
  logInfo(
    `[PSE] WARN-ONCE pass-through: ${patternId} at ${gate} gate (occurrence ${occurrence}, already blocked once)`,
  );
  return {
    level: 'warn' as PseEscalationLevel,
    occurrence,
    patternId,
    patternName,
    bullet: null,
    shouldBlock: false,
  };
}

/**
 * Get a snapshot of all PSE occurrences (for diagnostics).
 */
export function getPseOccurrencesSnapshot(): Array<{ patternId: string; count: number; patternName: string }> {
  return [...pseOccurrenceMap.entries()].map(([patternId, count]) => ({
    patternId,
    count,
    patternName: getPatternName(patternId),
  }));
}

// ── Gate Transition Loop Detection ──────────────────────────────

/**
 * Gate transition loop detector — tracks sequential gate transitions
 * and detects when the agent cycles through the same 3+ gate sequence
 * repeatedly (e.g. build→verify→audit→fail→build→verify→audit...).
 *
 * If the same 3-gate pattern repeats 3+ times, a loop is flagged and
 * guidance is pushed to prevent infinite cycling.
 *
 * FM-04 (Gate-stuck / gate-stall) is the canonical pattern ID.
 */

/** History of gate transitions: e.g. ["build→verify", "verify→audit", ...] */
const gateTransitionHistory: string[] = [];

/** Whether a gate loop has already been flagged (prevents duplicate alerts) */
let gateLoopFlagged = false;

/**
 * Track a gate transition and detect loops.
 *
 * @param from - Gate transitioning FROM
 * @param to - Gate transitioning TO
 * @returns true if a loop was detected, false otherwise
 */
export function trackGateTransition(from: string, to: string): boolean {
  if (from === to) return false; // no-op transitions don't count

  gateTransitionHistory.push(`${from}→${to}`);
  // Keep history bounded
  if (gateTransitionHistory.length > 30) gateTransitionHistory.shift();

  // Need at least 9 transitions to detect a 3-cycle repeating 3 times
  if (gateTransitionHistory.length < 9) return false;

  // Check for repeating pattern of length 3 (the most common gate loop)
  const recent = gateTransitionHistory.slice(-9);
  const pattern3 = recent.slice(0, 3).join(',');
  const repeated3 = recent.slice(3, 6).join(',') === pattern3 &&
                    recent.slice(6, 9).join(',') === pattern3;

  if (repeated3) {
    flagGateLoop(pattern3);
    return true;
  }

  // Also check for repeating pattern of length 2 (shorter cycle: verify→build→verify→build...)
  if (gateTransitionHistory.length >= 6) {
    const recent6 = gateTransitionHistory.slice(-6);
    const pattern2 = recent6.slice(0, 2).join(',');
    const repeated2 = recent6.slice(2, 4).join(',') === pattern2 &&
                      recent6.slice(4, 6).join(',') === pattern2;
    if (repeated2) {
      flagGateLoop(pattern2);
      return true;
    }
  }

  return false;
}

/**
 * Flag a gate loop and emit guidance. Called once per loop detection.
 */
function flagGateLoop(pattern: string): void {
  if (gateLoopFlagged) return; // Only flag once
  gateLoopFlagged = true;

  const bus = getFindingBus();
  const orchestrator = getIntelligenceOrchestrator();
  const tracker = getStateTracker();

  logInfo(`[PSE] GATE LOOP DETECTED: pattern "${pattern}" repeated 3+ times. Auto-advancing.`);

  bus.emit({
    source: 'planning-brain',
    engine: 'PSE',
    category: 'loop-detected',
    severity: 'critical' as FindingSeverity,
    message: `Gate loop detected: "${pattern}" repeated 3+ times. The audit may be failing due to pre-existing errors in the project.`,
    evidence: { extra: { pattern, type: 'gate-transition-loop' } },
    gateContext: 'audit',
  });

  // Queue PSM warhead with specific gate-loop guidance
  orchestrator.setPendingWarhead([
    '# Gate Loop Detected — Auto-Break',
    '',
    `**Repeating pattern:** ${pattern}`,
    '',
    'The gate pipeline is cycling through the same gates repeatedly.',
    'This is almost always caused by PRE-EXISTING TypeScript errors',
    'in the project (stale files from previous test runs).',
    '',
    '**Action:** Use `shark-gate action=advance` to manually advance',
    'past the blocking gate. The audit reality check has been made',
    'lenient — it no longer runs tsc against the entire project.',
    '',
    '---',
    '_Generated by PSE Gate Loop Detection_',
  ].join('\n'));

  // Switch to GUIDED profile for tighter control
  tracker.setEnforcementProfile('guided');
}

/**
 * Reset gate transition history. Called on gate state reset (new session).
 */
export function resetGateTransitionHistory(): void {
  gateTransitionHistory.length = 0;
  gateLoopFlagged = false;
}

/**
 * Get the current gate transition history (for diagnostics).
 */
export function getGateTransitionHistory(): string[] {
  return [...gateTransitionHistory];
}

/**
 * Check if a gate loop has been flagged.
 */
export function isGateLoopFlagged(): boolean {
  return gateLoopFlagged;
}
