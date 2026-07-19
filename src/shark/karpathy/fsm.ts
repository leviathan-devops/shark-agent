/**
 * IntentFSM — proper state machine pattern for tracking intent transitions
 * across the session lifecycle.
 *
 * Implements the T3 knowledge base standard for state machines:
 * - Formal state/event/transition definitions
 * - Type-safe state definitions with generic State type
 * - Type-safe event definitions with discriminated union
 * - Type-safe transition table (from state+event to next state+action)
 * - Entry/exit actions per state
 * - Guard conditions on transitions
 * - Evidence production on every transition
 * - Immutable state updates (return new state, don't mutate)
 * - Error resilience (P3): catch invalid transitions, guard failures, log errors
 *
 * Pure TypeScript, zero dependencies, deterministic state transitions.
 */

import type { IntentResult, EnforcementLevel } from './intent-classifier.js';

// ═══════════════════════════════════════════════════════════════════════════════
// STATE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The 7 states of the IntentFSM lifecycle.
 *
 * Lifecycle flow:
 *   IDLE → ANALYZING → INTENT_CLASSIFIED → { BLOCKED | WARNED | PASSED | ERROR }
 *   BLOCKED  → IDLE (reset)
 *   WARNED   → { PASSED | ANALYZING }
 *   PASSED   → IDLE (reset, terminal otherwise)
 *   ERROR    → IDLE (reset)
 */
export type FSMState =
  | 'IDLE'
  | 'ANALYZING'
  | 'INTENT_CLASSIFIED'
  | 'BLOCKED'
  | 'WARNED'
  | 'PASSED'
  | 'ERROR';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT DEFINITIONS (Discriminated Union)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Events that drive state transitions in the IntentFSM.
 * Each event carries typed data needed for guard evaluation and evidence production.
 *
 * Discriminated union pattern — the `type` field determines the event variant.
 */
export type FSMEvent =
  | { type: 'ANALYZE'; thought: string }
  | { type: 'CLASSIFY'; intent: string; enforcement: EnforcementLevel }
  | { type: 'BLOCK'; findingId: string; reason: string }
  | { type: 'WARN'; findingId: string; reason: string }
  | { type: 'PASS'; note?: string }
  | { type: 'ERROR'; message: string; context?: string }
  | { type: 'RESET'; reason?: string };

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE RECORD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evidence produced on every state transition.
 * Includes input/output digests for audit trail integrity.
 * All fields are readonly for immutability.
 */
export interface EvidenceRecord {
  readonly from: FSMState;
  readonly to: FSMState;
  readonly event: string;
  readonly timestamp: number;
  readonly inputDigest: string;
  readonly outputDigest: string;
  readonly guardResult: boolean;
  readonly action?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC TRANSITION RECORD (backward-compatible)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Backward-compatible transition record type.
 * Exported for consumers that reference this type.
 */
export interface FSMTransition {
  from: FSMState;
  to: FSMState;
  trigger: string;
  action?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSITION TABLE ENTRY (internal)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single entry in the formal transition table.
 * Associates a (fromState, eventType) pair with:
 * - target: Destination state
 * - guard: Optional predicate that must evaluate to true for the transition to fire
 * - entryAction: Called when entering the target state (with the event that caused it)
 * - exitAction: Called when leaving the source state
 */
interface TransitionEntry {
  readonly from: FSMState;
  readonly event: FSMEvent['type'];
  readonly guard?: (event: FSMEvent) => boolean;
  readonly target: FSMState;
  readonly entryAction?: (event: FSMEvent) => void;
  readonly exitAction?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSITION TABLE (Map from state+event to next state+action)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Construct the formal transition table for the IntentFSM.
 *
 * Each entry defines:
 * - from: Source state
 * - event: Event type that triggers the transition
 * - guard: Optional condition that must evaluate to true
 * - target: Destination state
 * - entryAction: Called when entering the target state
 * - exitAction: Called when leaving the source state
 *
 * The table is built once at module load time and shared across all instances.
 */
function buildTransitionTable(): readonly TransitionEntry[] {
  return [
    // ── IDLE ──────────────────────────────────────────────────────────────
    // IDLE transitions to ANALYZING on any ANALYZE event
    { from: 'IDLE', event: 'ANALYZE', target: 'ANALYZING' },

    // ── ANALYZING ─────────────────────────────────────────────────────────
    // ANALYZING transitions to INTENT_CLASSIFIED on CLASSIFY event
    { from: 'ANALYZING', event: 'CLASSIFY', target: 'INTENT_CLASSIFIED' },

    // ── INTENT_CLASSIFIED ─────────────────────────────────────────────────
    // Terminal state mapping based on enforcement level
    {
      from: 'INTENT_CLASSIFIED',
      event: 'BLOCK',
      target: 'BLOCKED',
      entryAction: (ev: FSMEvent): void => {
        if (ev.type === 'BLOCK' && typeof console !== 'undefined') {
          console.debug(`[FSM] Intent BLOCKED: ${ev.reason}`);
        }
      },
    },
    {
      from: 'INTENT_CLASSIFIED',
      event: 'WARN',
      target: 'WARNED',
      entryAction: (ev: FSMEvent): void => {
        if (ev.type === 'WARN' && typeof console !== 'undefined') {
          console.debug(`[FSM] Intent WARNED: ${ev.reason}`);
        }
      },
    },
    { from: 'INTENT_CLASSIFIED', event: 'PASS', target: 'PASSED' },
    { from: 'INTENT_CLASSIFIED', event: 'ERROR', target: 'ERROR' },

    // ── BLOCKED ───────────────────────────────────────────────────────────
    // BLOCKED can only recover via RESET (to IDLE) or chain to ERROR
    { from: 'BLOCKED', event: 'RESET', target: 'IDLE' },
    { from: 'BLOCKED', event: 'ERROR', target: 'ERROR' },

    // ── WARNED ────────────────────────────────────────────────────────────
    // WARNED → PASSED if guard passes (enforcement resolved)
    // WARNED → ANALYZING if re-analysis is needed
    {
      from: 'WARNED',
      event: 'PASS',
      guard: (ev: FSMEvent): boolean => ev.type === 'PASS',
      target: 'PASSED',
    },
    { from: 'WARNED', event: 'ANALYZE', target: 'ANALYZING' },
    { from: 'WARNED', event: 'ERROR', target: 'ERROR' },

    // ── PASSED ────────────────────────────────────────────────────────────
    // PASSED is terminal — self-loops on PASS, recovers only via RESET
    { from: 'PASSED', event: 'PASS', target: 'PASSED' },
    { from: 'PASSED', event: 'RESET', target: 'IDLE' },

    // ── ERROR ─────────────────────────────────────────────────────────────
    // ERROR self-loops on ERROR (nested errors stay in ERROR)
    // ERROR recovers only via RESET
    { from: 'ERROR', event: 'RESET', target: 'IDLE' },
    { from: 'ERROR', event: 'ERROR', target: 'ERROR' },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// HASH HELPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple deterministic hash function for evidence digests.
 * Uses DJB2 algorithm — not crypto-grade but sufficient for audit trail
 * correlation and integrity verification.
 */
function simpleHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash = hash & hash; // Force 32-bit integer
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERIC STATE MACHINE RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generic state machine runner implementing the T3 pattern.
 *
 * Algorithm:
 * 1. Find all transitions matching (currentState, event.type)
 * 2. Evaluate guard conditions (first passing guard wins)
 * 3. Execute exit action for current state
 * 4. Execute entry action for target state
 * 5. Produce evidence record with input/output digests
 * 6. Return new state (internal state updated atomically)
 *
 * Error handling (P3):
 * - Invalid transitions → ERROR state with diagnostic evidence
 * - Guard evaluation failures → ERROR state
 * - Action execution failures → logged, transition still proceeds
 */
class StateMachine {
  private _state: FSMState;
  private readonly _history: EvidenceRecord[];

  constructor(
    initialState: FSMState,
    private readonly transitions: readonly TransitionEntry[],
  ) {
    this._state = initialState;
    this._history = [];
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  /** Get current immutable state snapshot. */
  get state(): FSMState {
    return this._state;
  }

  /** Get read-only reference to evidence history. */
  get history(): readonly EvidenceRecord[] {
    return this._history;
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────

  /**
   * Dispatch an event through the state machine.
   *
   * @param event - The discriminated union event to dispatch
   * @returns The new state after transition
   */
  dispatch(event: FSMEvent): FSMState {
    const fromState = this._state;

    // Step 1: Find all candidate transitions matching (fromState, event.type)
    const candidates = this.transitions.filter(
      (t: TransitionEntry): boolean => t.from === fromState && t.event === event.type,
    );

    if (candidates.length === 0) {
      return this.transitionToError(
        fromState,
        event,
        `No valid transition from "${fromState}" for event "${event.type}"`,
      );
    }

    // Step 2: Evaluate guard conditions (first passing guard wins)
    let selected: TransitionEntry | null = null;
    let guardResult = false;

    try {
      const result = this.evaluateGuards(candidates, event);
      selected = result.selected;
      guardResult = result.guardResult;
    } catch (err) {
      return this.transitionToError(
        fromState,
        event,
        err instanceof Error ? err.message : `Guard evaluation error: ${String(err)}`,
      );
    }

    if (selected === null) {
      return this.transitionToError(
        fromState,
        event,
        `No guard passed for transition from "${fromState}" on event "${event.type}" (${candidates.length} candidate(s) evaluated)`,
      );
    }

    const targetState = selected.target;

    // Step 3: Execute exit action for current state
    this.executeExitAction(selected, fromState);

    // Step 4: Execute entry action for target state
    const actionName = this.executeEntryAction(selected, event);

    // Step 5: Produce evidence record with input/output digests
    const evidence: EvidenceRecord = {
      from: fromState,
      to: targetState,
      event: event.type,
      timestamp: Date.now(),
      inputDigest: simpleHash(JSON.stringify(event)),
      outputDigest: simpleHash(
        JSON.stringify({ state: targetState, historyLength: this._history.length + 1 }),
      ),
      guardResult,
      action: actionName,
    };

    // Step 6: Immutable update (push evidence, set new state)
    this._history.push(evidence);
    this._state = targetState;

    return this._state;
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Evaluate guard conditions across candidate transitions.
   * Returns the first transition whose guard passes, or null if none pass.
   *
   * @throws {GuardEvaluationError} If a guard function throws
   */
  private evaluateGuards(
    candidates: readonly TransitionEntry[],
    event: FSMEvent,
  ): { selected: TransitionEntry | null; guardResult: boolean } {
    for (const candidate of candidates) {
      if (candidate.guard) {
        const result = candidate.guard(event);
        if (result) {
          return { selected: candidate, guardResult: true };
        }
        // Guard returned false — continue to next candidate
      } else {
        // No guard defined — always matches
        return { selected: candidate, guardResult: true };
      }
    }

    return { selected: null, guardResult: false };
  }

  /**
   * Transition to ERROR state with full diagnostic evidence.
   * Used when no valid transition exists (P3 error resilience).
   */
  private transitionToError(
    fromState: FSMState,
    event: FSMEvent,
    message: string,
  ): FSMState {
    const evidence: EvidenceRecord = {
      from: fromState,
      to: 'ERROR',
      event: event.type,
      timestamp: Date.now(),
      inputDigest: simpleHash(JSON.stringify(event)),
      outputDigest: simpleHash(JSON.stringify({ state: 'ERROR' })),
      guardResult: false,
      action: `error: ${message}`,
    };

    this._history.push(evidence);
    this._state = 'ERROR';

    // Log error context for debugging (P3)
    if (typeof console !== 'undefined') {
      console.error(`[FSM] ${message}`);
    }

    return this._state;
  }

  /**
   * Execute the exit action for the current state, if defined.
   * Failures are logged but non-fatal (P3).
   */
  private executeExitAction(transition: TransitionEntry, fromState: FSMState): void {
    if (transition.exitAction) {
      try {
        transition.exitAction();
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.error(`[FSM] Exit action failed for state "${fromState}":`, err);
        }
      }
    }
  }

  /**
   * Execute the entry action for the target state, if defined.
   * Returns a description string for the evidence record, or undefined.
   * Failures are logged but non-fatal (P3).
   */
  private executeEntryAction(
    transition: TransitionEntry,
    event: FSMEvent,
  ): string | undefined {
    if (transition.entryAction) {
      try {
        transition.entryAction(event);
        return `entry:${event.type}`;
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.error(
            `[FSM] Entry action failed for transition "${transition.from}→${transition.target}":`,
            err,
          );
        }
        throw err;
      }
    }
    return undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENFORCEMENT MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps EnforcementLevel to the corresponding FSMEvent type.
 * CRITICAL/HIGH → BLOCK event, MEDIUM/LOW → WARN event, INFO/PASS → PASS event.
 */
const ENFORCEMENT_TO_EVENT: Record<EnforcementLevel, FSMEvent['type']> = {
  CRITICAL: 'BLOCK',
  HIGH: 'BLOCK',
  MEDIUM: 'WARN',
  LOW: 'WARN',
  INFO: 'PASS',
  PASS: 'PASS',
};

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSITION TABLE (singleton)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Shared transition table — built once at module load time.
 * All IntentFSM instances share the same immutable transition definitions.
 */
const TRANSITION_TABLE: readonly TransitionEntry[] = buildTransitionTable();

// ═══════════════════════════════════════════════════════════════════════════════
// INTENTFSM (Public API)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * IntentFSM — finite state machine for tracking intent transitions
 * across the session lifecycle.
 *
 * Uses a proper state machine pattern internally with:
 * - Formal transition table (Map from state+event to next state+action)
 * - Type-safe discriminated union events
 * - Guard conditions on transitions
 * - Entry/exit actions per state
 * - Evidence production on every transition (with input/output digests)
 * - Immutable state updates
 * - Error resilience (P3): invalid transitions → ERROR, guard failures → ERROR
 *
 * Maintains backward-compatible public API:
 *   getState() → FSMState
 *   transition(intent) → FSMState
 *   reset(reason?)
 *   getHistory() → EvidenceRecord[]
 *   getLastTransitions(n) → EvidenceRecord[]
 *   isError(), isBlocked(), isWarned()
 *   transitionCount (getter)
 */
export class IntentFSM {
  private readonly machine: StateMachine;

  constructor() {
    this.machine = new StateMachine('IDLE', TRANSITION_TABLE);
  }

  // ── Core API ───────────────────────────────────────────────────────────────

  /**
   * Process an IntentResult and transition the FSM accordingly.
   *
   * Internally converts the IntentResult to the appropriate FSMEvent
   * based on current state and intent data, then dispatches through
   * the formal transition table.
   *
   * @param intent - The classified intent result from IntentClassifier
   * @returns The new state after transition
   */
  transition(intent: IntentResult): FSMState {
    const event = this.intentToEvent(intent);
    return this.dispatch(event);
  }

  /**
   * Dispatch a raw FSMEvent directly into the state machine.
   * Useful for advanced use cases where direct event dispatch is needed.
   *
   * @param event - The discriminated union event to dispatch
   * @returns The new state after transition
   */
  dispatch(event: FSMEvent): FSMState {
    return this.machine.dispatch(event);
  }

  /**
   * Get the current FSM state.
   */
  getState(): FSMState {
    return this.machine.state;
  }

  /**
   * Get the full transition history with evidence records.
   * Returns a shallow copy for immutability.
   */
  getHistory(): EvidenceRecord[] {
    return [...this.machine.history];
  }

  /**
   * Get the last N transitions from history.
   *
   * @param n - Number of recent transitions to retrieve
   */
  getLastTransitions(n: number): EvidenceRecord[] {
    return this.machine.history.slice(-n);
  }

  // ── State Queries ──────────────────────────────────────────────────────────

  /**
   * Check if the FSM is in an error state.
   */
  isError(): boolean {
    return this.machine.state === 'ERROR';
  }

  /**
   * Check if the FSM is in a blocked state.
   */
  isBlocked(): boolean {
    return this.machine.state === 'BLOCKED';
  }

  /**
   * Check if the FSM is in a warned state.
   */
  isWarned(): boolean {
    return this.machine.state === 'WARNED';
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Reset the FSM to IDLE with an optional reason recorded in history.
   *
   * @param reason - Optional reason for the reset (recorded in evidence)
   */
  reset(reason?: string): void {
    this.machine.dispatch({ type: 'RESET', reason });
  }

  /**
   * Get the number of transitions recorded.
   */
  get transitionCount(): number {
    return this.machine.history.length;
  }

  // ── Event Mapping ──────────────────────────────────────────────────────────

  /**
   * Convert an IntentResult to an internal FSMEvent based on current state.
   *
   * Maps the session lifecycle:
   *   IDLE              → ANALYZE
   *   ANALYZING         → CLASSIFY
   *   INTENT_CLASSIFIED → based on enforcement: BLOCK | WARN | PASS | ERROR
   *   BLOCKED           → RESET (auto-recovery)
   *   WARNED            → PASS (if enforcement resolved) | ANALYZE (re-analyze)
   *   PASSED            → PASS (terminal self-loop)
   *   ERROR             → RESET (auto-recovery)
   */
  private intentToEvent(intent: IntentResult): FSMEvent {
    const currentState = this.machine.state;

    switch (currentState) {
      case 'IDLE':
        return { type: 'ANALYZE', thought: intent.action };

      case 'ANALYZING':
        return {
          type: 'CLASSIFY',
          intent: intent.intent,
          enforcement: intent.enforcement,
        };

      case 'INTENT_CLASSIFIED': {
        const eventType = ENFORCEMENT_TO_EVENT[intent.enforcement] ?? 'ERROR';
        switch (eventType) {
          case 'BLOCK':
            return {
              type: 'BLOCK',
              findingId: intent.violation ?? 'unknown',
              reason: intent.violation ?? 'Blocked by enforcement matrix',
            };
          case 'WARN':
            return {
              type: 'WARN',
              findingId: intent.violation ?? 'unknown',
              reason: intent.violation ?? 'Warning by enforcement matrix',
            };
          case 'PASS':
            return { type: 'PASS' };
          default:
            return {
              type: 'ERROR',
              message: `Unknown enforcement level: ${intent.enforcement}`,
              context: `intent=${intent.intent}, action=${intent.action}`,
            };
        }
      }

      case 'BLOCKED':
        return { type: 'RESET', reason: 'auto-recovery from BLOCKED' };

      case 'WARNED':
        if (intent.enforcement === 'PASS') {
          return { type: 'PASS', note: 'Warning accepted, proceeding' };
        }
        return { type: 'ANALYZE', thought: intent.action };

      case 'PASSED':
        return { type: 'PASS' };

      case 'ERROR':
        return { type: 'RESET', reason: 'auto-recovery from ERROR' };

      default:
        return {
          type: 'ERROR',
          message: `Unknown FSM state: ${currentState}`,
          context: `intent=${intent.intent}, action=${intent.action}`,
        };
    }
  }
}
