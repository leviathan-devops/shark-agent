/**
 * Intervention Selector — B-2: Intervention Selection
 *
 * Spec: PSE_PROBLEM_SOLVING_ENGINE_SPEC.md §7 (B-2), §10, §11
 *
 * Maps loop type + confidence + occurrence count to a specific, contextual
 * intervention message. Handles:
 *
 *   - Message generation (specific: includes tool name, count, file name)
 *   - Deduplication (never repeat the same intervention)
 *   - Escalation ladder (soft → strong → PSM → hard block)
 */

import type {
  ToolCallRecord,
  LoopType,
  Intervention,
  EscalationLevel,
  InterventionAction,
  ProblemSolvingEngineConfig,
  LoopClassificationResult,
  SessionPatternMemory,
} from './pse-types.js';

// ─── Dedup Key Generation ────────────────────────────────────────────────────

/**
 * Generate a dedup key for an intervention.
 * Two interventions with the same key should NOT both be applied.
 */
export function dedupKey(
  loopType: LoopType,
  escalation: EscalationLevel,
  patternDescription: string
): string {
  return `${loopType}:${escalation}:${patternDescription}`;
}

// ─── Message Templates per Loop Type ──────────────────────────────────────────

/**
 * Generate a specific, contextual intervention message for each loop type.
 * Messages include real data: tool name, count, file name.
 */
export function generateInterventionMessage(
  loopType: LoopType,
  classification: LoopClassificationResult,
  occurrenceCount: number
): string {
  const count = classification.cycleCount ?? occurrenceCount;
  const window = classification.windowState;
  const lastRec = window.length > 0 ? window[window.length - 1] : null;

  switch (loopType) {
    case 'TYPE_1_EXACT_REPEAT': {
      const tool = lastRec?.toolName ?? 'tool';
      return `[LOOP] You've called "${tool}" with identical arguments ${count} times. ` +
             `The result won't change. Try a different approach.`;
    }

    case 'TYPE_2_SEMANTIC_REPEAT': {
      const cat = lastRec?.category ?? 'EXPLORE';
      return `[LOOP] You've been ${cat === 'EXPLORE' ? 'exploring' : cat === 'ANALYZE' ? 'analyzing' : 'verifying'} ` +
             `for ${count} calls without creating or modifying anything. ` +
             `Start implementing — you have enough context.`;
    }

    case 'TYPE_3_FAILED_APPROACH_CYCLE': {
      const sig = lastRec?.errorSignature;
      const sigPart = sig ? ` Same error: ${sig}.` : '';
      return `[LOOP-STRONG] You're in an edit-run-error cycle (${count} repetitions).${sigPart} ` +
             `Stop retrying the same approach. Do root cause analysis: ` +
             `read the FULL error output, trace the actual cause, change your approach.`;
    }

    case 'TYPE_4_SCOPE_EXPANSION': {
      const files = window
        .filter((r: ToolCallRecord) => r.category === 'CREATE')
        .map((r: ToolCallRecord) => r.primaryFilePath)
        .filter((f: string | null | undefined): f is string => !!f)
        .slice(0, 4);
      const fileList = files.length > 0 ? ` (${files.join(', ')})` : '';
      return `[LOOP] You've created ${count} files without finishing any${fileList}. ` +
             `Focus on ONE task at a time. Complete and verify before starting the next.`;
    }

    case 'TYPE_5_CLAIM_WITHOUT_PROGRESS': {
      return `[LOOP-CRITICAL] You claimed completion ${count} times without filesystem changes. ` +
             `Provide evidence: what file did you write? What did you build? ` +
             `Claims require verifiable output.`;
    }

    case 'TYPE_6_CONTEXT_LOSS': {
      const file = lastRec?.primaryFilePath ?? 'a file';
      return `[LOOP] You're re-reading ${file} repeatedly (${count}x). ` +
             `Your context may have been lost. ` +
             `Summarize what you already know before re-reading.`;
    }

    default:
      return `[LOOP] Behavioral loop detected. Review your approach.`;
  }
}

// ─── Recommended Actions per Loop Type ────────────────────────────────────────

/**
 * Generate a recommended corrective action for each loop type.
 */
export function generateRecommendedAction(
  loopType: LoopType,
  classification: LoopClassificationResult
): string {
  switch (loopType) {
    case 'TYPE_1_EXACT_REPEAT':
      return `Change the tool arguments or use a different tool. The same input produces the same output.`;

    case 'TYPE_2_SEMANTIC_REPEAT':
      return `Stop exploring. You have enough context. Start writing code or running commands.`;

    case 'TYPE_3_FAILED_APPROACH_CYCLE': {
      const sig = classification.patternDescription?.match(/Same error: (\S+)/);
      if (sig) {
        return `The error "${sig[1]}" keeps recurring. Read the full error trace, identify the root cause, ` +
               `and fix it at the source — don't just patch the symptom.`;
      }
      return `Read the FULL error output. Trace the error to its root cause. Change your approach before retrying.`;
    }

    case 'TYPE_4_SCOPE_EXPANSION':
      return `Pick ONE file and complete it fully (write, build-check, verify) before creating the next file.`;

    case 'TYPE_5_CLAIM_WITHOUT_PROGRESS':
      return `Show evidence: which files were written, which commands succeeded. ` +
             `If nothing changed, you have NOT completed the task.`;

    case 'TYPE_6_CONTEXT_LOSS':
      return `Before re-reading, check if the information is already in your context. ` +
             `If context was compacted, re-read only what you need.`;

    default:
      return `Review the detected pattern and adjust your approach.`;
  }
}

// ─── Escalation Level Computation ─────────────────────────────────────────────

/**
 * Gate phases where HARD BLOCK (escalation 4) is suppressed.
 * During BUILD, the agent needs room to create files. HARD BLOCK
 * during BUILD creates a catch-22: enforcement blocks writes →
 * PSE detects no progress → HARD BLOCK → gate resets → repeats.
 */
const GATES_ALLOWING_HARD_BLOCK_ESCALATION = new Set(['verify', 'audit', 'delivery']);

/**
 * Compute the escalation level based on occurrence count and confidence.
 *
 * Escalation Ladder:
 *   1st occurrence, high conf → escalation 2 (inject-strong)
 *   1st occurrence, low conf  → escalation 1 (inject-soft)
 *   2nd occurrence             → escalation 2 (inject-strong)
 *   3rd occurrence             → escalation 3 (activate-psm)
 *   4th+ occurrence            → escalation 4 (block-hard)
 *
 * FIXED (v5.1): During BUILD and PLAN gates, the maximum escalation is
 * capped at 3 (activate-psm) instead of 4 (block-hard). This prevents
 * the catch-22 where enforcement blocks writes, PSE detects no progress,
 * and HARD BLOCK resets the gate — repeating the cycle.
 *
 * @param currentGate - Current gate phase (defaults to 'plan' if unknown)
 */
export function computeEscalation(
  occurrenceCount: number,
  confidence: number,
  config: ProblemSolvingEngineConfig,
  currentGate: string = 'plan'
): EscalationLevel {
  const highConfidence = confidence >= 0.7;

  let baseLevel: EscalationLevel;
  if (occurrenceCount === 0) {
    baseLevel = highConfidence ? 2 : 1;
  } else if (occurrenceCount === 1) {
    baseLevel = highConfidence ? 2 : 1;
  } else if (occurrenceCount === 2) {
    baseLevel = 2;
  } else if (occurrenceCount === 3) {
    baseLevel = 3;
  } else {
    baseLevel = 4; // 4th+ → hard block
  }

  // ── GATE-AWARE CAP: During BUILD/PLAN, never escalate to HARD BLOCK ──
  if (baseLevel === 4 && !GATES_ALLOWING_HARD_BLOCK_ESCALATION.has(currentGate)) {
    return 3; // Cap at activate-psm during BUILD
  }

  return baseLevel;
}

/**
 * Map escalation level to intervention action.
 */
export function escalationToAction(escalation: EscalationLevel): InterventionAction {
  switch (escalation) {
    case 0: return 'pass';
    case 1: return 'inject-soft';
    case 2: return 'inject-strong';
    case 3: return 'activate-psm';
    case 4: return 'block-hard';
    default: return 'pass';
  }
}

// ─── Main Selection Function ──────────────────────────────────────────────────

/**
 * Select the appropriate intervention for a detected loop.
 *
 * Implements deduplication: if the same intervention (loopType + escalation + pattern)
 * has already been applied, escalate to the next level.
 *
 * FIXED (v5.1): Added currentGate parameter for gate-aware escalation.
 * During BUILD gate, escalation is capped at 3 (activate-psm) to prevent
 * the catch-22 where enforcement blocks writes → PSE detects no progress →
 * HARD BLOCK → gate resets → repeats.
 *
 * @param classification - The classification result from the loop classifier
 * @param occurrenceCount - How many times this loop type has occurred this session
 * @param sessionMemory - Session memory for dedup checking
 * @param config - Engine config
 * @param interventionAttempt - Which attempt number this is (for escalation)
 * @param currentGate - Current gate phase (for gate-aware escalation)
 * @returns The intervention to apply
 */
export function selectIntervention(
  classification: LoopClassificationResult,
  occurrenceCount: number,
  sessionMemory: SessionPatternMemory,
  config: ProblemSolvingEngineConfig,
  interventionAttempt: number = 0,
  currentGate: string = 'plan',
): Intervention {
  // No loop detected → pass
  if (!classification.loopDetected || !classification.loopType) {
    return {
      action: 'pass',
      message: '',
      loopType: null,
      escalation: 0,
      occurrenceCount,
      interventionAttempt,
      detectedPattern: '',
      recommendedAction: '',
      deduplicated: false,
    };
  }

  const loopType = classification.loopType;

  // Compute base escalation (gate-aware: capped at 3 during BUILD)
  let escalation = computeEscalation(occurrenceCount, classification.confidence, config, currentGate);

  // ESCALATION: If this is a repeat intervention attempt, escalate
  // (but still respect the gate-aware cap)
  if (interventionAttempt >= config.escalate_repeatInterventionCount) {
    escalation = Math.min(escalation + 1, 4) as EscalationLevel;
    // RE-APPLY GATE CAP: HARD BLOCK only in verify/audit/delivery
    if (escalation === 4 && !GATES_ALLOWING_HARD_BLOCK_ESCALATION.has(currentGate)) {
      escalation = 3;
    }
  }

  // Generate message
  let message = generateInterventionMessage(loopType, classification, occurrenceCount);
  let detectedPattern = classification.patternDescription ?? '';

  // ── Phase 3: Enforcement-aware messaging ──
  // Only override with enforcement message when enforcement caused the loop.
  // When NOT enforcement-caused, the type-specific message from
  // generateInterventionMessage() is preserved — this retains the detailed
  // per-loop-type messages such as:
  //   "You've called X with identical arguments N times" (TYPE_1)
  //   "You're in an edit-run-error cycle"                  (TYPE_3)
  //   "You claimed completion N times without filesystem changes" (TYPE_5)
  if (classification.enforcementCaused) {
    message = `[ENFORCEMENT] Enforcement is preventing writes. Consider:
1. Check if your file path is inside the project scope
2. Advance to BUILD gate before writing source code (use shark-gate)
3. Write documentation files (*.md) during PLAN gate
4. Check .shark/quarantine/ for blocked files`;
  }

  // DEDUPLICATION: Check if this exact intervention was already applied
  let deduplicated = false;
  const key = dedupKey(loopType, escalation, detectedPattern);

  if (sessionMemory.exhaustedInterventions.has(key)) {
    deduplicated = true;

    // Try escalating to next level
    if (escalation < 4) {
      escalation = (escalation + 1) as EscalationLevel;
      const newKey = dedupKey(loopType, escalation, detectedPattern);
      if (!sessionMemory.exhaustedInterventions.has(newKey)) {
        deduplicated = false;
      }
    }

    // If still deduplicated, append "(still looping)" to differentiate
    if (deduplicated) {
      message = message + ' (STILL LOOPING — escalate action)';
    }
  }

  const action = escalationToAction(escalation);
  const recommendedAction = generateRecommendedAction(loopType, classification);

  return {
    action,
    message,
    loopType,
    escalation,
    occurrenceCount,
    interventionAttempt,
    detectedPattern,
    recommendedAction,
    deduplicated,
  };
}

// ─── Check if Intervention Should Be Applied ──────────────────────────────────

/**
 * Check whether an intervention has already been applied for this loop type.
 * Used by the engine to avoid repeating the same message.
 */
export function hasBeenApplied(
  loopType: LoopType,
  escalation: EscalationLevel,
  patternDescription: string,
  sessionMemory: SessionPatternMemory
): boolean {
  const key = dedupKey(loopType, escalation, patternDescription);
  return sessionMemory.exhaustedInterventions.has(key);
}

/**
 * Mark an intervention as applied (add to exhausted set).
 */
export function markApplied(
  intervention: Intervention,
  sessionMemory: SessionPatternMemory
): void {
  if (intervention.loopType && intervention.action !== 'pass') {
    const key = dedupKey(
      intervention.loopType,
      intervention.escalation,
      intervention.detectedPattern
    );
    sessionMemory.exhaustedInterventions.add(key);
  }
}
