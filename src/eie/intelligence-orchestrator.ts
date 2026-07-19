// src/eie/intelligence-orchestrator.ts
// The central nervous system. Synthesizes CSE+CME+PSE+EIE into coherent guidance.
//
// The IntelligenceOrchestrator is the SINGLE OUTPUT GATEWAY. Only it pushes
// synthesized EIE guidance to output.system. It receives inputs from all
// brains (CSE, CME, PSE, EIE) and synthesizes them in a FIXED priority order:
//
//   PSE > CME > CSE > EIE > Gate
//
// Per spec 06_BRAIN_COORDINATION.md §6. All operations are synchronous
// (hooks are sync).

import type { EngineFinding } from './types';
import { getFindingBus, type Finding } from './finding-bus';
import { matchKnowledge } from './context-matcher';
import { generateBullets } from './bullet-generator';
import { getProgressiveDisclosure } from './progressive-disclosure';
import { getStateTracker } from './state-tracker';

// ── Synthesis Input / Result ────────────────────────────────────

export interface SynthesisInput {
  gate: string;
  cseVerdict?: { missingEvidence: string[]; verified: boolean };
  cmeVerdict?: { health: number; alignment: number; intervention?: string };
  pseState?: { loopType?: string; intervention?: string; occurrenceCount?: number };
  eieBullets?: string[];
}

export interface OrchestratorResult {
  guidance: string | null;
  bullets: string[];
  shouldInjectWarhead: boolean;
  warheadTrigger?: string;
  blockReason?: string;
}

/** CME trajectory verdict produced by buildCmeVerdict(). */
export interface CmeVerdict {
  health: number; // 0.0 to 1.0 (1.0 = perfect)
  alignment: number; // 0.0 to 1.0
  label: string; // human-readable trajectory label
  intervention?: string; // specific intervention message
}

/** Serialized orchestrator state for compaction survival. */
export interface OrchestratorState {
  cmeHealth: number;
  cmeAlignment: number;
  cmeLabel: string;
  pseOccurrences: Record<string, number>;
  psmActivated: boolean;
  psmPatternId: string | null;
  pendingWarhead: string | null;
  comprehensionWindow: boolean[];
  exportedAt: number;
}

// ── CME Health Penalties (per §7.3) ────────────────────────────

const CME_PENALTY: Record<string, number> = {
  critical: 0.4,
  high: 0.25,
  medium: 0.1,
  low: 0.05,
  // info: no penalty
};

/** Maximum bullets pushed per synthesis (~115 token budget). */
const MAX_RESULT_BULLETS = 3;

/** Sliding window size for comprehension tracking (§6.5). */
const COMPREHENSION_WINDOW_SIZE = 10;

// ── CME Verdict Computation ────────────────────────────────────

/**
 * Build a CME trajectory verdict from accumulated engine findings.
 *
 * Health starts at 1.0 and decrements per finding severity:
 *   critical -0.4, high -0.25, medium -0.1, low -0.05
 *
 * Maps to a trajectory label:
 *   >= 0.7   → "on track"
 *   0.5–0.7  → "stay focused"
 *   0.3–0.5  → "TRAJECTORY LOW"
 *   < 0.3    → "TRAJECTORY CRITICAL"
 *
 * This is the CME Visibility Fix (§7): ALL severities pushed every turn.
 */
export function buildCmeVerdict(
  findings: EngineFinding[],
  gate: string = 'plan',
): CmeVerdict {
  let health = 1.0;

  for (const f of findings) {
    const sev = (f.severity ?? '').toLowerCase();
    const penalty = CME_PENALTY[sev];
    if (penalty !== undefined) {
      health -= penalty;
    }
  }

  health = Math.max(0, health); // floor at 0
  const alignment = health;
  const gateUpper = gate.toUpperCase();

  let label: string;
  let intervention: string | undefined;

  if (health < 0.3) {
    label = 'TRAJECTORY CRITICAL';
    intervention = `Major course correction needed. Reassess ${gateUpper} requirements.`;
  } else if (health < 0.5) {
    label = 'TRAJECTORY LOW';
    intervention = `Refocus on ${gateUpper} tasks. Avoid unnecessary exploration.`;
  } else if (health < 0.7) {
    label = 'stay focused';
    intervention = undefined;
  } else {
    label = 'on track';
    intervention = undefined;
  }

  return { health, alignment, label, intervention };
}

// ── IntelligenceOrchestrator (SINGLE OUTPUT GATEWAY) ───────────

/**
 * IntelligenceOrchestrator — the single chokepoint through which all EIE
 * guidance reaches output.system.
 *
 * Receives inputs from all brains (CSE, CME, PSE, EIE) and synthesizes
 * them into ONE coherent guidance string per turn using a fixed priority
 * order: PSE > CME > CSE > EIE > Gate.
 *
 * Design contract (per 06_BRAIN_COORDINATION.md §6):
 * - Only this object pushes synthesized EIE guidance to output.system
 * - synthesize() priority is FIXED and non-negotiable
 * - All operations are synchronous (hooks are sync)
 * - Deadlock prevention via pendingWarhead flag (newest warhead wins)
 */
export class IntelligenceOrchestrator {
  /** Pending warhead content (one-shot injection, newest wins). */
  private _pendingWarhead: string | null = null;

  /** PSE occurrence counts keyed by failure pattern ID. */
  private _pseOccurrences: Map<string, number> = new Map();

  /** Current PSE state snapshot for synthesis. */
  private _pseState: {
    loopType?: string;
    intervention?: string;
    occurrenceCount?: number;
  } = {};

  /** Cached CME verdict (updated by ingestFinding). */
  private _cmeHealth: number = 1.0;
  private _cmeAlignment: number = 1.0;
  private _cmeLabel: string = 'on track';
  private _cmeIntervention: string | undefined;

  /** PSM activation state. */
  private _psmActivated: boolean = false;
  private _psmPatternId: string | null = null;

  /** Comprehension tracking — sliding window (§6.5). */
  private _comprehensionWindow: boolean[] = [];

  // ── synthesize() — the heart of the orchestrator ───────────

  /**
   * Synthesize all brain outputs + EIE into coherent guidance for the model.
   *
   * Priority order (FIXED, non-negotiable): PSE > CME > CSE > EIE > Gate.
   * Called on every messages.transform (every turn) and by the hooks.
   */
  synthesize(inputs: SynthesisInput): OrchestratorResult {
    const lines: string[] = [];
    const bullets: string[] = [];
    let shouldInjectWarhead = false;
    let warheadTrigger: string | undefined;
    let blockReason: string | undefined;

    // ================================================================
    // PRIORITY 1: PSE — Loop detection (HIGHEST priority)
    // If the agent is looping, NOTHING else matters. Break the loop first.
    // ================================================================
    if (inputs.pseState?.intervention) {
      const occurrence = inputs.pseState.occurrenceCount ?? 0;
      const loopType = inputs.pseState.loopType ?? 'unknown';

      if (occurrence >= 3) {
        // HARD BLOCK territory — PSM warhead activation
        lines.push(`! LOOP ESCALATION: ${inputs.pseState.intervention}`);
        lines.push(`   Pattern: ${loopType} (occurrence ${occurrence})`);
        lines.push(`   ACTION REQUIRED: Use a fundamentally different approach.`);
        shouldInjectWarhead = true;
        warheadTrigger = 'psm-activation';
        bullets.push(`PSM activated: stop retrying, start problem-solving`);
        blockReason = `Loop escalation: ${loopType}`;
      } else if (occurrence >= 2) {
        // WARN territory — warhead guidance with problem-solving framework
        lines.push(`! LOOP WARNING: ${inputs.pseState.intervention}`);
        lines.push(`   Pattern: ${loopType} (occurrence ${occurrence})`);
        lines.push(`   Consider trying a different approach.`);
        bullets.push(`Loop detected (${loopType}): try different approach`);
      } else {
        // INFORM territory — bullet guidance
        lines.push(`Loop: ${inputs.pseState.intervention} (${loopType})`);
        bullets.push(`Possible loop: ${loopType} — vary your approach`);
      }
    }

    // ================================================================
    // PRIORITY 2: CME — Trajectory monitoring
    // If the agent is off-trajectory, it's wasting tokens.
    // ALL severities are pushed (CME Visibility Fix: 0% → 100%).
    // ================================================================
    if (inputs.cmeVerdict) {
      const health = inputs.cmeVerdict.health;
      let trajectoryLine: string;

      if (health < 0.3) {
        trajectoryLine = `! TRAJECTORY CRITICAL: health=${health.toFixed(2)}`;
        trajectoryLine += ` — major course correction needed`;
        bullets.push(`TRAJECTORY CRITICAL: stop and reassess your approach`);
      } else if (health < 0.5) {
        trajectoryLine = `Trajectory LOW: health=${health.toFixed(2)}`;
        trajectoryLine += ` — refocus on ${inputs.gate} tasks`;
        bullets.push(`Trajectory low: refocus on ${inputs.gate} gate requirements`);
      } else if (health < 0.7) {
        trajectoryLine = `Trajectory: health=${health.toFixed(2)} — stay focused`;
      } else {
        trajectoryLine = `Trajectory: health=${health.toFixed(2)} — on track`;
      }

      lines.push(trajectoryLine);

      if (inputs.cmeVerdict.intervention && health < 0.5) {
        lines.push(`  CME guidance: ${inputs.cmeVerdict.intervention}`);
      }
    }

    // ================================================================
    // PRIORITY 3: CSE — Evidence sufficiency
    // If evidence is missing, the gate won't advance regardless of other state.
    // ================================================================
    if (inputs.cseVerdict?.missingEvidence?.length) {
      const missing = inputs.cseVerdict.missingEvidence;
      lines.push(`Evidence needed: ${missing.join(', ')}`);
      bullets.push(`Produce evidence: ${missing.slice(0, 2).join(', ')}`);

      if (!inputs.cseVerdict.verified) {
        lines.push(`  Gate will NOT advance until evidence is produced.`);
      }
    }

    // ================================================================
    // PRIORITY 4: EIE — Knowledge guidance
    // Engineering knowledge is important but situational.
    // ================================================================
    if (inputs.eieBullets?.length) {
      lines.push(`Focus: ${inputs.eieBullets[0]}`);
      for (let i = 1; i < Math.min(MAX_RESULT_BULLETS, inputs.eieBullets.length); i++) {
        bullets.push(inputs.eieBullets[i]);
      }
    }

    // ================================================================
    // PRIORITY 5: Gate context (LOWEST priority, always present)
    // Prepended via unshift so it is always the first line.
    // ================================================================
    lines.unshift(`[SHARK] Gate: ${inputs.gate.toUpperCase()}`);

    // Build final guidance string
    const guidance = lines.length > 1 ? lines.join('\n') : null;

    return {
      guidance,
      bullets: bullets.slice(0, MAX_RESULT_BULLETS),
      shouldInjectWarhead,
      warheadTrigger,
      blockReason,
    };
  }

  // ── generateTurnGuidance() — called from messages.transform ─

  /**
   * Generate EIE guidance for the current turn.
   *
   * Called by messages.transform hook every turn. Reads current state
   * from StateTracker, builds a SynthesisInput from internal brain state
   * + matched knowledge, calls synthesize(), and returns the guidance string.
   *
   * Returns null if no guidance is needed.
   */
  generateTurnGuidance(workspacePath: string): string | null {
    const tracker = getStateTracker();
    const state = tracker.state;
    const disclosure = getProgressiveDisclosure();

    // Match knowledge for the current agent state
    const nodes = matchKnowledge(state);
    const newNodes = disclosure.filterNew(nodes);

    // Generate EIE bullets from newly-disclosed knowledge
    const eieBullets = generateBullets(state, newNodes);

    // Mark injected nodes (progressive disclosure tracking)
    for (const node of newNodes) {
      disclosure.markInjected(node.id, state.gate);
    }

    // Build CME verdict from engine findings + cached state
    const cmeVerdict = buildCmeVerdict(state.engineFindings, state.gate);
    this._cmeHealth = cmeVerdict.health;
    this._cmeAlignment = cmeVerdict.alignment;
    this._cmeLabel = cmeVerdict.label;
    this._cmeIntervention = cmeVerdict.intervention;

    // Build the synthesis input
    const inputs: SynthesisInput = {
      gate: state.gate,
      cmeVerdict: {
        health: cmeVerdict.health,
        alignment: cmeVerdict.alignment,
        intervention: cmeVerdict.intervention,
      },
      pseState: this._pseState,
      eieBullets: eieBullets.length > 0 ? eieBullets : undefined,
    };

    const result = this.synthesize(inputs);

    // Update comprehension tracking
    this._comprehensionWindow.push(eieBullets.length > 0);
    if (this._comprehensionWindow.length > COMPREHENSION_WINDOW_SIZE) {
      this._comprehensionWindow.shift();
    }

    return result.guidance;
  }

  // ── ingestFinding() — called when FindingBus emits ──────────

  /**
   * Called when the FindingBus emits a new or updated finding.
   *
   * Updates internal brain state tracking:
   * - CME findings → update health/alignment/label
   * - PSE findings → update occurrence counts and PSE state
   */
  ingestFinding(finding: Finding): void {
    if (!finding) return;

    // ── CME trajectory tracking ──
    if (
      finding.engine === 'CME' ||
      finding.category === 'trajectory-drift' ||
      finding.category === 'trajectory-critical'
    ) {
      // Recompute CME health from all engine findings via state tracker
      const tracker = getStateTracker();
      const verdict = buildCmeVerdict(tracker.state.engineFindings, finding.gateContext);
      this._cmeHealth = verdict.health;
      this._cmeAlignment = verdict.alignment;
      this._cmeLabel = verdict.label;
      this._cmeIntervention = verdict.intervention;
    }

    // ── PSE loop occurrence tracking ──
    if (
      finding.engine === 'PSE' ||
      finding.category === 'loop-detected' ||
      finding.category === 'loop-escalation'
    ) {
      const patternId =
        finding.evidence?.patternId ??
        (finding.evidence?.extra as Record<string, unknown> | undefined)?.patternId as string ??
        'unknown';

      const count = (this._pseOccurrences.get(patternId) ?? 0) + 1;
      this._pseOccurrences.set(patternId, count);

      // Update PSE state snapshot for synthesis
      this._pseState = {
        loopType: patternId,
        intervention: finding.message,
        occurrenceCount: count,
      };

      // If occurrence >= 3, trigger PSM activation
      if (count >= 3 && !this._psmActivated) {
        this.triggerPsmActivation(patternId);
      }
    }
  }

  // ── Warhead Management (Deadlock Prevention §6.6) ──────────

  /**
   * Set a pending warhead for injection.
   * Overwrites any existing pending warhead — newest wins.
   * This prevents deadlock from concurrent warhead triggers.
   */
  setPendingWarhead(content: string): void {
    this._pendingWarhead = content;
  }

  /**
   * Consume the pending warhead. Returns its content and clears it.
   * Returns null if no warhead is pending.
   */
  consumePendingWarhead(): string | null {
    const content = this._pendingWarhead;
    this._pendingWarhead = null;
    return content;
  }

  /** Returns whether a warhead is pending injection. */
  get pendingWarhead(): boolean {
    return this._pendingWarhead !== null;
  }

  // ── PSM Activation ──────────────────────────────────────────

  /**
   * Trigger PSM (Problem Solving Mode) activation.
   * Sets PSM state and queues a PSM warhead for injection.
   */
  triggerPsmActivation(patternId: string): void {
    this._psmActivated = true;
    this._psmPatternId = patternId;

    // Queue PSM warhead (newest wins per deadlock prevention)
    this.setPendingWarhead(this.buildPsmWarhead(patternId));
  }

  // ── Comprehension Tracking (§6.5) ──────────────────────────

  /** Get the guidance follow rate over the comprehension window (0.0–1.0). */
  get guidanceFollowRate(): number {
    if (this._comprehensionWindow.length === 0) return 1.0;
    const followed = this._comprehensionWindow.filter((f) => f).length;
    return followed / this._comprehensionWindow.length;
  }

  /** Returns true if the model is ignoring guidance (< 30% follow rate). */
  get isIgnoringGuidance(): boolean {
    return this.guidanceFollowRate < 0.3;
  }

  // ── Compaction Survival (§5.6) ──────────────────────────────

  /**
   * Export the orchestrator state for compaction survival.
   * Produces a plain object safe to stash on globalThis or write to disk.
   */
  exportState(): OrchestratorState {
    return {
      cmeHealth: this._cmeHealth,
      cmeAlignment: this._cmeAlignment,
      cmeLabel: this._cmeLabel,
      pseOccurrences: Object.fromEntries(this._pseOccurrences),
      psmActivated: this._psmActivated,
      psmPatternId: this._psmPatternId,
      pendingWarhead: this._pendingWarhead,
      comprehensionWindow: [...this._comprehensionWindow],
      exportedAt: Date.now(),
    };
  }

  /**
   * Restore orchestrator state after compaction.
   * Best-effort: malformed state does not crash the orchestrator.
   */
  importState(state: OrchestratorState): boolean {
    if (!state) return false;
    try {
      this._cmeHealth = state.cmeHealth ?? 1.0;
      this._cmeAlignment = state.cmeAlignment ?? 1.0;
      this._cmeLabel = state.cmeLabel ?? 'on track';
      this._pseOccurrences = new Map(Object.entries(state.pseOccurrences ?? {}));
      this._psmActivated = state.psmActivated ?? false;
      this._psmPatternId = state.psmPatternId ?? null;
      this._pendingWarhead = state.pendingWarhead ?? null;
      this._comprehensionWindow = Array.isArray(state.comprehensionWindow)
        ? state.comprehensionWindow
        : [];
      return true;
    } catch {
      // Import is best-effort — malformed state must not crash the orchestrator.
      return false;
    }
  }

  // ── Reset ───────────────────────────────────────────────────

  /** Reset all internal state. Intended for testing and full session resets. */
  reset(): void {
    this._pendingWarhead = null;
    this._pseOccurrences.clear();
    this._pseState = {};
    this._cmeHealth = 1.0;
    this._cmeAlignment = 1.0;
    this._cmeLabel = 'on track';
    this._cmeIntervention = undefined;
    this._psmActivated = false;
    this._psmPatternId = null;
    this._comprehensionWindow = [];
  }

  // ── Private Helpers ─────────────────────────────────────────

  /**
   * Build a PSM (Problem Solving Mode) warhead content string.
   * Queued via setPendingWarhead() and consumed by messages.transform.
   */
  private buildPsmWarhead(patternId: string): string {
    return [
      '# Problem Solving Mode Activated',
      '',
      `Loop pattern: **${patternId}** (occurrence >= 3)`,
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
      '_Generated by IntelligenceOrchestrator — PSM Warhead_',
    ].join('\n');
  }
}

// ── Singleton Management ───────────────────────────────────────

let _orchestrator: IntelligenceOrchestrator | null = null;

/**
 * Get the singleton IntelligenceOrchestrator instance.
 * Lazily initialized on first access.
 */
export function getIntelligenceOrchestrator(): IntelligenceOrchestrator {
  if (!_orchestrator) _orchestrator = new IntelligenceOrchestrator();
  return _orchestrator;
}

/**
 * Reset the singleton — drops the reference for a fresh session.
 */
export function resetIntelligenceOrchestrator(): void {
  if (_orchestrator) _orchestrator.reset();
  _orchestrator = null;
  _brainConsumerWired = false;
}

// ── Brain Consumer Wiring ──────────────────────────────────────

/** Guard flag — ensures the brain consumer is subscribed exactly once. */
let _brainConsumerWired = false;

/**
 * Wire the IntelligenceOrchestrator as a consumer of the FindingBus.
 *
 * Subscribes with the 'brain' consumer name and a severity filter that
 * passes critical, high, and medium findings to ingestFinding().
 * Idempotent — safe to call multiple times; subscribes only once.
 *
 * Per 06_BRAIN_COORDINATION.md §4: the orchestrator is the SINGLE OUTPUT
 * GATEWAY. All engine findings flow through the bus → orchestrator → model.
 *
 * Called once during hook initialization (createSharkHooks).
 */
export function wireBrainConsumer(): void {
  if (_brainConsumerWired) return;
  _brainConsumerWired = true;

  const bus = getFindingBus();
  const orchestrator = getIntelligenceOrchestrator();
  bus.subscribe({
    name: 'brain',
    handler: (finding, _event) => orchestrator.ingestFinding(finding),
    filter: (f) => f.severity === 'critical' || f.severity === 'high' || f.severity === 'medium',
  });
}

// ── Backward-Compatible Standalone Function Exports ────────────
//
// These delegate to the singleton instance so existing imports
// (synthesize, generateTurnGuidance) continue to work without changes.

/**
 * Synthesize all brain outputs + EIE into coherent guidance.
 * Delegates to the singleton orchestrator.
 */
export function synthesize(inputs: SynthesisInput): OrchestratorResult {
  return getIntelligenceOrchestrator().synthesize(inputs);
}

/**
 * Generate EIE guidance for the current turn.
 * Called by messages.transform hook. Delegates to the singleton orchestrator.
 */
export function generateTurnGuidance(workspacePath: string): string | null {
  return getIntelligenceOrchestrator().generateTurnGuidance(workspacePath);
}
