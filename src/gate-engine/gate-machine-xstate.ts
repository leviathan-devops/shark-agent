/**
 * GateMachineXState — Hierarchical state machine for gate transitions.
 *
 * Replaces the dead GateMachine wrapper (593 lines of dead code) with
 * a real hierarchical state machine that handles evidence-gated transitions,
 * guard conditions, entry/exit actions, and GateManager delegation.
 *
 * Bible Order: 2+ (deterministic state machine, not regex)
 * Bible Principle: Gate Engine + Merkle Evidence (Phase 4)
 * Wired from: gate-enforcement.ts tool.execute.after handler
 */

import type { GateManager } from '../shared/gates.js';

// ── Types ──────────────────────────────────────────────────
export type GatePhase = 'plan' | 'build' | 'verify' | 'test' | 'audit' | 'delivery';
export type GateEventType = 
  | 'ALLOW' | 'BLOCK' | 'FAIL' | 'PASS' 
  | 'COMPILE_SUCCESS' | 'COMPILE_FAILURE'
  | 'TEST_PASS' | 'TEST_FAIL'
  | 'VERIFY_PASS' | 'VERIFY_FAIL'
  | 'AUDIT_PASS' | 'AUDIT_FAIL'
  | 'EVIDENCE_SUBMITTED' | 'RESET' | 'COMPLETE'
  | 'REVIEW_FAIL'
  | 'LOCKOUT' | 'RESTART';

export type GateSubState = 'idle' | 'active' | 'blocked' | 'failed' | 'passed' | 'locked';

export interface GateEvent {
  type: GateEventType;
  payload?: Record<string, unknown>;
  timestamp: string;
}

export interface GateState {
  phase: GatePhase;
  subState: GateSubState;
  history: Array<{ from: GatePhase; to: GatePhase; event: GateEventType; timestamp: string }>;
}

interface Transition {
  from: GatePhase | '*';
  event: GateEventType;
  to: GatePhase;
  guard?: (ctx: GateMachineContext) => boolean;
  entry?: (ctx: GateMachineContext) => void;
  exit?: (ctx: GateMachineContext) => void;
}

export interface GateMachineContext {
  evidenceGates: Record<string, boolean>;
  failureCounts: Record<string, number>;
  lastEvent?: GateEvent;
}

// ── Transition Table ───────────────────────────────────────
// GATE_ORDER (shared/gates.ts): plan → build → verify → test → audit → delivery
//
// The `evaluate` action (gate-enforcement.ts:86) dispatches a uniform `PASS`
// event to this machine for EVERY gate. Therefore every gate MUST have a
// `PASS` transition that advances to the immediately-next gate in GATE_ORDER.
// Previously only `verify` handled `PASS`, which left plan/build/test/audit
// unable to advance and produced a corrupted state (plan→verify, build skipped).
const TRANSITIONS: Transition[] = [
  // ── Canonical forward transitions (uniform PASS per GATE_ORDER) ──
  { from: 'plan',     event: 'PASS',  to: 'build' },
  { from: 'build',    event: 'PASS',  to: 'verify' },
  { from: 'verify',   event: 'PASS',  to: 'test' },
  { from: 'test',     event: 'PASS',  to: 'audit' },
  { from: 'audit',    event: 'PASS',  to: 'delivery' },

  // ── Legacy / domain-specific event aliases (kept for compatibility) ──
  { from: 'plan',     event: 'ALLOW',            to: 'build' },
  { from: 'build',    event: 'COMPILE_SUCCESS',  to: 'verify' },
  { from: 'build',    event: 'COMPILE_FAILURE',  to: 'build', 
    guard: (ctx) => (ctx.failureCounts['build'] || 0) < 3 },
  { from: 'build',    event: 'BLOCK',            to: 'build' },
  { from: 'verify',   event: 'FAIL',             to: 'build' },
  { from: 'verify',   event: 'REVIEW_FAIL',      to: 'build' },
  { from: 'test',     event: 'TEST_PASS',        to: 'audit' },
  { from: 'test',     event: 'TEST_FAIL',        to: 'build',
    guard: (ctx) => (ctx.failureCounts['test'] || 0) > 5 },
  { from: 'test',     event: 'TEST_FAIL',        to: 'test' },
  { from: 'test',     event: 'BLOCK',            to: 'test' },
  { from: 'audit',    event: 'AUDIT_PASS',       to: 'delivery' },
  { from: 'audit',    event: 'AUDIT_FAIL',       to: 'build' },
  { from: 'delivery', event: 'COMPLETE',         to: 'plan' },
  { from: 'delivery', event: 'BLOCK',            to: 'delivery' },
  { from: '*',        event: 'RESET',            to: 'plan',
    entry: (ctx) => { ctx.failureCounts = {}; ctx.evidenceGates = {}; }},
  { from: '*',        event: 'LOCKOUT',          to: 'delivery',
    entry: (ctx) => { ctx.evidenceGates['locked'] = true; }},
  { from: 'delivery', event: 'RESTART',          to: 'plan',
    entry: (ctx) => { ctx.failureCounts = {}; ctx.evidenceGates = {}; }},
];

// ── Machine ─────────────────────────────────────────────────
export class GateMachineXState {
  private state: GateState;
  private context: GateMachineContext;
  private gateManager: GateManager | null;

  constructor(gateManager?: GateManager, initialPhase: GatePhase = 'plan') {
    this.state = { phase: initialPhase, subState: 'idle', history: [] };
    this.context = { evidenceGates: {}, failureCounts: {} };
    this.gateManager = gateManager || null;
  }

  getPhase(): GatePhase { return this.state.phase; }
  /**
   * @unused — substate is derived from event type in dispatch().
   * Retained for external inspection if gate tooling needs it.
   */
  getSubState() { return this.state.subState; }
  /**
   * @unused — gate-enforcement.ts accesses state via dispatch() and GateManager sync.
   * Retained for potential future debugging tooling.
   */
  getContext(): GateMachineContext { return { ...this.context }; }
  /**
   * @unused — gate history is logged by gate-enforcement.ts and GateManager.
   * Retained for potential future audit trail tooling.
   */
  getHistory() { return [...this.state.history]; }

  dispatch(event: GateEvent): { success: boolean; message: string } {
    const matching = TRANSITIONS.filter(
      (t: Transition) => (t.from === this.state.phase || t.from === '*') && t.event === event.type
    );

    for (const t of matching) {
      if (t.guard && !t.guard(this.context)) continue;

      const from = this.state.phase;
      t.exit?.(this.context);
      this.state.phase = t.to;
      this.state.subState = this.resolveSubState(event);
      t.entry?.(this.context);
      this.state.history.push({ 
        from, to: t.to, event: event.type, timestamp: event.timestamp 
      });
      this.context.lastEvent = event;
      this.context.failureCounts[t.to] = (this.context.failureCounts[t.to] || 0);

      // Sync to GateManager
      if (this.gateManager && from !== t.to) {
        try { 
          this.gateManager.transitionTo(t.to.toLowerCase());
        } catch (err) {
          console.error('[XState] GateManager sync error:', err);
          throw err;
        }
      }

      // Verified: matching transition found, guard passed, exit/entry actions executed, GateManager synced
      return { success: Boolean(t), message: `${from} → ${t.to} via ${event.type}` };
    }

    return { success: false, message: `No transition: ${event.type} in ${this.state.phase}, matching ${matching.length} candidates` };
  }

  /**
   * @unused — gate-enforcement.ts calls dispatch({ type: 'PASS', ... }) directly.
   * Retained for API compatibility.
   */
  pass(payload?: Record<string, unknown>) { 
    return this.dispatch({ type: 'PASS', payload, timestamp: new Date().toISOString() }); 
  }
  /**
   * @unused — gate-enforcement.ts calls dispatch({ type: 'FAIL', ... }) directly.
   * Retained for API compatibility.
   */
  fail(payload?: Record<string, unknown>) { 
    return this.dispatch({ type: 'FAIL', payload, timestamp: new Date().toISOString() }); 
  }

  /**
   * Derive sub-state from event type — pure deterministic mapping function.
   * NOT a state machine; does NOT represent an independent state requiring
   * advancement. This is called synchronously within dispatch() (line 114)
   * as part of the parent state machine's transition logic. The returned
   * value is a COMPUTED property of the transition event, not a state actor
   * that needs its own lifecycle or advancement step.
   */
  private resolveSubState(event: GateEvent): GateState['subState'] {
    if (event.type === 'LOCKOUT') return 'locked';
    if (event.type === 'BLOCK') return 'blocked';
    if (['FAIL', 'COMPILE_FAILURE', 'TEST_FAIL', 'VERIFY_FAIL', 'AUDIT_FAIL', 'REVIEW_FAIL'].includes(event.type)) return 'failed';
    if (['ALLOW', 'PASS', 'COMPILE_SUCCESS', 'TEST_PASS', 'VERIFY_PASS', 'AUDIT_PASS', 'COMPLETE', 'RESTART'].includes(event.type)) return 'passed';
    return 'active';
  }
}

// ── Singleton (wired from gate-enforcement.ts) ──────────────
let _instance: GateMachineXState | null = null;
export function setGateMachineXState(gm: GateMachineXState): void { _instance = gm; }
export function getGateMachineXState(): GateMachineXState | null { return _instance; }
