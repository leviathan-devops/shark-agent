import * as path from 'node:path';
import * as fs from 'node:fs';
import { type EnforcementResult, type EnforcementReport, type EnforcementBrainConfig, type GatePhase, DEFAULT_ENFORCEMENT_CONFIG } from './types.js';
import { IntentClassifier } from '../karpathy/intent-classifier.js';
import { IntentFSM } from '../karpathy/fsm.js';
import { StreamingBuffer } from '../karpathy/streaming-buffer.js';
import { RuntimeGradeEngine } from '../rge/rge-engine.js';
import type { RGEAuditReport } from '../rge/report-types.js';
import { RGEStateMachine } from '../rge/state-machine.js';
import { SlopRemovalEngine } from '../sre/slop-removal-engine.js';
import {
  updateBuildStateOnTaskComplete, updateTaskQueue, updateDecisionChain, updateDebugLog, updateChangelog,
  updateCompactionSurvival, updateEvidenceState, updatePostCompactionPrompt, updateSoCPreservation,
  updateThoughtStream,
} from '../../shared/context-manager.js';

export class StructuredBlockError extends Error {
  readonly layer: string;
  readonly reason: string;
  readonly detected: string;
  readonly correction: string;
  readonly lobe: string;
  constructor(result: EnforcementResult) {
    super(`[${result.lobe.toUpperCase()}] ${result.message}`);
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
    console.error('[EvidenceLogger] Failed to write evidence:', e);
  }
}

export class EnforcementBrain {
  private config: EnforcementBrainConfig;
  private basePath: string;
  private intentClassifier: IntentClassifier;
  private intentFsm: IntentFSM;
  private streamingBuffer: StreamingBuffer;
  private sreEngine: SlopRemovalEngine | null = null;
  private rgeEngine: RuntimeGradeEngine | null = null;
  private rgeStateMachine: RGEStateMachine;
  private currentGate: GatePhase = 'PLAN';
  private sessionId: string = '';

  constructor(config: Partial<EnforcementBrainConfig> = {}) {
    this.config = { ...DEFAULT_ENFORCEMENT_CONFIG, ...config };
    this.basePath = this.config.basePath;
    this.intentClassifier = new IntentClassifier();
    this.intentFsm = new IntentFSM();
    this.streamingBuffer = new StreamingBuffer();
    this.rgeStateMachine = new RGEStateMachine();
  }

  setSession(sessionId: string): void { this.sessionId = sessionId; }
  setGate(gate: GatePhase): void { this.currentGate = gate; this.intentClassifier.setGate(gate); }

  /* -- tool.execute.before: Frontal Lobe Intent Detection -- */
  evaluateBefore(toolName: string, args: Record<string, unknown>, thoughtStream?: string): EnforcementResult[] {
    if (!this.config.frontalLobe.enabled) return [];
    const results: EnforcementResult[] = [];
    const intent = this.intentClassifier.classifyToolCall(toolName, args);
    if (intent) {
      this.intentFsm.transition(intent);
      if (intent.enforcement === 'BLOCK') {
        results.push({ level: 'BLOCK', lobe: 'frontal', findingId: `INTENT-${intent.intent}`, message: intent.violation || `Action blocked`, violation: intent.violation, correction: intent.correction });
      } else if (intent.enforcement === 'WARN') {
        results.push({ level: 'WARN', lobe: 'frontal', findingId: `INTENT-WARN-${intent.intent}`, message: intent.violation || `Warning`, violation: intent.violation, correction: intent.correction });
      }
    }
    if (thoughtStream && thoughtStream.length > 0) {
      this.streamingBuffer.feed(thoughtStream);
      for (const sentence of this.streamingBuffer.extractSentences()) {
        const t = this.intentClassifier.classify(sentence);
        if (t && t.enforcement === 'BLOCK') {
          results.push({ level: 'BLOCK', lobe: 'frontal', findingId: `THOUGHT-${t.intent}`, message: t.violation || 'Dangerous intent', violation: t.violation, correction: t.correction });
        }
      }
    }
    return results;
  }

  /* -- tool.execute.after: RGE + SRE Verification -- */
  async evaluateAfter(toolName: string, args: Record<string, unknown>, output: Record<string, unknown>): Promise<EnforcementResult[]> {
    const results: EnforcementResult[] = [];
    if (this.config.rge.enabled && (toolName === 'write' || toolName === 'edit')) {
      results.push(...this.runRgeCheck(args));
    }
    if (this.config.sre.enabled) {
      results.push(...this.runSreCheck(toolName, args, output));
    }
    this.logEnforcement(toolName, results);
    // Fire context manager for write/edit/diagnostic tool calls
    this.fireContextManager(toolName, args, output, results);
    return results;
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
            ? 'BLOCK' as const : 'WARN' as const;
          r.push({ level, lobe: 'rge', findingId: `RGE-${finding.ruleId || 'UKN'}`, message: finding.message, violation: finding.message, correction: `${finding.file}:${finding.line}`, filePath, rule: finding.ruleId });
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[EnforcementBrain-runRgeCheck] Error: ' + errorMsg);
      r.push({ level: 'BLOCK', lobe: 'rge', findingId: 'RGE-ERR', message: '[P14.7] RGE check failed - default DENY: ' + errorMsg });
    }
    return r;
  }

  private runSreCheck(toolName: string, args: Record<string, unknown>, output: Record<string, unknown>): EnforcementResult[] {
    const r: EnforcementResult[] = [];
    try {
      if (!this.sreEngine) {
        this.sreEngine = new SlopRemovalEngine(
          path.join(this.basePath, '..')
        );
      }
      const content = (args?.content as string) || (output?.output as string) || '';
      if (typeof content === 'string') {
        const e10 = [/runtime[ -]grade(?!\s*audit)/i, /runtime grade verified/i, /p1-p12 compliant/i];
        for (const p of e10) {
          if (p.test(content)) {
            r.push({ level: 'BLOCK', lobe: 'sre', findingId: 'E10-CLAIM', message: 'E10: cannot claim runtime-grade without SRE', violation: `Matches: ${p.source}`, correction: 'Run sre-audit scope=ship-gate first.' });
          }
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[EnforcementBrain-runSreCheck] Error: ' + errorMsg);
      r.push({ level: 'BLOCK', lobe: 'sre', findingId: 'SRE-ERR', message: '[P14.7] SRE check failed - default DENY: ' + errorMsg });
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
      console.error('[ContextManager] fireContextUpdate error: ' + (err instanceof Error ? err.message : String(err)));
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
      const blocks = results.filter(r => r.level === 'BLOCK');
      const warns = results.filter(r => r.level === 'WARN');
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
      console.error('[ContextManager] fireContextManager error: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  private logEnforcement(toolName: string, results: EnforcementResult[]): void {
    if (results.length === 0) return;
    try {
      const dir = path.join(this.basePath, 'evidence', 'enforcement');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `enf-${Date.now()}.json`), JSON.stringify({
        passed: results.every(r => r.level !== 'BLOCK'), results, timestamp: new Date().toISOString(), toolName, sessionId: this.sessionId,
      } as EnforcementReport, null, 2), 'utf-8');

      // Also write structured evidence for audit trail
      logEvidence(this.basePath, {
        type: 'enforcement-log',
        toolName,
        resultCount: results.length,
        blockCount: results.filter(r => r.level === 'BLOCK').length,
        warnCount: results.filter(r => r.level === 'WARN').length,
        sessionId: this.sessionId,
        results: results.map(r => ({ lobe: r.lobe, findingId: r.findingId, level: r.level, message: r.message })),
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[EnforcementBrain-logEnforcement] Error writing enforcement log: ' + errorMsg);
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
    this.sreEngine = null;
  }
}
