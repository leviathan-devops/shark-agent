// src/eie/derailment-detector.ts
// 6-signal derailment detection with profile-aware thresholds.
// Spec: 09_GUARDRAILS_RESILIENCE.md §18-§20.
//
// GUIDED profile uses tighter thresholds than STANDARD so the same
// behavior fires signals sooner. TRUSTED uses STANDARD thresholds.

import type { EnforcementProfile } from './types';
import { getFindingBus } from './finding-bus';

export interface DerailmentParams {
  modifiedFiles: string[];
  expectedFiles: string[];
  callsWithoutProgress: number;
  outputLength: number;
  expectedOutputLength: number;
  novelConcepts: string[];
  expectedConcepts: string[];
  profile: EnforcementProfile;
}

export interface DerailmentResult {
  derailed: boolean;
  signals: string[];
  recommendation: string;
  profile: EnforcementProfile;
  signalCount: number;
  severity: 'none' | 'warning' | 'derailed';
}

export interface RecoveryResult {
  recommendation: string;
  warhead: string;
  findingEmitted: boolean;
}

const RECOVERY_RECOMMENDATION =
  'STOP. Revert changes. Re-state the task. Resume from last good state.';

/**
 * Detect derailment across 6 signals with profile-aware thresholds.
 *
 * Each signal fires when its metric exceeds the profile-specific threshold.
 * Derailment is declared when signalCount >= 2. A single signal is a warning.
 */
export function detectDerailment(params: DerailmentParams): DerailmentResult {
  const {
    modifiedFiles, expectedFiles, callsWithoutProgress,
    outputLength, expectedOutputLength, novelConcepts, expectedConcepts, profile,
  } = params;

  const isGuided = profile === 'guided';
  const signals: string[] = [];

  // File-path matching helper (bidirectional substring)
  const matches = (file: string, expected: string): boolean =>
    file.includes(expected) || expected.includes(file);

  // Signal 1: OUT-OF-SCOPE — modified files outside expected set
  // Scale threshold so multi-file tasks aren't falsely flagged. Only fire when
  // CLEARLY unrelated files appear (guided: >3, standard: >5 outside scope).
  //
  // CALIBRATION FIX: Exclude common output/build directories — test-output/,
  // output/, build/, dist/, etc. These ARE the deliverables during testing,
  // not out-of-scope work. Flagging them causes false derailment signals.
  const outputDirs = ['test-output', 'output', 'build', 'dist', 'out', 'lib', 'coverage', '.shark'];
  const outOfScope = modifiedFiles.filter((f) => {
    // Don't flag files in output/build directories — they ARE the deliverables
    if (outputDirs.some((dir) => f.includes(dir))) return false;
    // Don't flag files matching expected patterns
    if (expectedFiles.some((e) => matches(f, e))) return false;
    // Only flag clearly unrelated files
    return true;
  });
  const oosThreshold = isGuided ? 3 : 5;
  if (outOfScope.length > oosThreshold) {
    signals.push(`OUT-OF-SCOPE: ${outOfScope.length} files outside scope (>${oosThreshold}): ${outOfScope.slice(0, 3).join(', ')}`);
  }

  // Signal 2: TOO-MANY-FILES — count exceeds expected budget
  // Scale with expected file count and enforce sensible minimums (guided: 10,
  // standard: 15) so tasks touching many legitimate files aren't blocked.
  const fileLimit = isGuided
    ? Math.max(Math.floor(expectedFiles.length * 1.5 + 2), 10)
    : Math.max(expectedFiles.length * 2 + 3, 15);
  if (modifiedFiles.length > fileLimit) {
    signals.push(`TOO-MANY-FILES: ${modifiedFiles.length} modified vs ${expectedFiles.length} expected (limit ${fileLimit})`);
  }

  // Signal 3: NO-PROGRESS — calls without forward movement
  const progressThreshold = isGuided ? 5 : 10;
  if (callsWithoutProgress > progressThreshold) {
    signals.push(`NO-PROGRESS: ${callsWithoutProgress} calls without progress (>${progressThreshold})`);
  }

  // Signal 4: CONCEPT-DRIFT — novel concepts not in expected set
  const driftedConcepts = novelConcepts.filter(
    (c) => !expectedConcepts.some((e) => c.toLowerCase().includes(e.toLowerCase())),
  );
  const driftThreshold = isGuided ? 2 : 3;
  if (driftedConcepts.length > driftThreshold) {
    signals.push(`CONCEPT-DRIFT: ${driftedConcepts.length} novel concepts (>${driftThreshold}): ${driftedConcepts.slice(0, 4).join(', ')}`);
  }

  // Signal 5: OUTPUT-TOO-LONG — output exceeds expected size
  const outputMultiplier = isGuided ? 2 : 3;
  if (expectedOutputLength > 0 && outputLength > expectedOutputLength * outputMultiplier) {
    signals.push(`OUTPUT-TOO-LONG: ${outputLength} chars vs expected ~${expectedOutputLength} (>${outputMultiplier}x)`);
  }

  // Signal 6: NONE-EXPECTED-MODIFIED — nothing relevant touched
  const anyExpectedModified =
    expectedFiles.length > 0 &&
    expectedFiles.some((e) => modifiedFiles.some((f) => matches(f, e)));
  if (modifiedFiles.length > 0 && expectedFiles.length > 0 && !anyExpectedModified) {
    signals.push(`NONE-EXPECTED-MODIFIED: ${modifiedFiles.length} files modified, none in expected set`);
  }

  // Derailment decision: 1 signal = warning, >= 2 = derailed
  const signalCount = signals.length;
  let severity: DerailmentResult['severity'] = 'none';
  let derailed = false;
  if (signalCount >= 2) { severity = 'derailed'; derailed = true; }
  else if (signalCount >= 1) { severity = 'warning'; }

  const recommendation = derailed
    ? RECOVERY_RECOMMENDATION
    : severity === 'warning'
      ? `Warning: ${signals[0]}. Course-correct before derailment escalates.`
      : 'On track';

  return { derailed, signals, recommendation, profile, signalCount, severity };
}

/**
 * Execute the derailment recovery protocol.
 *
 * Emits a high-severity 'derailment' finding to the FindingBus and returns
 * a recovery warhead for injection. The caller reverts to the gate-entry
 * snapshot and resets agent state. Safe to call on non-derailed results.
 */
export function recoverFromDerailment(
  result: DerailmentResult,
  gateContext: string = 'plan',
): RecoveryResult {
  let findingEmitted = false;

  if (result.derailed) {
    try {
      getFindingBus().emit({
        source: 'derailment-detector',
        engine: 'EIE',
        category: 'derailment',
        severity: 'high',
        message: result.signals.join('; ').slice(0, 200),
        evidence: { extra: { signalCount: result.signalCount, profile: result.profile, signals: result.signals } },
        gateContext,
      });
      findingEmitted = true;
    } catch {
      findingEmitted = false; // FindingBus failure must never crash the detector
    }
  }

  const warhead = result.derailed
    ? `# Derailment Recovery\n\nSeverity: **${result.severity.toUpperCase()}** (${result.signalCount} signal(s))\nProfile: ${result.profile}\n\nSignals fired:\n${result.signals.map((s) => `  - ${s}`).join('\n')}\n\n**Recovery Protocol:**\n1. STOP all current work immediately\n2. Revert to the gate-entry snapshot\n3. Re-read the original task specification\n4. Resume from the last checkpoint\n\n${RECOVERY_RECOMMENDATION}`
    : '';

  return { recommendation: RECOVERY_RECOMMENDATION, warhead, findingEmitted };
}
