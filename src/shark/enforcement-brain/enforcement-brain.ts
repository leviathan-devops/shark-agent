import * as path from 'node:path';
import * as fs from 'node:fs';
import { type EnforcementResult, type EnforcementReport, type EnforcementBrainConfig, type GatePhase, DEFAULT_ENFORCEMENT_CONFIG, isBlockingLevel, isWarningLevel } from './types.js';
import type { IntentCategory } from '../karpathy/verb-frame-lexicon.js';
import { IntentClassifier } from '../karpathy/intent-classifier.js';
import { IntentFSM } from '../karpathy/fsm.js';
import { StreamingBuffer } from '../karpathy/streaming-buffer.js';
import { RuntimeGradeEngine } from '../rge/rge-engine.js';
import type { RGEAuditReport } from '../rge/report-types.js';
import { RGEStateMachine } from '../rge/state-machine.js';
import { SlopRemovalEngine } from '../sre/honesty-engine/index.js';
import { IntentEngine } from '../karpathy/intent-engine/index.js';
import {
  updateBuildStateOnTaskComplete, updateTaskQueue, updateDecisionChain, updateDebugLog, updateChangelog,
  updateCompactionSurvival, updateEvidenceState, updatePostCompactionPrompt, updateSoCPreservation,
  updateThoughtStream,
} from '../../shared/context-manager.js';
import type { AnalysisDispatchResult } from '../../shared/analysis-order/types.js';
import { AnalysisOrderDispatcher } from '../../shared/analysis-order-dispatcher.js';
import { logInfo } from '../../shared/shark-logger.js';

export class StructuredBlockError extends Error {
  readonly layer: string;
  readonly reason: string;
  readonly detected: string;
  readonly correction: string;
  readonly lobe: string;
  constructor(result: EnforcementResult) {
    const lobeName = result.lobe === 'frontal' ? 'FRONTAL LOBE' : result.lobe.toUpperCase();
    super(`[${lobeName}] ${result.message}`);
    this.name = 'StructuredBlockError';
    this.layer = result.lobe;
    this.reason = result.message;
    this.detected = `tool execution blocked by ${result.lobe}: ${result.findingId}`;
    this.correction = result.correction || 'Review the violation and fix before retrying.';
    this.lobe = result.lobe;
  }
}



/**
 * Log structured evidence to disk for audit trail.
 * Creates evidence files in the enforcement subdirectory under the given base path.
 */
function logEvidence(evidenceDir: string, data: Record<string, unknown>): void {
  try {
    const dir = path.join(evidenceDir, 'enforcement');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `evidence-${Date.now()}.json`),
      JSON.stringify({ timestamp: new Date().toISOString(), ...data }, null, 2),
      'utf-8'
    );
  } catch (e) {
    logInfo('[EvidenceLogger] Failed to write evidence: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
}

export class EnforcementBrain {
  private config: EnforcementBrainConfig;
  private basePath: string;
  private intentClassifier: IntentClassifier;
  private intentFsm: IntentFSM;
  private streamingBuffer: StreamingBuffer;
  private rgeEngine: RuntimeGradeEngine | null = null;
  private rgeStateMachine: RGEStateMachine;
  private slopRemovalEngine: SlopRemovalEngine;
  private intentEngine: IntentEngine;
  private currentGate: GatePhase = 'PLAN';
  private sessionId: string = '';
  private analysisDispatcher: AnalysisOrderDispatcher | null = null;
  private blockCounters: Map<string, number> = new Map();
  /**
   * WARN-ONCE tracking: Per-gate, per-finding sets for RGE and SRE.
   * Each engine blocks ONCE per rule per gate, then lets subsequent
   * attempts pass through. Prevents death spirals while still enforcing.
   */
  private rgeWarnedForGate: Set<string> = new Set();
  private sreWarnedForGate: Set<string> = new Set();
  /** Pending CRITICAL/HIGH findings from evaluateAfter — enforced on next evaluateBefore */
  private pendingPostWriteBlocks: EnforcementResult[] = [];

  constructor(config: Partial<EnforcementBrainConfig> = {}) {
    this.config = { ...DEFAULT_ENFORCEMENT_CONFIG, ...config };
    this.basePath = this.config.basePath;
    this.intentClassifier = new IntentClassifier();
    this.intentFsm = new IntentFSM();
    this.streamingBuffer = new StreamingBuffer();
    this.rgeStateMachine = new RGEStateMachine();
    // SRE Honesty Engine — Lobe 3 of the enforcement pipeline.
    // Uses the workspace root (parent of .shark) for TypeScript program creation.
    this.slopRemovalEngine = new SlopRemovalEngine(path.resolve(this.basePath, '..'));
    // ICE Intent Engine — deep semantic intent analysis.
    this.intentEngine = new IntentEngine(path.resolve(this.basePath, '..'));
  }

  setSession(sessionId: string): void { this.sessionId = sessionId; }
  setGate(gate: GatePhase): void { this.currentGate = gate; this.intentClassifier.setGate(gate); }
  getGate(): GatePhase { return this.currentGate; }

  /**
   * Clear WARN-ONCE tracking when transitioning between gates.
   * Each gate starts fresh — warnings from the previous gate don't carry over.
   * Called from the hook layer when gateManager detects a gate change.
   */
  onGateTransition(fromGate: string, _toGate: string): void {
    for (const key of this.rgeWarnedForGate) {
      if (key.startsWith(`${fromGate}:`)) this.rgeWarnedForGate.delete(key);
    }
    for (const key of this.sreWarnedForGate) {
      if (key.startsWith(`${fromGate}:`)) this.sreWarnedForGate.delete(key);
    }
    this.pendingPostWriteBlocks = [];
    logInfo(`[EnforcementBrain] Gate transition ${fromGate}→${_toGate}: WARN-ONCE sets cleared for ${fromGate}`);
  }

  /** Expose the SRE Honesty Engine for external integrations. */
  getSlopRemovalEngine(): SlopRemovalEngine { return this.slopRemovalEngine; }
  /** Expose the ICE Intent Engine for external integrations. */
  getIntentEngine(): IntentEngine { return this.intentEngine; }
  /** Expose the RGE Runtime Grade Engine for external integrations. Lazy-initialized. */
  getRgeEngine(): RuntimeGradeEngine {
    if (!this.rgeEngine) {
      this.rgeEngine = new RuntimeGradeEngine(process.cwd());
    }
    return this.rgeEngine;
  }

  setAnalysisDispatcher(dispatcher: AnalysisOrderDispatcher): void {
    this.analysisDispatcher = dispatcher;
  }

  /* -- tool.execute.before: Frontal Lobe Intent Detection -- */
  async evaluateBefore(toolName: string, args: Record<string, unknown>, thoughtStream?: string): Promise<EnforcementResult[]> {
    const results: EnforcementResult[] = [];

    // ── WARN-ONCE: Process pending RGE/SRE blocks from previous evaluateAfter ──
    // When RGE/SRE found CRITICAL/HIGH issues after a write, block the FIRST
    // time per rule per gate on the next write attempt, then let subsequent
    // attempts for the same issue pass through. Prevents death spirals.
    const pendingResults = this.processPendingPostWriteBlocks();
    if (pendingResults.length > 0) {
      results.push(...pendingResults);
      // If we have a CRITICAL block, return early — caller throws StructuredBlockError
      if (pendingResults.some(r => isBlockingLevel(r.level))) {
        return results;
      }
    }

    // ── AnalysisOrderDispatcher — semantic analysis first ────
    if (this.analysisDispatcher) {
      const context = {
        toolName,
        args,
        thoughtStream,
        agentName: '',
        gate: this.currentGate || 'PLAN',
        filePath: typeof args.filePath === 'string' ? args.filePath
          : typeof args.path === 'string' ? args.path
          : undefined,
      };

      try {
        const dispatchResult: AnalysisDispatchResult = await this.analysisDispatcher.dispatch(context);

        // Convert semantic firewall diagnostics to EnforcementResults
        for (const providerResult of dispatchResult.results) {
          for (const d of providerResult.diagnostics) {
            if (d.severity === 'INFO') continue;

            const level = (d.severity === 'CRITICAL' || d.severity === 'HIGH')
              ? 'CRITICAL' as const
              : d.severity === 'MEDIUM'
                ? 'MEDIUM' as const
                : 'PASS' as const;

            results.push({
              level,
              lobe: 'semantic-firewall',
              findingId: d.findingId || `SF-${d.rule.toUpperCase()}`,
              message: d.message,
              filePath: d.filePath,
              rule: d.rule,
            });
          }
        }

        // If dispatcher blocked execution, return early
        if (!dispatchResult.executionAllowed) {
          results.push({
            level: 'CRITICAL',
            lobe: 'semantic-firewall',
            findingId: 'DISPATCHER-BLOCK',
            message: dispatchResult.blocks.join('; '),
          });
          return results;
        }

        // Add dispatcher warnings
        for (const warn of dispatchResult.warnings) {
          results.push({
            level: 'MEDIUM',
            lobe: 'semantic-firewall',
            findingId: 'DISPATCHER-WARN',
            message: warn,
          });
        }
      } catch (err) {
        // Dispatcher error is non-fatal — log and continue
        logInfo('[EnforcementBrain] AnalysisOrderDispatcher error: ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    // ── EXISTING: Intent classification (everything below is unchanged) ──
    const gate = this.currentGate;

    // 1. Classify intent — use classifyToolCall for tool-invocation input, classify for NL
    //    classifyToolCall() uses TOOL_INTENT_MAP to categorize by tool name + destructive args
    //    classify() uses VerbFrameLexicon for NL sentence intent detection
    let result: import('../karpathy/intent-classifier.js').IntentResult;
    
    // Tool name → intent mapping for tools with empty args
    // Prevents NL classifier from receiving tool names as if they were sentences
    // ALL shark-* diagnostic tools map to non-destructive categories that PASS in ALL gates
    const TOOL_INTENT_MAP: Record<string, { intent: string; action: string }> = {
      'shark-status':             { intent: 'QUERY',   action: 'status' },
      'shark-gate':               { intent: 'MANAGE',  action: 'gate' },
      'shark-evidence':           { intent: 'QUERY',   action: 'evidence' },
      'shark-diagnose':           { intent: 'QUERY',   action: 'diagnose' },
      'shark-health':             { intent: 'QUERY',   action: 'health' },
      'shark-checkpoint':         { intent: 'MANAGE',  action: 'checkpoint' },
      'shark-checkpoint-history': { intent: 'QUERY',   action: 'checkpoint-history' },
      // NOTE: shark-firewall-status and shark-firewall-audit tools are intentionally
      // not implemented because SF status is reported through shark-status and
      // detailed SF diagnostics are available through the SemanticFirewall class directly.
      // Add explicit CLI tools if independent access is needed.
      // 'shark-firewall-status':    { intent: 'QUERY',   action: 'firewall-status' },
      // 'shark-firewall-audit':     { intent: 'AUDIT',   action: 'firewall-audit' },
      'shark-hive-context':       { intent: 'QUERY',   action: 'hive-context' },
      'shark-audit':              { intent: 'AUDIT',   action: 'audit' },
      'shark-vision':             { intent: 'EXPLORE', action: 'vision' },
      'shark-browser':            { intent: 'EXPLORE', action: 'browser' },
      'shark-browser-test':       { intent: 'TEST',    action: 'browser-test' },
      'shark-test-runner':        { intent: 'TEST',    action: 'test-runner' },
      'shark-run-trident':        { intent: 'AUDIT',   action: 'run-trident' },
      'shark-spawn-container':    { intent: 'EXECUTE', action: 'spawn-container' },
    };
    
    if (thoughtStream) {
      // Natural language thought stream — use NL classifier
      const classifyInput = `${toolName}: ${thoughtStream}`;
      result = this.intentClassifier.classify(classifyInput);
    } else if (toolName && args && Object.keys(args).length > 0) {
      // Tool call with args — use tool-call classifier
      result = this.intentClassifier.classifyToolCall(toolName, args as Record<string, unknown>);
    } else if (toolName && TOOL_INTENT_MAP[toolName]) {
      // Tool with empty args — use intent map (prebuilt classification, no NL needed)
      const mapped = TOOL_INTENT_MAP[toolName];
      result = {
        intent: mapped.intent as IntentCategory,
        action: mapped.action,
        target: '',
        enforcement: 'PASS' as const,
        confidence: 1.0,
      };
    } else {
      // Fallback — use NL classifier on tool name only
      result = this.intentClassifier.classify(toolName);
    }

    // 2. FSM transition — accepts IntentResult, returns FSMState
    const fsmState = this.intentFsm.transition(result);
    if (fsmState === 'ERROR') {
      results.push({
        level: 'MEDIUM',
        lobe: 'frontal',
        findingId: 'FRONTAL-FSM-ANOMALY',
        message: `Unexpected FSM transition for ${toolName} in ${gate}.`,
      });
    }

    // 3. Gate-intent matching — SemanticFrame already has allowedGates[]
    //    The VerbFrameLexicon inside IntentClassifier knows which gates each action is allowed in.
    //    If enforcement level is a blocking level from the classifier itself, propagate it.

    // Track consecutive blocks per gate for escalation
    const blockKey = `${gate}:${result.action || 'unknown'}`;
    this.blockCounters.set(blockKey, (this.blockCounters.get(blockKey) || 0) + 1);
    const consecutiveBlocks = this.blockCounters.get(blockKey) || 0;

    if (isBlockingLevel(result.enforcement)) {
      results.push({
        level: 'CRITICAL',
        lobe: 'frontal',
        findingId: 'FRONTAL-CLASSIFIER-BLOCK',
        message: `${result.violation || 'Action blocked by intent classifier.'}`,
        correction: result.correction || 'Review the action and try a different approach.',
      });

      if (consecutiveBlocks >= 3) {
        results.push({
          level: 'MEDIUM',
          lobe: 'frontal',
          findingId: 'FRONTAL-ESCALATION',
          message: `[ESCALATION] Tool "${toolName}" has been blocked ${consecutiveBlocks} times in ${gate} gate. Consider: (1) advancing the gate, (2) using a different tool, or (3) explaining the situation to the user.`,
        });
      }
    }

    // 4. Gate-level intent check — WARN if action is unusual for current gate
    //    'DESTRUCTIVE' actions are BLOCK in PLAN gate, WARN in BUILD gate
    //    'TEST' actions in PLAN gate get a WARN (should be in TEST or VERIFY gate)
    const gateIntentWarnings: Record<string, IntentCategory[]> = {
      PLAN: ['DESTRUCTIVE', 'DEPLOY'],
      BUILD: ['DESTRUCTIVE'],
      VERIFY: ['DESTRUCTIVE', 'DEPLOY'],
      TEST: ['DESTRUCTIVE', 'DEPLOY'],
      AUDIT: ['DESTRUCTIVE', 'DEPLOY', 'CREATE'],
      DELIVERY: ['DESTRUCTIVE', 'MODIFY', 'CREATE'],
    };
    const warnedIntents = gateIntentWarnings[gate] || [];
    if (warnedIntents.includes(result.intent)) {
      results.push({
        level: 'MEDIUM',
        lobe: 'frontal',
        findingId: 'FRONTAL-GATE-MISMATCH',
        message: `${result.intent} action (${result.action}) is unusual in ${gate} gate. Verify intent.`,
      });
    }

    return results;
  }

  /* -- tool.execute.after: RGE + SRE Verification -- */

  /**
   * Process pending RGE/SRE CRITICAL findings with WARN-ONCE pattern.
   * Block the FIRST time per rule per gate, pass through subsequent times.
   * Returns EnforcementResults to prepend to evaluateBefore results.
   */
  private processPendingPostWriteBlocks(): EnforcementResult[] {
    const out: EnforcementResult[] = [];
    const gateStr = this.currentGate;
    while (this.pendingPostWriteBlocks.length > 0) {
      const finding = this.pendingPostWriteBlocks.shift()!;
      const warnedSet = finding.lobe === 'rge' ? this.rgeWarnedForGate : this.sreWarnedForGate;
      const gateKey = `${gateStr}:${finding.findingId}`;
      if (!warnedSet.has(gateKey)) {
        // FIRST TIME for this gate+rule: Block ONCE with context bullet
        warnedSet.add(gateKey);
        out.push({
          level: 'CRITICAL',
          lobe: finding.lobe,
          findingId: finding.findingId,
          message: `[${finding.lobe.toUpperCase()} WARN-ONCE] ${finding.message}. One-time warning — fix and proceed.`,
          correction: 'This blocks once per rule per gate. Subsequent attempts for the same issue will pass through.',
          filePath: finding.filePath,
          rule: finding.rule,
        });
        // Only block on the first unwarned finding — let the rest accumulate
        break;
      }
      // Already warned for this gate+rule — pass through silently
      logInfo(`[${finding.lobe.toUpperCase()}] WARN-ONCE: already warned for ${gateKey}, passing through`);
    }
    return out;
  }

  async evaluateAfter(toolName: string, args: Record<string, unknown>, output: Record<string, unknown>): Promise<EnforcementResult[]> {
    const results: EnforcementResult[] = [];
    if (this.config.rge.enabled && (toolName === 'write' || toolName === 'edit')) {
      results.push(...this.runRgeCheck(args));
    }
    if (this.config.sre.enabled && (toolName === 'write' || toolName === 'edit')) {
      results.push(...this.runSreCheck(toolName, args, output));
    }
    // ── SRE Honesty Engine — post-write honesty audit ──
    if (toolName === 'write' || toolName === 'edit') {
      results.push(...await this.runHonestyCheck(args));
    }
    this.logEnforcement(toolName, results);
    // Collect CRITICAL/HIGH RGE/SRE findings for WARN-ONCE enforcement on next write.
    // These will be processed by processPendingPostWriteBlocks() in the next evaluateBefore.
    const rgeSreBlocks = results.filter(r => isBlockingLevel(r.level) && (r.lobe === 'rge' || r.lobe === 'sre'));
    if (rgeSreBlocks.length > 0) {
      this.pendingPostWriteBlocks.push(...rgeSreBlocks);
    }
    // Fire context manager for write/edit/diagnostic tool calls
    this.fireContextManager(toolName, args, output, results);
    return results;
  }

  /**
   * SRE Honesty Engine check — runs S1-S5 rules against the written content.
   * Fault-tolerant: returns empty array on failure.
   */
  private async runHonestyCheck(args: Record<string, unknown>): Promise<EnforcementResult[]> {
    const r: EnforcementResult[] = [];
    try {
      const filePath = (args?.filePath as string) || '';
      const content = (args?.content as string) || '';
      if (!filePath || !content || !filePath.endsWith('.ts')) return r;

      const findings = await this.slopRemovalEngine.checkWriteTime(content, filePath);
      for (const f of findings) {
        const level = (f.severity === 'CRITICAL' || f.severity === 'HIGH')
          ? 'CRITICAL' as const : 'MEDIUM' as const;
        r.push({
          level,
          lobe: 'sre',
          findingId: `SRE-${f.ruleId}`,
          message: f.message,
          violation: f.message,
          correction: f.remediation || 'Fix the honesty violation',
          filePath,
          rule: f.ruleId,
        });
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logInfo('[EnforcementBrain-runHonestyCheck] Error: ' + errorMsg);
    }
    return r;
  }

  private runRgeCheck(args: Record<string, unknown>): EnforcementResult[] {
    const r: EnforcementResult[] = [];
    const filePath = (args?.filePath as string) || '';
    const content = (args?.content as string) || '';
    if (!filePath || !content || !filePath.endsWith('.ts')) return r;
    try {
      if (!this.rgeEngine) {
        this.rgeEngine = new RuntimeGradeEngine(process.cwd());
      }
      const result = this.rgeEngine.checkWriteTime(content, filePath);
      if (result.report) {
        this.rgeStateMachine.processReport(result.report);
        for (const finding of result.report.semanticFindings || []) {
          const level = (finding.severity === 'CRITICAL' || finding.severity === 'HIGH')
            ? 'CRITICAL' as const : 'MEDIUM' as const;
          r.push({ level, lobe: 'rge', findingId: `RGE-${finding.ruleId || 'UKN'}`, message: finding.message, violation: finding.message, correction: `${finding.file}:${finding.line}`, filePath, rule: finding.ruleId });
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logInfo('[EnforcementBrain-runRgeCheck] Error: ' + errorMsg);
      r.push({ level: 'CRITICAL', lobe: 'rge', findingId: 'RGE-ERR', message: '[P14.7] RGE check failed - default DENY: ' + errorMsg });
    }
    return r;
  }

  private runSreCheck(toolName: string, args: Record<string, unknown>, output: Record<string, unknown>): EnforcementResult[] {
    const r: EnforcementResult[] = [];
    try {
      const content = (args?.content as string) || (output?.output as string) || '';
      if (typeof content === 'string') {
        // E10: detect unverified runtime-grade claims — regex tip-of-spear (no engine needed)
        const e10 = [/runtime[ -]grade(?!\s*audit)/i, /runtime grade verified/i, /p1-p12 compliant/i];
        for (const p of e10) {
          if (p.test(content)) {
            r.push({ level: 'CRITICAL', lobe: 'sre', findingId: 'E10-CLAIM', message: 'E10: cannot claim runtime-grade without SRE', violation: `Matches: ${p.source}`, correction: 'Run sre-audit scope=ship-gate first.' });
          }
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logInfo('[EnforcementBrain-runSreCheck] Error: ' + errorMsg);
      r.push({ level: 'CRITICAL', lobe: 'sre', findingId: 'SRE-ERR', message: '[P14.7] SRE check failed - default DENY: ' + errorMsg });
    }
    return r;
  }

  /**
   * Public API — external code (hooks, gate transitions, milestones) fires context updates.
   * Maps Kraken trigger anchors to Shark equivalents:
   *   complete_todo       → evaluateAfter with results (enforcement completion)
   *   report_to_kraken    → test-runner/diagnostic completion
   *   spawn_*             → shark-spawn-container (container spawn)
   *   execution_brain_analyze → RGE/SRE audit analysis
   *   aggregate_results   → shark-gate advance (gate transition aggregates prior work)
   */
  fireContextUpdate(trigger: string, details: string, status?: string): void {
    // NOTE: This function fires context doc updates (BUILD_STATE, TASK_QUEUE,
    // DECISION_CHAIN, etc.) but does NOT advance the state machine (gate
    // transitions). State machine advancement is centralized at the hook level
    // in tool-after-handler.ts (step 14: auto-advance gate), which runs AFTER
    // this function completes. This prevents race conditions and ensures gate
    // criteria are verified before any transition.
    try {
      const taskId = `ctx-${Date.now().toString(36)}`;
      const resultStatus = status || 'COMPLETE';
      switch (trigger) {
        case 'gate-transition':
          updateDecisionChain(`Gate: ${details}`, `Transition triggered by ${details}`);
          updateChangelog(`Gate: ${details}`, [{ issue: taskId, file: '-', change: `Gate advanced: ${details}` }]);
          updateCompactionSurvival(details.split('→')[0]?.trim() || details, 0, 0, details);
          updatePostCompactionPrompt(details, details.split('→')[1]?.trim() || details, 0, 0);
          break;
        case 'container-test':
          updateBuildStateOnTaskComplete(taskId, resultStatus, `Container test: ${details}`);
          updateTaskQueue(taskId, `Container test: ${details}`, resultStatus as 'COMPLETE' | 'FAILED');
          updateEvidenceState(0, `Container test: ${resultStatus} — ${details}`);
          updateCompactionSurvival('TEST', 0, 0, details);
          updatePostCompactionPrompt(`Container test: ${details}`, 'TEST', 0, 0);
          if (resultStatus === 'FAILED') updateDebugLog('TEST_FAILURE', `Container test failed: ${details}`, 'Test failure', 'Review test output');
          break;
        case 'analysis':
          updateEvidenceState(0, `Analysis: ${details}`);
          updateCompactionSurvival('VERIFY', 0, 0, details);
          updateSoCPreservation([{ pattern: `Analysis: ${details}`, context: details, source: 'fireContextUpdate(analysis)' }]);
          break;
        case 'milestone':
          updateDecisionChain(details, `Milestone reached`);
          updateChangelog(`Milestone: ${details}`, [{ issue: taskId, file: '-', change: details }]);
          updateBuildStateOnTaskComplete(taskId, 'MILESTONE', details);
          updateTaskQueue(taskId, details, 'COMPLETE');
          updateCompactionSurvival('MILESTONE', 0, 0, details);
          updatePostCompactionPrompt(details, 'MILESTONE', 0, 0);
          updateSoCPreservation([{ pattern: details, context: details, source: 'fireContextUpdate(milestone)' }]);
          break;
      }
    } catch (err: unknown) {
      logInfo('[ContextManager] fireContextUpdate error: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  /**
   * Public API — convenience wrapper for fireContextUpdate('milestone', ...)
   * External code (hooks, gate transitions, todowrite) fires milestone updates.
   */
  fireMilestone(details: string): void {
    this.fireContextUpdate('milestone', details, 'MILESTONE');
  }

  /**
   * Stream of consciousness logging — NOT context management.
   * Fires on evaluateAfter() when enforcement has meaningful results (blocks/warns).
   * Appends ONLY to THOUGHT_STREAM.md. Does NOT update build state, task queue,
   * or any other context management doc. Those are handled by fireContextUpdate().
   */
  private fireContextManager(toolName: string, args: Record<string, unknown>, output: Record<string, unknown>, results: EnforcementResult[]): void {
    // Only fire when there are actual enforcement results
    if (results.length === 0) return;

    try {
      const blocks = results.filter((r: EnforcementResult) => isBlockingLevel(r.level));
      const warns = results.filter((r: EnforcementResult) => isWarningLevel(r.level));
      const passes = results.length - blocks.length - warns.length;

      // Build thought stream entry — stream of consciousness, NOT context management
      let thoughtEntry = `tool=${toolName} completed. Enforcement: ${blocks.length} BLOCK, ${warns.length} WARN, ${passes} PASS`;

      for (const block of blocks) {
        thoughtEntry += `\nBLOCKED by ${block.lobe}: ${block.findingId} — ${block.message}`;
      }
      for (const warn of warns) {
        thoughtEntry += `\nWARN by ${warn.lobe}: ${warn.findingId} — ${warn.message}`;
      }

      updateThoughtStream(thoughtEntry);
    } catch (err: unknown) {
      logInfo('[ContextManager] fireContextManager error: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  getBlocks(results: EnforcementResult[]): EnforcementResult[] { return results.filter((r: EnforcementResult) => isBlockingLevel(r.level)); }
  /**
   * @unused — filtering is done inline in fireContextManager. Retained for
   * API consistency with getBlocks() in case external callers need warn-level filtering.
   */
  getWarns(results: EnforcementResult[]): EnforcementResult[] { return results.filter((r: EnforcementResult) => isWarningLevel(r.level)); }

  private logEnforcement(toolName: string, results: EnforcementResult[]): void {
    if (results.length === 0) return;
    try {
      // Wire getBlocks — use instead of inline filter
      const blocks = this.getBlocks(results);
      // Wire getGate — include current gate in enforcement log
      const gate = this.getGate();
      const dir = path.join(this.basePath, 'evidence', 'enforcement');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `enf-${Date.now()}.json`), JSON.stringify({
        passed: blocks.length === 0, results, timestamp: new Date().toISOString(), toolName, sessionId: this.sessionId, gate,
      } as EnforcementReport, null, 2), 'utf-8');

      // Also write structured evidence for audit trail
      logEvidence(this.basePath, {
        type: 'enforcement-log',
        toolName,
        resultCount: results.length,
        blockCount: results.filter((r: EnforcementResult) => isBlockingLevel(r.level)).length,
        warnCount: results.filter((r: EnforcementResult) => isWarningLevel(r.level)).length,
        sessionId: this.sessionId,
        results: results.map((r: EnforcementResult) => ({ lobe: r.lobe, findingId: r.findingId, level: r.level, message: r.message })),
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logInfo('[EnforcementBrain-logEnforcement] Error writing enforcement log: ' + errorMsg);
    }
  }

  getStatus(): Record<string, unknown> {
    return { currentGate: this.currentGate, sessionId: this.sessionId, fsmState: this.intentFsm.getState() };
  }

  reset(): void {
    this.streamingBuffer.clear();
    this.intentFsm.reset();
    this.currentGate = 'PLAN';
    this.rgeStateMachine = new RGEStateMachine();
    this.rgeWarnedForGate.clear();
    this.sreWarnedForGate.clear();
    this.pendingPostWriteBlocks = [];
  }
}
