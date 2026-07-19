/**
 * PSM Activation — B-4: PSM Activation Criteria
 *
 * Spec: PSE_PROBLEM_SOLVING_ENGINE_SPEC.md §9 (B-4), §11
 *
 * Determines when Problem Solving Mode (PSM) should be activated based on
 * session behavioral statistics.
 *
 * Activation thresholds:
 *   - totalLoops >= 3                      → activate PSM
 *   - failedApproachCount >= 2             → activate PSM
 *   - claimWithoutProgress >= 1            → activate PSM
 *
 * Constraints:
 *   - Cooldown: 60000ms between activations
 *   - Hard block: repeatCount >= 3         → StructuredBlockError (graduated escalation)
 */

import type {
  SessionPatternMemory,
  ToolCallRecord,
  ProblemSolvingEngineConfig,
  EscalationLevel,
  InterventionAction,
  LoopType,
} from './pse-types.js';

// ─── PSM Activation Result ────────────────────────────────────────────────────

export interface PSMActivationResult {
  /** Whether PSM should activate */
  shouldActivate: boolean;
  /** Whether this is a hard block (vs soft PSM injection) */
  isHardBlock: boolean;
  /** The reason for activation */
  reason: string;
  /** The triggering threshold */
  triggeringMetric: string;
  /** The escalation level */
  escalation: EscalationLevel;
  /** The action to take */
  action: InterventionAction;
  /** Whether activation was suppressed by cooldown */
  suppressedByCooldown: boolean;
  /** Cause-aware checklist for the agent (enforcement vs agent loop) */
  checklist?: string[];
}

/**
 * Gate phases where HARD BLOCK is suppressed. During BUILD, the agent needs
 * room to actually create files. HARD BLOCK during BUILD creates a catch-22:
 * enforcement blocks writes → PSE detects CLAIM_WITHOUT_PROGRESS → HARD BLOCK
 * → gate resets → same thing next cycle.
 *
 * HARD BLOCK should only apply during VERIFY and AUDIT gates, where file
 * creation should already be complete.
 */
const GATES_ALLOWING_HARD_BLOCK = new Set(['verify', 'audit', 'delivery']);

// ─── Activation Logic ─────────────────────────────────────────────────────────

/**
 * Check whether PSM should be activated based on session memory state.
 *
 * @param memory - Current session pattern memory
 * @param config - Engine configuration
 * @param lastActivationTime - Timestamp of last PSM activation (for cooldown)
 * @param currentGate - Current gate phase (for gate-aware enforcement)
 * @param now - Current timestamp
 * @returns PSM activation decision
 */
export function checkPSMActivation(
  memory: SessionPatternMemory,
  config: ProblemSolvingEngineConfig,
  lastActivationTime: number,
  currentGate: string = 'plan',
  now: number = Date.now(),
  recentRecords?: ToolCallRecord[]
): PSMActivationResult {
  const type3Tracker = memory.loopTrackers.get('TYPE_3_FAILED_APPROACH_CYCLE');
  const type5Tracker = memory.loopTrackers.get('TYPE_5_CLAIM_WITHOUT_PROGRESS');
  const type1Tracker = memory.loopTrackers.get('TYPE_1_EXACT_REPEAT');

  const totalLoops = memory.totalLoopsDetected;
  const failedApproachCount = type3Tracker?.count ?? 0;
  const claimWithoutProgressCount = type5Tracker?.count ?? 0;
  const exactRepeatCount = type1Tracker?.count ?? 0;

  // ── HARD BLOCK CHECK: repeatCount >= 8 ──
  // Any loop type reaching the hard block threshold triggers a StructuredBlockError.
  // This MUST run first — hard block is the highest-priority safety mechanism.
  //
  // FIXED (v5.1): Gate-aware enforcement. During BUILD gate, a TYPE_5
  // "claim without progress" is often a catch-22: the agent CAN'T create
  // files because enforcement blocks writes. HARD BLOCK at this point
  // just resets to PLAN and repeats the cycle. Instead, during BUILD:
  //   - TYPE_5 → escalate to WARN (activate-psm) instead of HARD BLOCK
  //   - TYPE_3 still hard-blocks (failed approach cycle means real loop)
  //
  // HARD BLOCK is fully enforced during VERIFY/AUDIT/DELIVERY gates
  // where file creation should already be complete.
  for (const [loopType, tracker] of memory.loopTrackers) {
    if (tracker.count >= config.psm_hardBlockRepeatCount) {
      // ── GATE-AWARE: Suppress HARD BLOCK during BUILD/PLAN gates ──
      if (!GATES_ALLOWING_HARD_BLOCK.has(currentGate)) {
        // During BUILD: downgrade to PSM activation (escalation 3) instead of HARD BLOCK
        return {
          shouldActivate: true,
          isHardBlock: false,
          reason: `${loopType} occurred ${tracker.count} times (threshold: ${config.psm_hardBlockRepeatCount}). ` +
                  `HARD BLOCK suppressed during ${currentGate} gate — escalating to PSM instead. ` +
                  `The agent needs room to create files during BUILD.`,
          triggeringMetric: `${loopType}.count=${tracker.count}`,
          escalation: 3,
          action: 'activate-psm',
          suppressedByCooldown: false,
        };
      }

      return {
        shouldActivate: true,
        isHardBlock: true,
        reason: `${loopType} occurred ${tracker.count} times (threshold: ${config.psm_hardBlockRepeatCount}). Hard block activated.`,
        triggeringMetric: `${loopType}.count=${tracker.count}`,
        escalation: 4,
        action: 'block-hard',
        suppressedByCooldown: false,
      };
    }
  }

  // ── Phase 3: Windowed enforcement ratio ──
  // Compute the enforcement ratio over the most recent window (not cumulative).
  // This is a more responsive signal: cumulative stats can be misleading
  // when enforcement was aggressive in the past but the agent is now stuck.
  //
  //   enforcementRatio > 0.75 → PSM activates with ENFORCEMENT checklist
  //   enforcementRatio ≤ 0.25 + no blocks → PSM activates with AGENT checklist
  //   Mixed (0.25 < ratio ≤ 0.75) or insufficient data → fall through to thresholds
  const windowSize = 10;
  const recentEnforcementBlocks = recentRecords
    ? recentRecords.filter(r => r.enforcementBlocked === true).length
    : 0;
  const recentTotal = recentRecords ? Math.min(recentRecords.length, windowSize) : 0;
  const enforcementRatio = recentTotal > 0 ? recentEnforcementBlocks / recentTotal : 0;

  if (recentTotal >= 3 && enforcementRatio > 0.75) {
    // PSM activates but with ENFORCEMENT checklist — the agent is being blocked
    return {
      shouldActivate: true,
      isHardBlock: false,
      reason: 'enforcement-dominated',
      triggeringMetric: `enforcement=${recentEnforcementBlocks}/${recentTotal} (${(enforcementRatio * 100).toFixed(0)}%)`,
      escalation: 3,
      action: 'activate-psm',
      suppressedByCooldown: false,
      checklist: [
        'Are you in the correct gate? (use shark-gate to check)',
        'Are you trying to write source code during PLAN? (write SPEC.md first)',
        'Is your file path inside project scope?',
        'Check .shark/quarantine/ for blocked files',
        'Consider using documentation files (*.md) instead of source files'
      ],
    };
  }

  if (recentTotal >= 3 && enforcementRatio <= 0.25 && recentEnforcementBlocks === 0) {
    // Agent-caused loop — use AGENT checklist
    return {
      shouldActivate: true,
      isHardBlock: false,
      reason: 'agent-loop',
      triggeringMetric: `enforcement=${recentEnforcementBlocks}/${recentTotal} (${(enforcementRatio * 100).toFixed(0)}%)`,
      escalation: 3,
      action: 'activate-psm',
      suppressedByCooldown: false,
      checklist: [
        'What are you trying to achieve?',
        'What have you tried so far?',
        'Why did each approach fail?',
        'What alternative approaches exist?',
        'What evidence do you have that the next approach will work?'
      ],
    };
  }

  // Mixed or insufficient data — PSM activates with neutral checklist if total loops ≥ 3
  if (totalLoops >= 3) {
    return {
      shouldActivate: true,
      isHardBlock: false,
      reason: 'mixed',
      triggeringMetric: `totalLoops=${totalLoops} enforcement=${recentEnforcementBlocks}/${recentTotal}`,
      escalation: 3,
      action: 'activate-psm',
      suppressedByCooldown: false,
      checklist: [
        'State what you are trying to achieve',
        'List what approaches you have tried',
        'Identify any enforcement blocks preventing writes',
        'Choose one different strategy and execute it'
      ],
    };
  }

  // ── COOLDOWN CHECK ──
  // If PSM was recently activated and cooldown hasn't elapsed, suppress
  const timeSinceLastActivation = now - lastActivationTime;
  const inCooldown = timeSinceLastActivation < config.psm_cooldownMs;

  // ── THRESHOLD CHECKS ──

  // Threshold 1: totalLoops >= psm_totalLoopThreshold (3)
  if (totalLoops >= config.psm_totalLoopThreshold) {
    if (inCooldown) {
      return suppressedResult(
        `Total loops (${totalLoops}) exceeds threshold (${config.psm_totalLoopThreshold}), but PSM in cooldown`,
        `totalLoopsDetected=${totalLoops}`
      );
    }
    return {
      shouldActivate: true,
      isHardBlock: false,
      reason: `Total loops detected (${totalLoops}) exceeds threshold (${config.psm_totalLoopThreshold}). PSM activation required.`,
      triggeringMetric: `totalLoopsDetected=${totalLoops}`,
      escalation: 3,
      action: 'activate-psm',
      suppressedByCooldown: false,
    };
  }

  // Threshold 2: failedApproachCount >= psm_failedApproachThreshold (2)
  if (failedApproachCount >= config.psm_failedApproachThreshold) {
    if (inCooldown) {
      return suppressedResult(
        `Failed approach cycles (${failedApproachCount}) exceeds threshold (${config.psm_failedApproachThreshold}), but PSM in cooldown`,
        `TYPE_3.count=${failedApproachCount}`
      );
    }
    return {
      shouldActivate: true,
      isHardBlock: false,
      reason: `Failed approach cycles (${failedApproachCount}) exceeds threshold (${config.psm_failedApproachThreshold}). PSM activation required.`,
      triggeringMetric: `TYPE_3_FAILED_APPROACH_CYCLE.count=${failedApproachCount}`,
      escalation: 3,
      action: 'activate-psm',
      suppressedByCooldown: false,
    };
  }

  // Threshold 3: claimWithoutProgress >= psm_claimWithoutProgressThreshold (1)
  if (claimWithoutProgressCount >= config.psm_claimWithoutProgressThreshold) {
    if (inCooldown) {
      return suppressedResult(
        `Claim-without-progress (${claimWithoutProgressCount}) exceeds threshold (${config.psm_claimWithoutProgressThreshold}), but PSM in cooldown`,
        `TYPE_5.count=${claimWithoutProgressCount}`
      );
    }
    return {
      shouldActivate: true,
      isHardBlock: false,
      reason: `Claim-without-progress (${claimWithoutProgressCount}) exceeds threshold (${config.psm_claimWithoutProgressThreshold}). PSM activation required.`,
      triggeringMetric: `TYPE_5_CLAIM_WITHOUT_PROGRESS.count=${claimWithoutProgressCount}`,
      escalation: 3,
      action: 'activate-psm',
      suppressedByCooldown: false,
    };
  }

  // No activation needed
  return {
    shouldActivate: false,
    isHardBlock: false,
    reason: 'No PSM thresholds exceeded',
    triggeringMetric: 'none',
    escalation: 0,
    action: 'pass',
    suppressedByCooldown: false,
  };
}

/**
 * Create a suppressed-by-cooldown result.
 */
function suppressedResult(reason: string, metric: string): PSMActivationResult {
  return {
    shouldActivate: false,
    isHardBlock: false,
    reason,
    triggeringMetric: metric,
    escalation: 0,
    action: 'pass',
    suppressedByCooldown: true,
  };
}

// ─── PSM Framework Message ────────────────────────────────────────────────────

/**
 * Generate the PSM activation message — the 6-step problem-solving framework.
 *
 * This is injected into the agent's context to force structured thinking
 * instead of continuing to loop.
 *
 * FIXED (v5.1): When the current gate is AUDIT and the loop involves
 * claims without progress, suggest returning to BUILD (not PLAN).
 * The agent already planned — it just couldn't execute due to enforcement
 * blocking writes. Returning to BUILD gives it room to actually create files.
 *
 * @param reason - Why PSM was activated
 * @param currentGate - Current gate phase (for context-specific guidance)
 */
export function generatePSMMessage(reason: string, currentGate: string = 'plan'): string {
  const lines = [
    '[PSM] ================================================',
    '[PSM] PROBLEM SOLVING MODE ACTIVATED — Loop detected.',
  ];

  // ── FIXED (v5.1): Context-aware recovery guidance ──
  if (currentGate === 'audit' && reason.includes('TYPE_5')) {
    lines.push('[PSM] AUDIT gate failed because no build artifacts exist.');
    lines.push('[PSM] Returning to BUILD gate — the agent needs room to create files.');
    lines.push('[PSM] Use shark-gate to advance to BUILD, then write the files.');
    lines.push('[PSM] Do NOT go back to PLAN — planning is already done.');
  } else if (currentGate === 'build') {
    lines.push('[PSM] Gate reset to BUILD (not PLAN). You already have a plan.');
    lines.push('[PSM] Focus on writing files to disk. Create the actual TypeScript files.');
  } else {
    lines.push('[PSM] Gate reset to PLAN. Follow the framework below.');
  }

  lines.push(
    '[PSM]',
    `[PSM] Trigger: ${reason}`,
    '[PSM]',
    '[PSM] 1. STATE the exact problem in ONE sentence.',
    '[PSM] 2. LIST facts only — no guesses.',
    '[PSM] 3. LIST every tool tried + outcome.',
    '[PSM] 4. NAME what you assume without evidence.',
    '[PSM] 5. EXECUTE: One investigate action NOW.',
    '[PSM] ================================================',
  );
  return lines.join('\n');
}

/**
 * Generate a hard block message.
 */
export function generateHardBlockMessage(
  loopType: LoopType,
  count: number,
  threshold: number
): string {
  return [
    `[BLOCK] ==============================================`,
    `[BLOCK] HARD BLOCK — ${loopType} x${count}`,
    `[BLOCK] Threshold exceeded: ${count} >= ${threshold}`,
    `[BLOCK]`,
    `[BLOCK] You are in a persistent behavioral loop.`,
    `[BLOCK] STOP. Do NOT retry the same action.`,
    `[BLOCK] You must change your approach fundamentally.`,
    `[BLOCK] ==============================================`,
  ].join('\n');
}
