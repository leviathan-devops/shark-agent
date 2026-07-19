// src/eie/dynamic-guardrails.ts
// Dynamic Guardrails — Adaptive Enforcement Profiles.
// Spec: 09_GUARDRAILS_RESILIENCE.md §3–§6, EIE_DESIGN_SPEC.md §13.
//
// Treats enforcement as a dynamically intelligent membrane: more permeable for
// agents that have proven competence (TRUSTED), the default for normal
// operation (STANDARD), and maximally restrictive for agents that are
// struggling or in safety-critical gates (GUIDED). The profile is recomputed
// on EVERY tool call — no profile is locked in (§1.5 P5).
//
// Priority cascade — first match wins (§3.1):
//   1. gate in [test, audit, delivery]           -> GUIDED (always)
//   2. pseLoopCount >= 3                          -> GUIDED (always)
//   3. guidanceFollowRate < 0.4                   -> GUIDED (always)
//   4. violationRate > 0.3                        -> GUIDED (always)
//   5. successRate > 0.8 AND violationRate < 0.1  -> TRUSTED (if totalCalls >= 10)
//   DEFAULT                                        -> STANDARD

import type { EnforcementConfig, EnforcementMetrics, EnforcementProfile } from './types';

/** Re-exported for consumer convenience. */
export type { EnforcementProfile, EnforcementConfig, EnforcementMetrics };

// ── Constants (§3.1 thresholds, §6 config) ────────────────────

/** Safety-critical gates that ALWAYS force GUIDED enforcement (§3.1 P1). */
const SAFETY_GATES = new Set(['test', 'audit', 'delivery']);

/** Minimum call volume before an agent can earn TRUSTED (§1.5 P1 cold-start). */
const MIN_CALLS_FOR_TRUST = 10;

/** Sampling interval: TRUSTED pre-write analysis runs every Nth call (§4.1). */
const TRUSTED_SAMPLING_INTERVAL = 5;

/** GUIDED is forced when guidance follow rate drops below this (§3.1 P3). */
const GUIDANCE_FOLLOW_RATE_FLOOR = 0.4;

/** GUIDED is forced when violation rate rises above this (§3.1 P4). */
const VIOLATION_RATE_CEILING = 0.3;

/** TRUSTED requires success rate strictly above this (§3.1 P5). */
const TRUST_SUCCESS_FLOOR = 0.8;

/** TRUSTED requires violation rate strictly below this (§3.1 P5). */
const TRUST_VIOLATION_CEILING = 0.1;

// ── Input Metrics ─────────────────────────────────────────────

/**
 * Performance metrics snapshot used to select the enforcement profile.
 * Provided by the StateTracker on every tool call. Success and violation
 * rates are derived from the raw counts here.
 */
export interface ProfileMetrics {
  /** Total tool calls in the measurement window (sliding window recommended). */
  totalCalls: number;
  /** Calls that completed without an enforcement block or error. */
  successfulCalls: number;
  /** Calls that triggered an enforcement violation (block or warn). */
  violations: number;
  /** Current gate identifier (plan, build, verify, test, audit, delivery). */
  gate: string;
  /** Number of PSE loop entries for the current task. */
  pseLoopCount: number;
  /** Fraction of guided turns where the agent acted consistently (0.0–1.0). */
  guidanceFollowRate: number;
}

// ── getConfig() — Profile Configuration Factory (§6) ─────────

/**
 * Build the full EnforcementConfig for a given profile.
 *
 * Returns the dimensional settings, sampling interval, and warhead-per-turn
 * flag. `triggerReason` and `metrics` are left unset here (callers like
 * computeEnforcementProfile() populate them with real telemetry).
 *
 * Profile effects (§4):
 *   TRUSTED  — sampled checks, trust evidence, minimal guidance, no warhead/turn
 *   STANDARD — every-call checks, standard evidence, normal guidance, no warhead/turn
 *   GUIDED   — every-call checks, strict evidence, high guidance, warhead EVERY turn
 */
export function getConfig(profile: EnforcementProfile): EnforcementConfig {
  switch (profile) {
    case 'trusted':
      return {
        preWriteAnalysis: 'sampled',
        evidenceVerification: 'trust',
        guidanceFrequency: 'minimal',
        profile: 'trusted',
        samplingInterval: TRUSTED_SAMPLING_INTERVAL,
        warheadPerTurn: false,
      };
    case 'guided':
      return {
        preWriteAnalysis: 'every',
        evidenceVerification: 'strict',
        guidanceFrequency: 'high',
        profile: 'guided',
        samplingInterval: 1,
        warheadPerTurn: true,
      };
    case 'standard':
    default:
      return {
        preWriteAnalysis: 'every',
        evidenceVerification: 'standard',
        guidanceFrequency: 'normal',
        profile: 'standard',
        samplingInterval: 1,
        warheadPerTurn: false,
      };
  }
}

// ── computeEnforcementProfile() — Priority Cascade (§3) ───────

/**
 * Compute the enforcement profile for the current tool call.
 *
 * This is a PRIORITY CASCADE — the first matching priority wins, ordered from
 * most critical (safety gates) to least critical (success-rate promotion).
 * Safety overrides everything; the TRUSTED promotion path can NEVER override a
 * GUIDED trigger, which is why it is evaluated last.
 *
 * @param metrics - Behavioral signals from the StateTracker
 * @returns Full EnforcementConfig with the selected profile, trigger reason,
 *          and a metrics snapshot for telemetry.
 */
export function computeEnforcementProfile(metrics: ProfileMetrics): EnforcementConfig {
  const {
    totalCalls,
    successfulCalls,
    violations,
    gate,
    pseLoopCount,
    guidanceFollowRate,
  } = metrics;

  const successRate = totalCalls > 0 ? successfulCalls / totalCalls : 0;
  const violationRate = totalCalls > 0 ? violations / totalCalls : 0;
  const normGate = gate.toLowerCase();

  const snapshot: EnforcementMetrics = {
    successRate,
    violationRate,
    pseLoopCount,
    guidanceFollowRate,
    totalCalls,
    gate,
  };

  // PRIORITY 1: Safety gates always use GUIDED. TEST/AUDIT/DELIVERY are too
  // critical to relax enforcement, regardless of prior performance (§1.5 P2).
  if (SAFETY_GATES.has(normGate)) {
    return { ...getConfig('guided'), triggerReason: `Safety gate '${normGate}'`, metrics: snapshot };
  }

  // PRIORITY 2: PSE loop count >= 3 -> GUIDED. An agent stuck in a problem-
  // solving loop needs maximum guidance to break out, not relaxed checks.
  if (pseLoopCount >= 3) {
    return { ...getConfig('guided'), triggerReason: `PSE loop count ${pseLoopCount} >= 3`, metrics: snapshot };
  }

  // PRIORITY 3: Low guidance-follow rate -> GUIDED. If the agent follows
  // guidance less than 40% of the time, it needs MORE guidance, not less.
  if (guidanceFollowRate < GUIDANCE_FOLLOW_RATE_FLOOR) {
    return {
      ...getConfig('guided'),
      triggerReason: `Guidance follow rate ${guidanceFollowRate.toFixed(2)} < ${GUIDANCE_FOLLOW_RATE_FLOOR}`,
      metrics: snapshot,
    };
  }

  // PRIORITY 4: High violation rate -> GUIDED. More than 30% violations means
  // the agent is unreliable and needs maximum enforcement.
  if (violationRate > VIOLATION_RATE_CEILING) {
    return {
      ...getConfig('guided'),
      triggerReason: `Violation rate ${violationRate.toFixed(2)} > ${VIOLATION_RATE_CEILING}`,
      metrics: snapshot,
    };
  }

  // PRIORITY 5: High success + low violations -> TRUSTED. The ONLY promotion
  // path. All three conditions required; the minimum call count prevents
  // premature trust from a lucky small sample (§1.5 P1).
  if (
    successRate > TRUST_SUCCESS_FLOOR &&
    violationRate < TRUST_VIOLATION_CEILING &&
    totalCalls >= MIN_CALLS_FOR_TRUST
  ) {
    return {
      ...getConfig('trusted'),
      triggerReason:
        `Success ${(successRate * 100).toFixed(0)}% / viol ${(violationRate * 100).toFixed(0)}% over ${totalCalls} calls`,
      metrics: snapshot,
    };
  }

  // DEFAULT: STANDARD — balanced enforcement for normal operation.
  return { ...getConfig('standard'), triggerReason: 'Default balanced enforcement', metrics: snapshot };
}

// ── shouldAnalyze() — Sampling Decision (§4.1) ────────────────

/**
 * Decide whether full pre-write analysis should run for the current call.
 *
 * For the TRUSTED profile, analysis is SAMPLED — it runs only every Nth call
 * (N = samplingInterval, default 5) to reduce overhead for agents that have
 * proven competence. The cheap checks (zone, gate validation) still run every
 * call; this gate only controls the expensive AST/scope analysis. For STANDARD
 * and GUIDED, analysis runs on every call unconditionally.
 *
 * @param profile   - Current enforcement profile
 * @param callCount - Sequential index of this tool call (0-based; only the
 *                    modulo matters)
 * @returns true if pre-write analysis should run this call
 */
export function shouldAnalyze(profile: EnforcementProfile, callCount: number): boolean {
  // Non-trusted profiles always analyze (§4.1).
  if (profile !== 'trusted') return true;

  // TRUSTED: analyze on the Nth call. callCount is 0-based from the
  // StateTracker, so a call is sampled when (callCount + 1) is a multiple of N.
  const n = TRUSTED_SAMPLING_INTERVAL;
  return callCount % n === n - 1;
}
