/**
 * Planning Brain — 3-Lobe Intelligence Architecture
 * 
 * Orchestrates Common Sense, Context Management, and Frontal (PSM) lobes.
 * 
 * CRITICAL SAFETY SWITCH: All methods are inert unless
 * process.env.SHARK_PLANNING_BRAIN === 'enabled'.
 * This prevents a buggy planning brain from breaking the running agent on first load.
 */

import { CommonSenseLobe } from './common-sense-lobe.js';
import { ContextManagementLobe } from './context-management-lobe.js';
import { type LoopState, createLoopState, detectLoop, getEscalationAction } from './loop-detector.js';
import { type VerificationMatrix, loadMatrix, saveMatrix } from '../../shared/verification-matrix.js';
import { StructuredBlockError } from '../enforcement-brain/index.js';
import { isSharkAgent } from '../../shared/agent-identity.js';

export interface PlanningBrainConfig {
  basePath: string;
  contextDir: string;
}

export class PlanningBrain {
  private commonSense: CommonSenseLobe | null = null;
  private contextMgmt: ContextManagementLobe | null = null;
  private loopState: LoopState | null = null;
  private matrix: VerificationMatrix | null = null;
  private config: PlanningBrainConfig;
  private _enabled: boolean;
  private _bibleInjected: boolean = false;

  constructor(config: PlanningBrainConfig) {
    this.config = config;
    this._enabled = process.env.SHARK_PLANNING_BRAIN === 'enabled';
    if (!this._enabled) return; // Safety switch: no-op mode

    this.commonSense = new CommonSenseLobe(config.basePath, config.contextDir);
    this.contextMgmt = new ContextManagementLobe(config.basePath, config.contextDir);
    this.loopState = createLoopState();
    this.matrix = loadMatrix(config.basePath);
  }

  get enabled(): boolean { return this._enabled; }

  markBibleInjected(): void {
    if (!this._enabled) return;
    this._bibleInjected = true;
    this.commonSense?.markBibleInjected();
  }

  // ===== HOOK: tool.execute.before =====

  onBeforeExecution(toolName: string, args: unknown, agent?: string): { bullets: string[] } {
    if (!this._enabled) return { bullets: [] };
    if (agent && !isSharkAgent(agent)) return { bullets: [] };

    if (this.loopState) {
      const loopResult = detectLoop(this.loopState, toolName, {});
      const escalation = getEscalationAction(this.loopState);

      if (escalation.action === 'block-psm') {
        throw new StructuredBlockError({
          level: 'BLOCK',
          lobe: 'frontal',
          findingId: 'PSM-ACTIVATION',
          message: escalation.message || '[LOOP DETECTED] Problem Solving Mode activated.',
          correction: 'Run Trident PSM before continuing.',
        });
      }
      if (escalation.action === 'inject-context' || escalation.action === 'inject-common-sense') {
        // Loop escalation is ADDITIVE — append to existing bullets, don't replace
        const bullets: string[] = [];
        const csBullet = this.commonSense?.evaluateBeforeExecution(toolName, args, this.matrix || []) || null;
        const ctxBullet = this.contextMgmt?.injectWarmContext(toolName, args) || null;
        if (csBullet) bullets.push(csBullet);
        if (ctxBullet) bullets.push(ctxBullet);
        if (escalation.message) bullets.push(escalation.message);
        return { bullets };
      }
    }

    // No loop: collect context + common sense bullets
    const bullets: string[] = [];
    const csBullet = this.commonSense?.evaluateBeforeExecution(toolName, args, this.matrix || []) || null;
    const ctxBullet = this.contextMgmt?.injectWarmContext(toolName, args) || null;
    if (csBullet) bullets.push(csBullet);
    if (ctxBullet) bullets.push(ctxBullet);
    return { bullets };
  }

  // ===== HOOK: tool.execute.after =====

  onAfterExecution(toolName: string, args: unknown, output: unknown, gate: string, agent?: string): { driftWarning: string | null } {
    if (!this._enabled) return { driftWarning: null };
    if (agent && !isSharkAgent(agent)) return { driftWarning: null };

    this.contextMgmt?.updateRelevantDocs(toolName, args, output, gate);
    this.commonSense?.evaluateAfterExecution(toolName, args, output, this.matrix || []);

    if (this.matrix) saveMatrix(this.config.basePath, this.matrix);

    if (this.loopState && this.loopState.totalLoopCount > 0 && this.loopState.totalLoopCount % 5 === 0) {
      const drift = this.contextMgmt?.detectDrift();
      if (drift?.detected) {
        return { driftWarning: `[DRIFT] ${drift.context}` };
      }
    }

    return { driftWarning: null };
  }

  // ===== HOOK: experimental.chat.system.transform =====

  getSystemInjections(): string[] {
    if (!this._enabled) return [];
    const injections: string[] = [];
    const matrix = this.matrix || [];
    const untested = matrix.filter((r: VerificationMatrix[number]) => r.status !== 'behavioral-pass');
    for (const req of untested) {
      injections.push(`[VERIFY] ${req.id}:${req.status}. Test: ${req.behavioralTest.action}. Pass: ${req.behavioralTest.passCondition}.`);
    }
    return injections;
  }

  // ===== HOOK: experimental.chat.messages.transform =====

  onMessageStream(messages: unknown[]): string[] {
    if (!this._enabled) return [];
    return this.contextMgmt?.processMessageStream(messages) || [];
  }

  // ===== HOOK: experimental.session.compacting =====

  saveState(): Record<string, unknown> {
    return {
      loopState: this.loopState,
      matrix: this.matrix,
      contextState: this.contextMgmt?.saveState(),
    };
  }

  restoreState(state: Record<string, unknown>): void {
    if (!this._enabled) return;
    if (state.loopState) this.loopState = state.loopState as LoopState;
    if (state.matrix) this.matrix = state.matrix as VerificationMatrix;
    if (state.contextState) this.contextMgmt?.restoreState(state.contextState as any);
  }

  getMatrix(): VerificationMatrix { return this.matrix || []; }
}

// Singleton (legacy support — deprecated, use Registry instead)
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

// Re-export registry types
export type { SharkConfig } from './planning-brain-registry.js';
