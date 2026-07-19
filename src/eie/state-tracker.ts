/**
 * src/eie/state-tracker.ts — Agent State Tracker
 *
 * Tracks the current agent state across tool calls.
 * Updated by hook handlers, queried by the context matcher.
 *
 * Implements dynamic guardrails (EIE §13): computes enforcement
 * profile based on success rate and violation rate, adapting
 * enforcement intensity over the session.
 *
 * Part of EIE Phase 2 (EIE_DESIGN_SPEC.md §4).
 */

import type { AgentState, EngineFinding, EnforcementConfig, EnforcementProfile } from './types';

/** Phase of the current tool call lifecycle. */
type TrackerPhase = 'pre-execution' | 'post-execution' | 'gate-evaluation';

/**
 * Tracks the current agent state across tool calls.
 * Updated by hook handlers, queried by context matcher.
 */
export class StateTracker {
  private _state: AgentState;
  private _totalCalls: number = 0;
  private _successfulCalls: number = 0;
  private _violations: number = 0;
  /** Forced enforcement profile (PSE loop escalation can force 'guided'). Null = compute dynamically. */
  private _forcedProfile: EnforcementProfile | null = null;

  constructor(gate: string = 'plan') {
    this._state = {
      gate,
      toolName: '',
      engineFindings: [],
      evidenceRegistered: [],
      phase: 'pre-execution',
    };
  }

  /** Get a defensive copy of the current state. */
  get state(): AgentState {
    return { ...this._state };
  }

  // ── State Updates ──────────────────────────────────────────

  updateGate(gate: string): void {
    this._state.gate = gate;
  }

  updateTool(toolName: string, filePath?: string): void {
    this._state.toolName = toolName;
    this._state.filePath = filePath;
    this._state.fileType = filePath ? this.detectFileType(filePath) : undefined;
    this._totalCalls++;
  }

  addFinding(finding: EngineFinding): void {
    this._state.engineFindings.push(finding);
    if (finding.severity === 'CRITICAL' || finding.severity === 'HIGH') {
      this._violations++;
    }
  }

  clearFindings(): void {
    this._state.engineFindings = [];
  }

  registerEvidence(evidenceId: string): void {
    if (!this._state.evidenceRegistered.includes(evidenceId)) {
      this._state.evidenceRegistered.push(evidenceId);
    }
  }

  setLoopType(loopType: string | undefined): void {
    this._state.loopType = loopType;
  }

  setDriftLevel(level: number | undefined): void {
    this._state.driftLevel = level;
  }

  setErrorPattern(pattern: string | undefined): void {
    this._state.errorPattern = pattern;
  }

  setGateTransition(transition: string | undefined): void {
    this._state.gateTransition = transition;
  }

  setPhase(phase: TrackerPhase): void {
    this._state.phase = phase;
  }

  markSuccess(): void {
    this._successfulCalls++;
    this._state.successRate = this._totalCalls > 0 ? this._successfulCalls / this._totalCalls : 0;
  }

  // ── Accessors for Dynamic Guardrails (EIE §13) ─────────────

  /** Total number of tracked tool calls. */
  getTotalCalls(): number {
    return this._totalCalls;
  }

  /** Fraction of successful calls (0.0–1.0). */
  getSuccessRate(): number {
    return this._totalCalls > 0 ? this._successfulCalls / this._totalCalls : 0;
  }

  /** Fraction of calls with violations (0.0–1.0). */
  getViolationRate(): number {
    return this._totalCalls > 0 ? this._violations / this._totalCalls : 0;
  }

  /** Raw count of successful calls. */
  getSuccessfulCalls(): number {
    return this._successfulCalls;
  }

  /** Raw count of calls with violations. */
  getViolations(): number {
    return this._violations;
  }

  // ── Dynamic Guardrails (EIE §13) ───────────────────────────

  /**
   * Force a specific enforcement profile. Used by PSE loop escalation
   * to switch to GUIDED when occurrence reaches 3 (spec §8.4).
   *
   * Pass null to revert to dynamic computation.
   */
  setEnforcementProfile(profile: EnforcementProfile | null): void {
    this._forcedProfile = profile;
  }

  /**
   * Compute the enforcement profile based on session performance.
   *
   * If a profile was forced via setEnforcementProfile() (e.g., by PSE loop
   * escalation), it overrides the dynamic computation.
   *
   * - TRUSTED: success >80%, violation <10% → relaxed checks, minimal guidance
   * - STANDARD: normal → every-write checks, standard guidance
   * - GUIDED: violation >30% or PSE escalation → every-write checks, high guidance
   */
  getEnforcementProfile(): EnforcementConfig {
    // ── Forced profile (PSE loop escalation §8.4) ──
    if (this._forcedProfile === 'guided') {
      return {
        preWriteAnalysis: 'every',
        evidenceVerification: 'strict',
        guidanceFrequency: 'high',
        profile: 'guided',
      };
    }
    if (this._forcedProfile === 'trusted') {
      return {
        preWriteAnalysis: 'sampled',
        evidenceVerification: 'trust',
        guidanceFrequency: 'minimal',
        profile: 'trusted',
      };
    }

    const successRate = this._state.successRate ?? 0;
    const violationRate = this._totalCalls > 0 ? this._violations / this._totalCalls : 0;

    if (successRate > 0.8 && violationRate < 0.1) {
      return {
        preWriteAnalysis: 'sampled',
        evidenceVerification: 'trust',
        guidanceFrequency: 'minimal',
        profile: 'trusted',
      };
    }

    if (violationRate > 0.3) {
      return {
        preWriteAnalysis: 'every',
        evidenceVerification: 'strict',
        guidanceFrequency: 'high',
        profile: 'guided',
      };
    }

    return {
      preWriteAnalysis: 'every',
      evidenceVerification: 'standard',
      guidanceFrequency: 'normal',
      profile: 'standard',
    };
  }

  // ── Helpers ────────────────────────────────────────────────

  private detectFileType(filePath: string): 'ts' | 'js' | 'md' | 'json' | 'other' {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'ts';
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'js';
    if (filePath.endsWith('.md')) return 'md';
    if (filePath.endsWith('.json')) return 'json';
    return 'other';
  }
}

// ── Singleton Management ───────────────────────────────────────

let _tracker: StateTracker | null = null;

/**
 * Get the singleton StateTracker instance.
 * Lazily initialized on first access.
 */
export function getStateTracker(): StateTracker {
  if (!_tracker) _tracker = new StateTracker();
  return _tracker;
}

/**
 * Reset the singleton — drops the reference for a fresh session.
 */
export function resetStateTracker(): void {
  _tracker = null;
}
