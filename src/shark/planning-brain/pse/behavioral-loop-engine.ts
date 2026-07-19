/**
 * Behavioral Loop Engine — Main Engine (Lobe 6)
 *
 * Spec: PSE_PROBLEM_SOLVING_ENGINE_SPEC.md §2-§14
 *
 * The main behavioral intelligence engine that orchestrates:
 *   - Tool call capture (tool-record-capture.ts)
 *   - Loop classification (loop-classifier.ts — 6 classifiers)
 *   - Intervention selection (intervention-selector.ts)
 *   - Progress tracking (progress-tracker.ts)
 *   - Session memory (session-memory.ts)
 *   - PSM activation (psm-activation.ts)
 *
 * The engine answers: "Is the agent STUCK, and if so, WHY?"
 *
 * Lifecycle:
 *   onBeforeExecution → checks if current call would create a loop
 *   onAfterExecution → captures record, runs classifiers, selects intervention
 *
 * Stateful: maintains sliding window + session memory across all calls.
 * Serializable: serialize()/restore() for compaction survival.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ToolCallRecord,
  LoopType,
  LoopTracker,
  Intervention,
  LoopClassificationResult,
  SessionPatternMemory,
  ProgressSnapshot,
  ProgressDelta,
  ProblemSolvingEngineConfig,
  ProblemSolvingEngineState,
  SerializedSessionMemory,
  EscalationLevel,
} from './pse-types.js';
import { createConfig } from './pse-types.js';
import { createToolCallRecord, categorizeToolForPSE } from './tool-record-capture.js';
import { classifyAll } from './loop-classifier.js';
import { selectIntervention, markApplied } from './intervention-selector.js';
import { ProgressTracker, extractTestPassRate, extractTodoCompleted, extractGateTransition } from './progress-tracker.js';
import {
  createSessionMemory,
  trackOccurrence,
  trackIntervention,
  checkResolution,
  serializeSessionMemory,
  deserializeSessionMemory,
  replaySessionMemory,
  persistSessionMemory,
} from './session-memory.js';
import {
  checkPSMActivation,
  generatePSMMessage,
  generateHardBlockMessage,
} from './psm-activation.js';

// ─── Behavioral Loop Engine Class ─────────────────────────────────────────────

/**
 * The main behavioral intelligence engine.
 *
 * Stateful across the entire session. Maintains:
 *   - Sliding window of tool call records (max 50)
 *   - Session pattern memory (loop counts, interventions, resolution rates)
 *   - Progress tracker (filesystem snapshots, delta computation)
 *   - PSM activation state (cooldown tracking)
 */
export class ProblemSolvingEngine {
  // ─── Configuration ───
  private config: ProblemSolvingEngineConfig;

  // ─── Sliding Window ───
  private window: ToolCallRecord[] = [];
  private maxWindowSize: number;
  private callIndex: number = 0;

  // ─── Session Memory ───
  private sessionMemory: SessionPatternMemory;

  // ─── Progress Tracking ───
  private progressTracker: ProgressTracker;
  private lastProgressSnapshot: ProgressSnapshot | null = null;
  private lastProgressDelta: ProgressDelta | null = null;
  private callsSinceProgress: number = 0;

  // ─── PSM State ───
  private lastPSMActivation: number = 0;
  private psmActive: boolean = false;

  // ─── Pending Intervention (from last classification) ───
  private lastClassification: LoopClassificationResult | null = null;
  private pendingIntervention: Intervention | null = null;

  // ─── Per-loop-type intervention attempt counts ───
  private interventionAttempts: Map<LoopType, number> = new Map();

  // ─── Enforcement vs Agent cause tracking ───
  // Counts tool calls that were blocked by the enforcement pipeline
  // (StructuredBlockError / Firewalk / Guardian), as opposed to the agent
  // voluntarily retrying. This is the key signal that lets PSE distinguish
  // "agent is stuck in a loop" from "enforcement is preventing the agent
  // from making progress." See RUNTIME_GRADE_FIX_PLAN.md Phase 3.
  private _enforcementBlocks: number = 0;
  private _agentAttempts: number = 0;

  constructor(config?: Partial<ProblemSolvingEngineConfig>) {
    this.config = createConfig(config);
    this.maxWindowSize = this.config.windowSize;
    // B4: Replay session memory from disk if available (compaction survival)
    const basePath = this.config.basePath;
    const replayed = basePath ? replaySessionMemory(basePath) : null;
    this.sessionMemory = replayed ?? createSessionMemory(
      `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    );
    this.progressTracker = new ProgressTracker(this.config);
  }

  // ─── Hook: onBeforeExecution ────────────────────────────────────────────

  /**
   * Called BEFORE a tool executes. Checks if the pending intervention should
   * block or modify the execution.
   *
   * @param toolName - The tool about to execute
   * @param args - Tool arguments
   * @param currentGate - Current gate phase (for gate-aware enforcement)
   * @returns The intervention to apply (may be 'pass')
   */
  onBeforeExecution(toolName: string, args: unknown, currentGate: string = 'plan'): Intervention {
    // If there's a pending intervention from the last after-execution, return it
    if (this.pendingIntervention) {
      const intervention = this.pendingIntervention;

      // Handle hard block — but check gate before returning
      if (intervention.action === 'block-hard') {
        // ── FIXED (v5.1): Gate-aware — suppress HARD BLOCK during BUILD ──
        // During BUILD, HARD BLOCK creates a catch-22: enforcement blocks writes
        // → PSE detects TYPE_5 → HARD BLOCK → gate resets → repeats.
        if (currentGate === 'build' || currentGate === 'plan') {
          // Downgrade to PSM activation instead of HARD BLOCK
          this.pendingIntervention = null;
          this.lastPSMActivation = Date.now();
          this.psmActive = true;
          return {
            action: 'activate-psm',
            message: intervention.message.replace('[BLOCK]', '[WARN]')
              + '\n[WARN] HARD BLOCK suppressed during BUILD gate — the agent needs room to create files.',
            loopType: intervention.loopType,
            escalation: 3,
            occurrenceCount: intervention.occurrenceCount,
            interventionAttempt: intervention.interventionAttempt,
            detectedPattern: intervention.detectedPattern,
            recommendedAction: intervention.recommendedAction,
            deduplicated: intervention.deduplicated,
          };
        }
        // Reset pending — the error will be thrown by the caller
        this.pendingIntervention = null;
        return intervention;
      }

      // Handle PSM activation
      if (intervention.action === 'activate-psm') {
        this.lastPSMActivation = Date.now();
        this.psmActive = true;
        this.pendingIntervention = null;
        return intervention;
      }

      // For inject-soft and inject-strong, clear pending and return
      this.pendingIntervention = null;
      return intervention;
    }

    // No pending intervention — check PSM activation proactively
    const psmResult = checkPSMActivation(
      this.sessionMemory,
      this.config,
      this.lastPSMActivation,
      currentGate,
      undefined,  // `now` defaults to Date.now()
      this.window  // Phase 3d: windowed enforcement check via recent records
    );

    if (psmResult.shouldActivate) {
      if (psmResult.isHardBlock) {
        // ── FIXED (v5.1): Gate-aware — checkPSMActivation now handles gate suppression,
        // but double-check here just in case something bypassed it ──
        const interventionMessage = generateHardBlockMessage(
          psmResult.triggeringMetric.includes('TYPE_3') ? 'TYPE_3_FAILED_APPROACH_CYCLE' :
          psmResult.triggeringMetric.includes('TYPE_5') ? 'TYPE_5_CLAIM_WITHOUT_PROGRESS' :
          'TYPE_1_EXACT_REPEAT',
          this.sessionMemory.totalLoopsDetected,
          this.config.psm_hardBlockRepeatCount
        );

        if (currentGate === 'build' || currentGate === 'plan') {
          // During BUILD: downgrade to PSM
          this.lastPSMActivation = Date.now();
          this.psmActive = true;
          return {
            action: 'activate-psm',
            message: interventionMessage.replace('[BLOCK]', '[WARN]')
              + '\n[WARN] HARD BLOCK suppressed during BUILD — agent needs room to create files.',
            loopType: null,
            escalation: 3,
            occurrenceCount: this.sessionMemory.totalLoopsDetected,
            interventionAttempt: 0,
            detectedPattern: psmResult.reason,
            recommendedAction: 'Change your approach fundamentally. Do not retry.',
            deduplicated: false,
          };
        }

        return {
          action: 'block-hard',
          message: interventionMessage,
          loopType: null,
          escalation: 4,
          occurrenceCount: this.sessionMemory.totalLoopsDetected,
          interventionAttempt: 0,
          detectedPattern: psmResult.reason,
          recommendedAction: 'Change your approach fundamentally. Do not retry.',
          deduplicated: false,
        };
      }

      if (psmResult.action === 'activate-psm') {
        this.lastPSMActivation = Date.now();
        this.psmActive = true;
        return {
          action: 'activate-psm',
          message: generatePSMMessage(psmResult.reason, currentGate),
          loopType: null,
          escalation: 3,
          occurrenceCount: this.sessionMemory.totalLoopsDetected,
          interventionAttempt: 0,
          detectedPattern: psmResult.reason,
          recommendedAction: 'Follow the 6-step PSM framework.',
          deduplicated: false,
        };
      }
    }

    // No intervention needed
    return {
      action: 'pass',
      message: '',
      loopType: null,
      escalation: 0,
      occurrenceCount: 0,
      interventionAttempt: 0,
      detectedPattern: '',
      recommendedAction: '',
      deduplicated: false,
    };
  }

  // ─── Hook: onAfterExecution ─────────────────────────────────────────────

  /**
   * Called AFTER a tool executes. Captures the record, runs all classifiers,
   * selects an intervention, and tracks in session memory.
   *
   * @returns The classification result
   */
  onAfterExecution(
    toolName: string,
    args: unknown,
    output: unknown,
    gate: string | null
  ): LoopClassificationResult {
    // ── Step 1: Create ToolCallRecord ──
    const record = createToolCallRecord(
      toolName,
      args,
      output,
      gate,
      this.inferSuccess(output),
      {
        hashTruncateLength: this.config.type1_hashTruncateLength,
        completionClaimKeywords: this.config.completionClaimKeywords,
        basePath: this.config.basePath,
      },
      this.callIndex
    );

    // ── Step 2: Push to sliding window ──
    // Detect whether this tool was blocked by enforcement (not the agent
    // voluntarily retrying) and annotate the record + counters accordingly.
    // This is the Phase 3 fix: PSE must distinguish enforcement-caused stalls
    // from genuinely theatrical loops.
    const wasEnforcementBlocked = this.detectEnforcementBlock(output);
    record.enforcementBlocked = wasEnforcementBlocked;
    if (wasEnforcementBlocked) {
      this._enforcementBlocks++;
    } else {
      this._agentAttempts++;
    }
    this.window.push(record);
    this.callIndex++;

    // Trim window if exceeding max size
    if (this.window.length > this.maxWindowSize) {
      this.window.shift();
    }

    // ── Step 3: Update progress tracking ──
    const currentSnapshot = this.progressTracker.snapshot(record.filesTouched);

    // Extract progress signals from output
    const testPassRate = extractTestPassRate(output);
    const todoCompleted = extractTodoCompleted(args);
    const gateTransition = extractGateTransition(toolName, args);
    this.progressTracker.updateSignals(testPassRate, todoCompleted, gateTransition);

    // Compute progress delta
    const progressDelta = this.lastProgressSnapshot
      ? this.progressTracker.computeDelta(currentSnapshot)
      : {
          filesCreated: [],
          filesModified: [],
          byteDelta: currentSnapshot.totalBytes,
          testPassRateDelta: 0,
          todosCompletedDelta: 0,
          gateTransitionsDelta: 0,
          status: 'MEANINGFUL_PROGRESS' as const,
          callsSinceProgress: 0,
        };

    this.lastProgressDelta = progressDelta;
    this.lastProgressSnapshot = currentSnapshot;
    this.progressTracker.advance(currentSnapshot);

    // Update callsSinceProgress
    this.callsSinceProgress = progressDelta.callsSinceProgress;

    // ── Step 4: Check resolution of existing loops ──
    for (const loopType of this.sessionMemory.loopTrackers.keys()) {
      checkResolution(this.sessionMemory, loopType, 10);
    }

    // ── Step 5: Run all 6 classifiers ──
    // Thread enforcement-vs-agent cause tracking into the classifiers so
    // TYPE_5 (CLAIM_WITHOUT_PROGRESS) can suppress detection when the
    // reason there is no progress is that enforcement blocked the writes.
    const enforcementStats = this.getEnforcementStats();
    const classification = classifyAll(this.window, this.config, progressDelta, enforcementStats);
    this.lastClassification = classification;

    // ── Step 6: If loop detected, select intervention ──
    if (classification.loopDetected && classification.loopType) {
      const loopType = classification.loopType;

      // Track occurrence in session memory
      trackOccurrence(this.sessionMemory, loopType);

      // Get occurrence count for this loop type
      const tracker = this.sessionMemory.loopTrackers.get(loopType);
      const occurrenceCount = tracker?.count ?? 1;

      // Get intervention attempt count
      const attemptCount = this.interventionAttempts.get(loopType) ?? 0;

      // Select intervention (gate-aware: escalations capped during BUILD).
      // Uses classification.enforcementCaused for enforcement-aware messaging.
      const intervention = selectIntervention(
        classification,
        occurrenceCount - 1, // occurrenceCount is 1-based, selector expects 0-based
        this.sessionMemory,
        this.config,
        attemptCount,
        gate ?? 'plan',  // Pass current gate for gate-aware escalation
      );

      // Track the intervention
      if (intervention.action !== 'pass') {
        trackIntervention(this.sessionMemory, loopType, intervention);
        markApplied(intervention, this.sessionMemory);
        this.interventionAttempts.set(loopType, attemptCount + 1);
      }

      // Set pending intervention for next before-execution
      this.pendingIntervention = intervention;

      // ── Step 7: Check PSM activation (gate-aware) ──
      const psmResult = checkPSMActivation(
        this.sessionMemory,
        this.config,
        this.lastPSMActivation,
        gate ?? 'plan',
        undefined,  // `now` defaults to Date.now()
        this.window  // Phase 3d: windowed enforcement check via recent records
      );

      if (psmResult.shouldActivate && !psmResult.suppressedByCooldown) {
        if (psmResult.isHardBlock) {
          this.pendingIntervention = {
            action: 'block-hard',
            message: generateHardBlockMessage(
              loopType,
              occurrenceCount,
              this.config.psm_hardBlockRepeatCount
            ),
            loopType,
            escalation: 4,
            occurrenceCount,
            interventionAttempt: attemptCount,
            detectedPattern: psmResult.reason,
            recommendedAction: 'Change your approach fundamentally.',
            deduplicated: false,
          };
        } else if (psmResult.action === 'activate-psm' && intervention.escalation < 3) {
          // Upgrade to PSM if thresholds are met
          this.pendingIntervention = {
            ...intervention,
            action: 'activate-psm',
            escalation: 3,
            message: generatePSMMessage(psmResult.reason, gate ?? 'plan'),
            recommendedAction: 'Follow the 6-step PSM framework.',
          };
        }
      }

      // ── Step 8: Emit evidence artifact ──
      this.emitEvidence(classification, this.pendingIntervention, progressDelta);
    } else {
      // No loop detected — clear pending intervention
      this.pendingIntervention = null;
    }

    return classification;
  }

  // ─── Success Inference ──────────────────────────────────────────────────

  /**
   * Infer whether a tool call succeeded from its output.
   * If output is an object with a success/passed field, use that.
   * Otherwise, check for absence of error patterns.
   */
  private inferSuccess(output: unknown): boolean {
    if (!output) return true; // Empty output is not necessarily failure
    if (typeof output === 'object') {
      const obj = output as Record<string, unknown>;
      if (typeof obj.success === 'boolean') return obj.success;
      if (typeof obj.passed === 'boolean') return obj.passed;
      if (typeof obj.error === 'string' && obj.error.length > 0) return false;
    }
    return true;
  }

  /**
   * Detect whether a tool call was blocked by the enforcement pipeline
   * (StructuredBlockError, Firewalk layer, or Guardian hook) rather than the
   * agent voluntarily choosing to retry.
   *
   * Heuristic: enforcement blocks throw StructuredBlockError (whose name is
   * 'StructuredBlockError') or carry error messages mentioning one of the
   * canonical enforcement tokens — BLOCKED, FIREWALL, GUARDIAN, ENFORCEMENT
   * BLOCKED, TOOL_BLOCKED, etc.
   *
   * Phase 3: counted separately from agent-caused retries so TYPE_5
   * classification and PSM activation can distinguish "agent looping" from
   * "enforcement blocking the agent."
   */
  private detectEnforcementBlock(output: unknown): boolean {
    if (output == null) return false;

    // StructuredBlockError instance (carries a `name` field)
    if (typeof output === 'object') {
      const obj = output as Record<string, unknown>;
      if (obj.name === 'StructuredBlockError') return true;
    }

    const str = typeof output === 'string' ? output :
                (output instanceof Error) ? output.message :
                (() => { try { return JSON.stringify(output); } catch { return ''; } })();

    if (!str) return false;

    // Canonical enforcement-block signals emitted by guardian-hook /
    // enforcement-brain / write-time-gate / gate-hook.
    return /\b(?:StructuredBlockError|BLOCKED|FIREWALL|GUARDIAN|ENFORCEMENT\s*BLOCKED|TOOL_BLOCKED)\b/i.test(str);
  }

  // ─── Evidence Emission ──────────────────────────────────────────────────

  /**
   * Emit a LoopDetectionEvent evidence artifact to disk.
   * Spec §16.1
   */
  private emitEvidence(
    classification: LoopClassificationResult,
    intervention: Intervention | null,
    progress: ProgressDelta
  ): void {
    try {
      const evidenceDir = path.join(this.config.evidenceDir, 'loop-events');
      if (!fs.existsSync(evidenceDir)) {
        fs.mkdirSync(evidenceDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${timestamp}_call${this.callIndex}_${classification.loopType}.json`;
      const filePath = path.join(evidenceDir, fileName);

      const artifact = {
        artifactType: 'LoopDetectionEvent',
        artifactVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionMemory.sessionId,
        callIndex: this.callIndex,
        classification: {
          loopDetected: classification.loopDetected,
          loopType: classification.loopType,
          confidence: classification.confidence,
          patternDescription: classification.patternDescription,
          triggeringRecords: classification.triggeringRecords,
          cycleCount: classification.cycleCount,
        },
        intervention: intervention ? {
          action: intervention.action,
          message: intervention.message,
          loopType: intervention.loopType,
          escalation: intervention.escalation,
          occurrenceCount: intervention.occurrenceCount,
          interventionAttempt: intervention.interventionAttempt,
          detectedPattern: intervention.detectedPattern,
          recommendedAction: intervention.recommendedAction,
          deduplicated: intervention.deduplicated,
        } : null,
        progress: {
          status: progress.status,
          filesCreated: progress.filesCreated,
          filesModified: progress.filesModified,
          byteDelta: progress.byteDelta,
          testPassRateDelta: progress.testPassRateDelta,
          todosCompletedDelta: progress.todosCompletedDelta,
          gateTransitionsDelta: progress.gateTransitionsDelta,
          callsSinceProgress: progress.callsSinceProgress,
        },
        sessionMemory: {
          totalLoopsDetected: this.sessionMemory.totalLoopsDetected,
          totalInterventionsApplied: this.sessionMemory.totalInterventionsApplied,
          resolutionRate: this.sessionMemory.resolutionRate,
          dominantLoopType: this.sessionMemory.dominantLoopType,
          loopTypeCounts: Object.fromEntries(
            [...this.sessionMemory.loopTrackers.entries()].map(
              ([type, tracker]: [LoopType, LoopTracker]) => [type, tracker.count]
            )
          ),
        },
        windowState: {
          size: this.window.length,
          last10Calls: this.window.slice(-10).map((r: ToolCallRecord) => ({
            id: r.id,
            toolName: r.toolName,
            category: r.category,
            success: r.success,
            outputHadError: r.outputHadError,
            filesTouched: r.filesTouched,
          })),
        },
      };

      fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf-8');
    } catch (err) {
      // Evidence emission is best-effort — don't crash the engine
      console.error('[ProblemSolvingEngine] Evidence emission failed:', err instanceof Error ? err.message : String(err));
    }
  }

  // ─── Public Query API ────────────────────────────────────────────────────

  /**
   * Get the current session memory (read-only view).
   */
  getSessionMemory(): SessionPatternMemory {
    return this.sessionMemory;
  }

  /**
   * Get the last classification result.
   */
  getLastClassification(): LoopClassificationResult | null {
    return this.lastClassification;
  }

  /**
   * Get the current sliding window.
   */
  getWindow(): ToolCallRecord[] {
    return [...this.window];
  }

  /**
   * Get the current call index.
   */
  getCallIndex(): number {
    return this.callIndex;
  }

  /**
   * Get the last progress delta.
   */
  getLastProgressDelta(): ProgressDelta | null {
    return this.lastProgressDelta;
  }

  /**
   * Get the last progress snapshot.
   */
  getLastProgressSnapshot(): ProgressSnapshot | null {
    return this.lastProgressSnapshot;
  }

  /**
   * Check if PSM is currently active.
   */
  isPSMActive(): boolean {
    return this.psmActive;
  }

  /**
   * Get the engine configuration.
   */
  getConfig(): ProblemSolvingEngineConfig {
    return this.config;
  }

  /**
   * Get cumulative enforcement-vs-agent cause tracking.
   *
   * `enforcementBlocks` counts every tool call that was blocked by the
   * enforcement pipeline. `agentAttempts` counts every non-blocked call.
   * Phase 3: consumers compare the ratio to decide whether a detected loop
   * is self-inflicted by the agent (theatrical) or caused by enforcement
   * being too aggressive.
   */
  getEnforcementStats(): { enforcementBlocks: number; agentAttempts: number } {
    return {
      enforcementBlocks: this._enforcementBlocks,
      agentAttempts: this._agentAttempts,
    };
  }

  // ─── Serialization (Compaction Survival) ──────────────────────────────────

  /**
   * Serialize the entire engine state for compaction survival.
   * Spec §12.1, §14.2
   */
  saveState(): ProblemSolvingEngineState {
    // Convert ProgressSnapshot to serializable form
    const serializedSnapshot = this.lastProgressSnapshot ? {
      fileSet: [...this.lastProgressSnapshot.fileSet],
      fileMtimes: [...this.lastProgressSnapshot.fileMtimes.entries()],
      fileSizes: [...this.lastProgressSnapshot.fileSizes.entries()],
      totalBytes: this.lastProgressSnapshot.totalBytes,
      testPassRate: this.lastProgressSnapshot.testPassRate,
      todoCompleted: this.lastProgressSnapshot.todoCompleted,
      gateTransitions: this.lastProgressSnapshot.gateTransitions,
      currentGate: this.lastProgressSnapshot.currentGate,
      callIndex: this.lastProgressSnapshot.callIndex,
    } : null;

    // B4: Persist session memory to disk for compaction survival
    const basePath = this.config.basePath;
    if (basePath) {
      try { persistSessionMemory(basePath, this.sessionMemory); } catch { /* best-effort */ }
    }

    // Store the serialized form (Sets/Maps → arrays) and reconstruct on restore
    return {
      window: this.window,
      callIndex: this.callIndex,
      callsSinceProgress: this.callsSinceProgress,
      sessionMemory: serializeSessionMemory(this.sessionMemory),
      lastProgressSnapshot: serializedSnapshot,
    };
  }

  /**
   * Restore engine state from a saved state.
   */
  restoreState(state: ProblemSolvingEngineState): void {
    // Restore window
    this.window = state.window ?? [];

    // Restore call index
    this.callIndex = state.callIndex ?? 0;

    // Restore callsSinceProgress
    this.callsSinceProgress = state.callsSinceProgress ?? 0;

    // Restore session memory
    if (state.sessionMemory) {
      this.sessionMemory = deserializeSessionMemory(state.sessionMemory);
    }

    // Restore last progress snapshot
    if (state.lastProgressSnapshot) {
      // The snapshot was serialized as arrays for Maps/Sets — reconstruct runtime types
      const snap = state.lastProgressSnapshot;
      this.lastProgressSnapshot = {
        fileSet: snap.fileSet instanceof Set ? snap.fileSet :
                 Array.isArray(snap.fileSet) ? new Set(snap.fileSet) : new Set(),
        fileMtimes: snap.fileMtimes instanceof Map ? snap.fileMtimes :
                    Array.isArray(snap.fileMtimes) ? new Map(snap.fileMtimes) : new Map(),
        fileSizes: snap.fileSizes instanceof Map ? snap.fileSizes :
                   Array.isArray(snap.fileSizes) ? new Map(snap.fileSizes) : new Map(),
        totalBytes: snap.totalBytes ?? 0,
        testPassRate: snap.testPassRate ?? null,
        todoCompleted: snap.todoCompleted ?? 0,
        gateTransitions: snap.gateTransitions ?? 0,
        currentGate: snap.currentGate ?? null,
        callIndex: snap.callIndex ?? 0,
      };
      // Also restore the progress tracker's last snapshot
      this.progressTracker.advance(this.lastProgressSnapshot);
    }

    // Clear pending intervention on restore
    this.pendingIntervention = null;
    this.lastClassification = null;
  }

  /**
   * Serialize to JSON string (for simple persistence).
   */
  serialize(): string {
    return JSON.stringify(this.saveState());
  }

  /**
   * Restore from JSON string.
   */
  restore(data: string): void {
    try {
      const state = JSON.parse(data) as ProblemSolvingEngineState;
      this.restoreState(state);
    } catch (err) {
      console.error('[ProblemSolvingEngine] Restore failed:', err instanceof Error ? err.message : String(err));
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────────────

  /**
   * Reset the engine (e.g., after PSM framework is followed).
   * Clears pending interventions but preserves session memory statistics.
   */
  resetLoopState(): void {
    this.pendingIntervention = null;
    this.lastClassification = null;
    this.callsSinceProgress = 0;
    // Note: session memory is NOT reset — it tracks lifetime statistics
  }
}

// ─── Factory Function ─────────────────────────────────────────────────────────

/**
 * Create a new ProblemSolvingEngine with optional config overrides.
 */
export function createProblemSolvingEngine(
  config?: Partial<ProblemSolvingEngineConfig>
): ProblemSolvingEngine {
  return new ProblemSolvingEngine(config);
}
