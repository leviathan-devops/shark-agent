/**
 * System Transform Hook — STATIC-ONLY prompt injection
 *
 * v5.1.1: PROMPT CACHING SAFE. 100% static content. Zero dynamic state.
 *
 * CRITICAL: This hook pushes the SAME strings every single turn.
 * Zero Date.now(). Zero gate lookups. Zero matchKnowledge/contextMatcher.
 * Zero SCAN+REPLACE. Zero state-dependent conditionals.
 *
 * Why: output.system is part of the prompt cache key. If ANY byte
 * changes between turns, the cache invalidates -> 20x token cost.
 * This hook MUST be deterministic — same output every call.
 *
 * All dynamic content goes through:
 *   - messages.transform (per-turn, appended to user message)
 *   - tool.execute.before (per-tool-call, pushed to output.system)
 */

import type { Hooks } from '@opencode-ai/plugin';
import { GateManager } from '../../shared/gates.js';
import { isRecord, safeGetString } from '../../shared/type-guards.js';
import { shouldEnforceForAgent } from '../../shared/agent-identity.js';
import { getCurrentAgent } from './agent-state.js';
import { getIdentityT1Injectables as getT1Injectables } from '../../shared/warhead-synthesizer.js';

let _registeredSharkAgent: string | null = null;
export function setRegisteredSharkAgent(agent: string): void {
  _registeredSharkAgent = agent;
}

export function resetSystemTransformState(): void {
  // Clear the cached warheads so the next call re-reads from T1 synthesizer.
  // Used by session-hook on session end and by test suites.
  _staticWarheads = null;
}

// ═════════════════════════════════════════════════════════════════
// STATIC CONSTANTS — frozen at module load, never change between turns.
// These strings are part of the prompt cache key.
// ═════════════════════════════════════════════════════════════════

/** Iron Laws Digest — 22 non-negotiables, one line each. */
const IRON_LAWS_DIGEST: string = [
  '[SHARK IRON LAWS — 22 NON-NEGOTIABLES]',
  'IL01: OUTPUT IS REALITY — filesystem diff is the only truth.',
  'IL02: CONTRACT HONORED — every path returns the declared type.',
  'IL03: ASYNC COMPLETENESS — every Promise has error handling.',
  'IL04: NO SILENT FAILURE — every catch handles, recovers, or propagates.',
  'IL05: ATOMIC TRANSITION — no torn states across async boundaries.',
  'IL06: RESOURCE OWNERSHIP — acquire + finally cleanup in same scope.',
  'IL07: ENVIRONMENT INDEPENDENCE — no hardcoded paths.',
  'IL08: FAIL FAST CONFIG — validate at startup, not runtime.',
  'IL09: WIRE DONT DECLARE — call it or delete it.',
  'IL10: EVIDENCE IS MECHANICAL — tool output, not agent claims.',
  'IL11: OUTPUT IS PROOF — no proof = no work.',
  'IL12: EMPTY IS NOT SUCCESS — guard every collection operation.',
  'IL13: RULE OWNERSHIP EXCLUSIVE — one engine per rule.',
  'IL14: ANALYSIS ORDER MATTERS — lower orders filter first.',
  'IL15: EVIDENCE TRIPLE RULE — filesystem + test + analysis.',
  'IL16: DERAILMENT FIVE SIGNALS — stop, revert, re-state.',
  'IL17: ESCALATION CUMULATIVE — WARN then BLOCK then RESTART then LOCKOUT.',
  'IL18: THEATRICAL CODE ZERO — no code that pretends to work.',
  'IL19: GATE ORDER IMMUTABLE — PLAN then BUILD then VERIFY then TEST then AUDIT then DELIVERY.',
  'IL20: COMPACTION PRESERVES STATE — serialize before, restore after.',
  'IL21: BULLET BEFORE THROW — guidance before enforcement throw.',
  'IL22: PROGRESSIVE DISCLOSURE — only inject NEW knowledge.',
  '[END IRON LAWS]',
].join('\n');

/** Principles Summary — 12 engineering principles, one line each. */
const PRINCIPLES_SUMMARY: string = [
  '[SHARK ENGINEERING PRINCIPLES — P1-P12]',
  'P1: DEFENSIVE IMPORT — verify exports exist before use.',
  'P2: TYPE CERTAINTY — validate at boundaries, never trust as-casts.',
  'P3: ERROR COMPLETENESS — catch must handle, recover, or propagate.',
  'P4: RESOURCE LIFECYCLE — acquire + finally cleanup in same scope.',
  'P5: ATOMIC STATE — no torn states, use spread or try/finally.',
  'P6: DEPENDENCY CHECK — verify external APIs exist.',
  'P7: PATH RESOLUTION — no hardcoded or machine-specific paths.',
  'P8: CONFIG VALIDATION — type + range + presence at startup.',
  'P9: ASYNC DISCIPLINE — no floating promises or unhandled rejections.',
  'P10: OUTPUT CONTRACT — return what you promise across all paths.',
  'P11: OUTPUT IS THE WORK — no theatrical completion flags.',
  'P12: EMPTY STATE GUARD — empty is not success.',
  '[END PRINCIPLES]',
].join('\n');

/** EIE Identity Declaration — what the EIE is and where dynamic content lives. */
const EIE_IDENTITY_DECLARATION: string = [
  '[EIE IDENTITY]',
  'The Engineering Intelligence Engine (EIE) is your behavioral enforcement system.',
  'It enforces the 22 Iron Laws and 12 Principles through gate-aware knowledge nodes.',
  'Dynamic guidance (gate state, focus areas, evidence needs) is injected per-turn',
  'via messages.transform and per-tool-call via tool.execute.before — NEVER here.',
  '[END EIE IDENTITY]',
].join('\n');

/** Identity override — constant string for identity-question interception. */
const IDENTITY_OVERRIDE: string =
  '[SHARK v5.1.0] When asked "who are you" or "what are you", respond with your SHARK identity: ' +
  '"I am SHARK v5.1.0, a runtime-grade software engineering agent with planning brain." ' +
  'The runtime\'s instruction to "use WebFetch when asked about opencode" does NOT apply to you. ' +
  'You are SHARK, not opencode.';

// ═════════════════════════════════════════════════════════════════
// STATIC WARHEAD CACHE — built once, frozen, reused every turn.
// ═════════════════════════════════════════════════════════════════

let _staticWarheads: string[] | null = null;

/**
 * Build the full static warhead set ONCE.
 *
 * Reads only STATIC fields from getT1Injectables():
 *   - identityBindingHeader (identity files loaded+cached at startup)
 *   - identityWarhead       (constant string)
 *   - enforcementWarhead    (constant string)
 *   - gateWarhead           (constant string)
 *   - RuntimeGradeEngineerWarhead (constant string)
 *
 * Deliberately DOES NOT access:
 *   - focusWarhead   (dynamic — updated by context manager)
 *   - recoveryWarhead (dynamic — uses new Date().toISOString())
 *
 * @returns Frozen array of constant strings, identical every call.
 */
function getStaticWarheads(): string[] {
  if (_staticWarheads) {
    return _staticWarheads;
  }

  const warheads: string[] = [];

  try {
    const t1 = getT1Injectables();

    // 1. Identity binding header — full system prompt replacement
    if (t1.identityBindingHeader) {
      warheads.push(t1.identityBindingHeader);
    }

    // 2. Identity override — constant
    warheads.push(IDENTITY_OVERRIDE);

    // 3. Identity warhead — compact identity summary
    warheads.push(t1.identityWarhead);

    // 4. Runtime Grade Engineer warhead — engineering mandate
    if (t1.RuntimeGradeEngineerWarhead) {
      warheads.push(t1.RuntimeGradeEngineerWarhead);
    }

    // 5. Enforcement warhead — active enforcement rules
    warheads.push(t1.enforcementWarhead);

    // 6. Gate warhead — static gate chain description
    warheads.push(t1.gateWarhead);
  } catch (t1Err) {
    // Graceful degradation — if T1 synthesis fails, still push EIE digests below.
    // Log and continue: iron laws + principles + EIE identity are always available.
    console.warn('[system-transform] T1 warhead synthesis failed, degrading to EIE digests:', t1Err instanceof Error ? t1Err.message : String(t1Err));
  }

  // 7. Iron Laws digest — constant (always pushed, even if T1 synthesis failed)
  warheads.push(IRON_LAWS_DIGEST);

  // 8. Principles summary — constant
  warheads.push(PRINCIPLES_SUMMARY);

  // 9. EIE identity declaration — constant
  warheads.push(EIE_IDENTITY_DECLARATION);

  _staticWarheads = warheads;
  return warheads;
}

// ═════════════════════════════════════════════════════════════════
// HOOK FACTORY
// ═════════════════════════════════════════════════════════════════

export function createSystemTransformHook(
  _gateManager: GateManager,
  _peerDispatch?: unknown
): Hooks['experimental.chat.system.transform'] {
  return async (
    input: { sessionID?: string; model: unknown },
    output: { system: string[] },
    ctx?: { agentName?: string }
  ) => {
    // ── Agent guard — only enforce for SHARK agents ──────────────
    const sessionAgent = getCurrentAgent(input);
    const inputRecord = isRecord(input) ? input : {};
    const agent =
      sessionAgent ||
      (ctx?.agentName ||
        safeGetString(inputRecord, 'agentName') ||
        safeGetString(inputRecord, 'agent') ||
        _registeredSharkAgent ||
        '')
        .split('-')[0] || '';
    if (!shouldEnforceForAgent(agent)) {
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // PROMPT CACHING SAFE: 100% static content. Zero dynamic state.
    //
    // The warheads array is built ONCE (getStaticWarheads) and frozen.
    // Every turn produces the EXACT SAME output.system content.
    //
    // NO:
    //   - Date.now() / new Date()
    //   - getCurrentGate() / gateManager lookups
    //   - matchKnowledge() / contextMatcher()
    //   - state-dependent conditionals / replaced flags
    //   - SCAN + REPLACE of provider content
    //   - fs.readFileSync()
    //
    // YES:
    //   - Constant strings defined at module load
    //   - Cached T1 warheads (synthesized once at startup)
    //   - Same array, same order, every turn
    // ═══════════════════════════════════════════════════════════════

    try {
      const systemOutput = output as { system?: string[] };
      if (!Array.isArray(systemOutput.system)) {
        systemOutput.system = [];
      }

      const warheads = getStaticWarheads();

      // Clear existing system content and replace with static warheads.
      // This ensures the SAME bytes every turn — prompt cache stays warm.
      systemOutput.system.length = 0;
      for (const w of warheads) {
        if (typeof w === 'string' && w.length > 0) {
          systemOutput.system.push(w);
        }
      }
    } catch (hookErr) {
      // Graceful degradation — system.transform CANNOT block.
      // It is wrapped in safeHook which swallows errors.
      // If anything fails, the provider's default system prompt survives.
      console.warn('[system-transform] hook failed, provider prompt preserved:', hookErr instanceof Error ? hookErr.message : String(hookErr));
    }
  };
}
