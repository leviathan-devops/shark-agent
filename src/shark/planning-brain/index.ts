/**
 * Planning Brain — Behavioral Intelligence Architecture
 *
 * Orchestrates CSE (Verification), CME (Trajectory), PSE (Behavioral Loop)
 * engines, plus FileContextMemory and VerbFrameLexicon for read-before-write
 * enforcement. Old lobes (ContextManagementLobe, LoopDetector,
 * PatternTriggerEngine, CommonSenseLobe) have been deprecated and removed.
 * ALWAYS ENABLED. No env var guard — if it breaks, fix it, don't hide it.
 */

import { type VerificationMatrix, loadMatrix } from '../../shared/verification-matrix.js';
import { StructuredBlockError } from '../enforcement-brain/index.js';
import { getWarhead } from '../../shared/warhead-synthesizer.js';
import { FileContextMemory } from './file-context-memory.js';
import { ContextRelevanceIndex } from '../../shared/context-relevance-index.js';
import { isRecord } from '../../shared/type-guards.js';
import type { VerbFrameLexicon } from '../karpathy/verb-frame-lexicon.js';
import { CommonSenseEngine } from './cse/index.js';
import type { ToolCall, GatePhase } from './cse/index.js';
import { ContextManagementEngine, type ObserveInput } from './cme/index.js';
import { ProblemSolvingEngine, type Intervention } from './pse/index.js';
import { PlanningDecisionLayer } from './planning-decision-layer.js';
import { logInfo } from '../../shared/shark-logger.js';
import * as path from 'node:path';

export interface PlanningBrainConfig {
  basePath: string;
  contextDir: string;
  verbFrameLexicon?: VerbFrameLexicon;
}

export class PlanningBrain {
  private matrix: VerificationMatrix | null = null;
  private config: PlanningBrainConfig;
  private _bibleInjected: boolean = false;
  private lexicon: VerbFrameLexicon | null = null;
  private fileMemory: FileContextMemory;
  private contextRelevance: ContextRelevanceIndex;
  private toolHistory: string[] = [];
  private readonly maxToolHistory: number = 100;
  /** Tracks WARN-level actions — WARN throws ONCE per unique action, then allows through */
  private warnedActions: Set<string> = new Set();
  // ── Behavioral Intelligence Engines ──
  private verificationEngine: CommonSenseEngine;
  private trajectoryEngine: ContextManagementEngine;
  private behavioralLoopEngine: ProblemSolvingEngine;
  /** Tracks the last unresolved CSE BLOCK/WARN verdict for onBeforeExecution enforcement */
  private lastCseBlockVerdict: { reason: string; timestamp: number; findingId: string } | null = null;
  /**
   * WARN-ONCE tracking: Per-gate, per-finding sets.
   * Each engine blocks ONCE with a context bullet, then lets subsequent
   * attempts for the same issue at the same gate pass through.
   * This prevents death spirals (block forever) while still enforcing.
   */
  private cseWarnedForGate: Set<string> = new Set();
  private rgeWarnedForGate: Set<string> = new Set();
  private sreWarnedForGate: Set<string> = new Set();
  /** Central orchestrator for ALL Planning Brain proactive intelligence (PB-4) */
  private decisionLayer: PlanningDecisionLayer | null = null;

  constructor(config: PlanningBrainConfig) {
    this.config = config;
    this.matrix = loadMatrix(config.basePath);
    if (config.verbFrameLexicon) this.lexicon = config.verbFrameLexicon;
    this.fileMemory = new FileContextMemory();
    this.contextRelevance = new ContextRelevanceIndex();
    // ── Initialize behavioral intelligence engines ──
    this.verificationEngine = new CommonSenseEngine(config.basePath);
    this.trajectoryEngine = new ContextManagementEngine(config.basePath);
    this.behavioralLoopEngine = new ProblemSolvingEngine({ basePath: config.basePath });

    // ── Initialize PlanningDecisionLayer (PB-4 orchestrator) ──
    try {
      this.decisionLayer = new PlanningDecisionLayer(config.basePath, this.lexicon || undefined);
    } catch (e) {
      logInfo('[planning-brain] DecisionLayer init failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  get enabled(): boolean { return true; }

  markBibleInjected(): void {
    this._bibleInjected = true;
  }

  /**
   * Clear WARN-ONCE tracking when transitioning between gates.
   * Each gate starts fresh — warnings from the previous gate don't carry over.
   * Called from the hook when gateManager detects a gate change.
   */
  onGateTransition(fromGate: string, _toGate: string): void {
    // Clear warnings for the old gate across all engines
    for (const key of this.cseWarnedForGate) {
      if (key.startsWith(`${fromGate}:`)) {
        this.cseWarnedForGate.delete(key);
      }
    }
    for (const key of this.rgeWarnedForGate) {
      if (key.startsWith(`${fromGate}:`)) {
        this.rgeWarnedForGate.delete(key);
      }
    }
    for (const key of this.sreWarnedForGate) {
      if (key.startsWith(`${fromGate}:`)) {
        this.sreWarnedForGate.delete(key);
      }
    }
    // Clear stale CSE verdict too
    this.lastCseBlockVerdict = null;
    logInfo(`[PlanningBrain] Gate transition ${fromGate}→${_toGate}: WARN-ONCE sets cleared for ${fromGate}`);
  }

  // ===== HOOK: tool.execute.before =====

  /**
   * Result of onBeforeExecution. Includes optional PSE loop detection info
   * for the graduated escalation layer in tool.execute.before.
   */
  onBeforeExecution(toolName: string, args: unknown, currentGate?: string): { 
    bullet: string | null;
    /** PSE LoopType if a loop was detected (e.g., 'TYPE_3_FAILED_APPROACH_CYCLE') */
    pseLoopType?: string;
    /** PSE occurrence count for this loop type (from session memory) */
    pseOccurrence?: number;
  } {
    // Step 1: VerbFrameLexicon classification for enforcement
    if (this.lexicon) {
      const frame = this.lexicon.lookup(toolName);
      const category = frame?.category;
      const argsObj = (args || {}) as Record<string, unknown>;
      const filePath = typeof argsObj.filePath === 'string' ? argsObj.filePath
        : typeof argsObj.path === 'string' ? argsObj.path : '';

      // Angle 1: CREATE/MODIFY enforcement with per-file context + relevance awareness
      if ((category === 'CREATE' || category === 'MODIFY') && filePath) {
        const sgWarhead = getWarhead('stop-guessing');
        if (sgWarhead && 'getReadHistory' in sgWarhead && 'getWriteHistory' in sgWarhead) {
          const w = sgWarhead as unknown as {
            getReadHistory?: () => Map<string, number>;
            readHistory?: Map<string, number>;
            getWriteHistory?: () => Map<string, number>;
            writeHistory?: Map<string, number>;
          };
          const readHistory = (w.getReadHistory ? w.getReadHistory() : w.readHistory) ?? new Map<string, number>();
          const writeHistoryMap = (w.getWriteHistory ? w.getWriteHistory() : w.writeHistory) ?? new Map<string, number>();
          const lastWrite = writeHistoryMap?.get(filePath) || 0;

          const contextStatus = this.fileMemory.getContextStatus(filePath, readHistory);
          const now = Date.now();

          // Default required reads when ContextManagementLobe is removed
          const requiredReads = ['TASK_QUEUE.md'];
          const primaryDoc = requiredReads[0];
          const contextDir = this.config.contextDir;
          const hasReadRelevant = requiredReads.some(doc =>
            readHistory.has(path.join(contextDir, doc))
          );

          // WARNING: context NEVER read — inject bullet, but do NOT block.
          // The enforcement pipeline (ICE, RGE, SRE) doesn't need readHistory
          // to analyze code — it needs the code content itself. Blocking ALL
          // writes when readHistory is cold makes the entire enforcement system
          // non-functional on first boot. Instead, warn the agent so it knows
          // context is missing, but let the write proceed so enforcement can
          // still catch theatrical/stale/dead code.
          if (contextStatus === 'never-read') {
            const readsList = requiredReads.length > 0
              ? requiredReads.map(r => path.basename(r)).join(', ')
              : primaryDoc;
            return {
              bullet: `[CONTEXT] Warning: context not loaded (${readsList} not read). ` +
                `Enforcement pipeline will still analyze this write. ` +
                `Read ${readsList} for full context-aware enforcement.`,
            };
          }

          // WARN: context stale (>5 min since last context read) — inject bullet
          // once per file, but allow the write to proceed. The enforcement
          // engines operate on code content, not context history.
          if (contextStatus === 'stale') {
            const warnKey = `warn-stale:${filePath}`;
            if (!this.warnedActions.has(warnKey)) {
              this.warnedActions.add(warnKey);
              const readsList = requiredReads.length > 0
                ? requiredReads.map(r => path.basename(r)).join(', ')
                : primaryDoc;
              return {
                bullet: `[CONTEXT] Warning: context stale (>5 min). ` +
                  `Re-read ${readsList} for freshness. ` +
                  `Enforcement pipeline will still analyze this write.`,
              };
            }
            // Second attempt: no warn, pass through
          }

          // Track write
          this.fileMemory.onWrite(filePath);
          writeHistoryMap.set(filePath, now);
        }
      }

      // Angle 2: Claim enforcement (CLAIM without verify/test tool)
      if (category === 'CLAIM') {
        const recentTools = this.getRecentToolHistory(5);
        const hasEvidence = recentTools.some(t => /test|verify|check|run/.test(t));
        if (!hasEvidence) {
          throw new StructuredBlockError({
            level: 'CRITICAL', lobe: 'context',
            findingId: 'CTX-BLOCK-CLAIM',
            message: '[CONTEXT] EVIDENCE. Claim without verify. Run test/check tool first.',
          });
        }
      }
    }

    // Step 2: PSE Behavioral Loop Engine — detect stuck/looping behavior
    //
    // GRADUATED ESCALATION (spec §8): The PSE engine detects loops and
    // returns an Intervention. But enforcement is NOT done here — it's
    // deferred to the graduated escalation layer in tool.execute.before,
    // which tracks FM-XX occurrences and applies 1=inform, 2=warn, 3=block.
    //
    // This method returns the loop detection info (pseLoopType, pseOccurrence)
    // so the hook handler can apply graduated escalation with FindingBus,
    // Orchestrator, and eieBlock. The PSE's own block-hard/activate-psm
    // actions are SUPPRESSED here to avoid double-enforcement.
    let pseIntervention: Intervention | null = null;
    try {
      pseIntervention = this.behavioralLoopEngine.onBeforeExecution(toolName, args, currentGate ?? 'plan');
    } catch (pseErr) {
      // Only catch NON-block errors from the engine itself.
      if (pseErr instanceof StructuredBlockError) throw pseErr;
      logInfo('[PlanningBrain] PSE onBeforeExecution error: ' + (pseErr instanceof Error ? pseErr.message : String(pseErr)));
    }

    // Handle the intervention — return loop info for graduated escalation layer.
    // Do NOT throw block-hard or push PSE-specific bullets here. The graduated
    // escalation layer (tool.execute.before) handles FindingBus emit, warhead
    // queue, and eieBlock at occurrence 3.
    if (pseIntervention && pseIntervention.action !== 'pass') {
      return {
        bullet: null, // PSE bullet suppressed — graduated layer handles guidance
        pseLoopType: pseIntervention.loopType ?? undefined,
        pseOccurrence: pseIntervention.occurrenceCount,
      };
    }

    // Step 3: CSE Enforcement — WARN-ONCE pattern
    //
    // When CSE issued a BLOCK verdict on the last tool call (claim without
    // evidence), this layer enforces it. But instead of blocking forever
    // (death spiral) or never blocking (disables enforcement), we block
    // ONCE per gate per finding, then let subsequent attempts pass through.
    //
    // The gate key is scoped to gate:findingId so different issues are
    // tracked independently. Gate transition clears the set.
    if (this.lastCseBlockVerdict) {
      const gateKey = `${currentGate || 'unknown'}:${this.lastCseBlockVerdict.findingId}`;
      if (!this.cseWarnedForGate.has(gateKey)) {
        // FIRST TIME for this gate+finding: Block ONCE with context bullet
        this.cseWarnedForGate.add(gateKey);
        const reason = this.lastCseBlockVerdict.reason;
        const findingId = this.lastCseBlockVerdict.findingId;
        this.lastCseBlockVerdict = null;
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'cse',
          findingId,
          message: `[CSE WARN] ${reason}. One-time warning. Proceed after addressing.`,
          correction: 'This blocks once per finding per gate. Subsequent attempts will pass through.',
        });
      }
      // SUBSEQUENT TIMES: Pass through (already warned for this gate)
      logInfo('[CSE] WARN-ONCE: already warned for ' + gateKey + ', passing through');
      this.lastCseBlockVerdict = null;
    }

    return { bullet: null };
  }

  // ===== HOOK: tool.execute.after =====
  async onAfterExecution(toolName: string, args: unknown, output: unknown, gate: string): Promise<{ driftWarning: string | null }> {
    // Track tool in history for claim enforcement
    this.toolHistory.push(toolName);
    if (this.toolHistory.length > this.maxToolHistory) this.toolHistory.shift();

    // Notify FileContextMemory of context reads
    const argsObj = (args || {}) as Record<string, unknown>;
    const filePath = typeof argsObj.filePath === 'string' ? argsObj.filePath
      : typeof argsObj.path === 'string' ? argsObj.path : '';
    if ((toolName === 'read' || toolName === 'glob') && filePath) {
      this.fileMemory.onContextRead(filePath);
    }

    // Re-sync matrix reference from disk
    this.matrix = loadMatrix(this.config.basePath);

    // ── CME Trajectory Engine — observe tool call for behavioral intelligence ──
    try {
      const observeInput: ObserveInput = {
        toolName,
        filePath: filePath || undefined,
        gate,
      };
      logInfo('[CME] observe called for tool=' + toolName + ' gate=' + gate);
      const cmeVerdict = this.trajectoryEngine.observe(observeInput);
      logInfo('[CME] verdict: alignment=' + cmeVerdict.alignment.distance.toFixed(2)
        + ' health=' + cmeVerdict.health.toFixed(2)
        + ' gate=' + cmeVerdict.gate
        + (cmeVerdict.intervention ? ' intervention=' + cmeVerdict.intervention.type : ''));
      if (cmeVerdict.intervention && cmeVerdict.intervention.severity === 'BLOCK') {
        return { driftWarning: `[CME] ${cmeVerdict.intervention.message}` };
      }
    } catch (cmeErr) {
      logInfo('[PlanningBrain] CME observe error: ' + (cmeErr instanceof Error ? cmeErr.message : String(cmeErr)));
    }

    // ── PSE Behavioral Loop Engine — capture record + classify loops ──
    try {
      const pseResult = this.behavioralLoopEngine.onAfterExecution(toolName, args, output, gate);
      if (pseResult.loopDetected && pseResult.loopType) {
        // PSE detected a loop — store the pending intervention for the next onBeforeExecution
        // The intervention was already selected internally; we just log it here.
        // NOTE: pseResult is LoopClassificationResult which has no occurrenceCount field.
        // Get the occurrence count from the session memory tracker instead.
        const pseMemory = this.behavioralLoopEngine.getSessionMemory();
        const pseTracker = pseMemory.loopTrackers.get(pseResult.loopType);
        const occurrenceCount = pseTracker?.count ?? 0;
        logInfo(`[PSE] Loop detected: ${pseResult.loopType} (occurrence ${occurrenceCount})`);
      }
    } catch (pseErr) {
      logInfo('[PlanningBrain] PSE onAfterExecution error: ' + (pseErr instanceof Error ? pseErr.message : String(pseErr)));
    }

    // ── CSE Verification Engine — verify claims when agent makes them ──
    try {
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output ?? '');
      if (this.hasClaimSignal(outputStr) || this.hasClaimSignal(toolName)) {
        const verdict = await this.verificationEngine.evaluate(
          [{ toolName, args: args as Record<string, unknown>, timestamp: Date.now() } as ToolCall],
          [outputStr],
          gate.toUpperCase() as GatePhase,
          { start: Date.now() - 60000, latestActivity: Date.now() },
        );
        if (verdict.enforcementAction === 'BLOCK' || verdict.enforcementAction === 'WARN') {
          // CSE BLOCK or WARN verdict — set lastCseBlockVerdict for WARN-ONCE enforcement.
          // NOTE: During PLAN/BUILD gates, the CSE engine downgrades BLOCK → WARN
          // (see verification-engine.ts lines 458-476). We capture BOTH so that
          // CSE enforcement still fires via the warn-once pattern even during
          // PLAN/BUILD — block the FIRST time with a context bullet, then let
          // subsequent attempts for the same finding pass through.
          // This replaces the old advisory bypass that disabled enforcement entirely.
          const blockReason = verdict.summary || 'Claim verification failed';
          logInfo(`[CSE] ${verdict.enforcementAction} verdict: ${blockReason}`);
          this.lastCseBlockVerdict = { reason: blockReason, timestamp: Date.now(), findingId: 'cse-general' };
          // Inject into output.system[] if available
          const outputRec = output as Record<string, unknown>;
          if (outputRec && typeof outputRec === 'object') {
            outputRec.system = outputRec.system || [];
            (outputRec.system as string[]).push(`[CSE BLOCK] ${blockReason}`);
          }
          return { driftWarning: `[CSE] BLOCK: ${blockReason}` };
        }
      }
    } catch (cseErr) {
      logInfo('[PlanningBrain] CSE evaluate error: ' + (cseErr instanceof Error ? cseErr.message : String(cseErr)));
    }

    return { driftWarning: null };
  }

  // ===== HOOK: experimental.chat.system.transform =====

  getSystemInjections(): string[] {
    const injections: string[] = [];
    const matrix = this.matrix || [];
    const untested = matrix.filter(r => r.status !== 'behavioral-pass');
    for (const req of untested) {
      injections.push(`[CONTEXT VERIFY] ${req.id}:${req.status}. Test: ${req.behavioralTest.action}. Pass: ${req.behavioralTest.passCondition}.`);
    }
    return injections;
  }

  // ===== HOOK: experimental.chat.messages.transform =====

  onMessageStream(_messages: unknown[]): string[] {
    // Old ContextManagementLobe removed — no message stream processing
    return [];
  }

  // ===== HOOK: experimental.session.compacting =====

  saveState(): Record<string, unknown> {
    return {
      matrix: this.matrix,
      fileMemoryState: this.fileMemory.serialize(),
      toolHistory: [...this.toolHistory],
      // ── Engine state for compaction survival ──
      cmeState: this.trajectoryEngine.serialize(),
      pseState: this.behavioralLoopEngine.serialize(),
      // ── DecisionLayer state for compaction survival ──
      decisionLayerState: this.decisionLayer?.serialize() ?? null,
    };
  }

  restoreState(state: Record<string, unknown>): void {
    if (state.matrix) this.matrix = state.matrix as VerificationMatrix;
    if (state.fileMemoryState) this.fileMemory.restore(state.fileMemoryState);
    if (Array.isArray(state.toolHistory)) this.toolHistory = state.toolHistory as string[];
    // ── Restore engine state ──
    if (typeof state.cmeState === 'string') {
      try { this.trajectoryEngine.restore(state.cmeState); } catch (e) {
        logInfo('[PlanningBrain] CME restore error: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
    if (typeof state.pseState === 'string') {
      try { this.behavioralLoopEngine.restore(state.pseState); } catch (e) {
        logInfo('[PlanningBrain] PSE restore error: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
    // ── Restore DecisionLayer state ──
    if (typeof state.decisionLayerState === 'string' && this.decisionLayer) {
      try { this.decisionLayer.restore(state.decisionLayerState); } catch (e) {
        logInfo('[PlanningBrain] DecisionLayer restore error: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
  }

  private getRecentToolHistory(n: number): string[] {
    return this.toolHistory.slice(-n);
  }

  /**
   * Quick heuristic check: does the given text contain claim-like language
   * that warrants CSE verification? Avoids running the full 6-phase pipeline
   * on every tool call.
   */
  private hasClaimSignal(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return lower.includes('build') && (lower.includes('pass') || lower.includes('success') || lower.includes('complete') || lower.includes('done'))
      || lower.includes('test') && (lower.includes('pass') || lower.includes('green'))
      || lower.includes('evidence') && (lower.includes('archiv') || lower.includes('complete') || lower.includes('ready'))
      || lower.includes('audit') && (lower.includes('pass') || lower.includes('complete'))
      || lower.includes('gate') && (lower.includes('advance') || lower.includes('pass') || lower.includes('clear'));
  }

  getMatrix(): VerificationMatrix { return this.matrix || []; }

  /** Expose the CSE Verification Engine. */
  getCommonSenseEngine(): CommonSenseEngine { return this.verificationEngine; }
  /** Expose the CME Trajectory Engine. */
  getContextManagementEngine(): ContextManagementEngine { return this.trajectoryEngine; }
  /** Expose the PSE Behavioral Loop Engine. */
  getProblemSolvingEngine(): ProblemSolvingEngine { return this.behavioralLoopEngine; }

  /** Expose the PlanningDecisionLayer (PB-4 orchestrator). Null if init failed. */
  getDecisionLayer(): PlanningDecisionLayer | null { return this.decisionLayer; }

  /**
   * Return tool history in the format expected by PlanningDecisionLayer:
   *   Array<{ toolName: string; category: string }>
   * Converts internal string[] using VerbFrameLexicon categories.
   */
  getToolHistoryForDecision(): Array<{ toolName: string; category: string }> {
    return this.toolHistory.map(toolName => ({
      toolName,
      category: this.lexicon?.lookup(toolName)?.category || 'unknown',
    }));
  }

  /**
   * Observe a read-before-write pattern for ContextRelevanceIndex auto-learning.
   * Called from tool.execute.after hook when a write follows a read within 60s.
   */
  observeReadWrite(docPath: string, writePath: string): void {
    this.contextRelevance.observe(docPath, writePath);
  }
}

// Singleton
let _instance: PlanningBrain | null = null;

export function createPlanningBrain(config: PlanningBrainConfig): PlanningBrain {
  _instance = new PlanningBrain(config);
  return _instance;
}

export function getPlanningBrain(): PlanningBrain | null {
  return _instance;
}

export function resetPlanningBrain(): void {
  _instance = null;
}

// W2.2 + W2.3: Ensure bundler includes drift intervention and session replay
// Tree-shaken unless re-exported from the entry-point barrel
export { interveneOnDrift } from './cme/drift-detector.js';
export { replaySessionMemory, persistSessionMemory } from './pse/session-memory.js';
