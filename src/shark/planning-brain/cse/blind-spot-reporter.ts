/**
 * Blind Spot Reporter — Rule V-5: Transparent Blind Spots
 * File: src/shark/planning-brain/cse/blind-spot-reporter.ts
 *
 * V-5: The engine explicitly reports what it could NOT verify. If evidence
 * coverage is partial, it reports the percentage. If preflight was unavailable,
 * it says so. If the agent is self-auditing, it flags the bias risk. Silence
 * about limitations is treated as a defect.
 */

import * as path from 'node:path';
import type {
  AgentClaim,
  BiasWarning,
  BlindSpotReport,
  ClaimVerification,
  EvidenceVerification,
  ExpectedFile,
  GatePhase,
  PreflightGrounding,
} from './cse-types.js';
import { EXPECTED_EVIDENCE } from './cse-types.js';

// ===========================================================================
// BLIND SPOT REPORTER
// ===========================================================================

export class BlindSpotReporter {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Generate a blind spot report — what the engine could NOT verify.
   */
  report(
    claimVerifications: ClaimVerification[],
    evidenceChecks: EvidenceVerification[],
    grounding: PreflightGrounding,
    gate: GatePhase,
  ): BlindSpotReport {
    const expected = EXPECTED_EVIDENCE[gate] ?? [];

    // Evidence coverage
    const { coverage, present, missing } = this.computeCoverage(evidenceChecks, expected);

    // Unverifiable claims
    const unverifiableClaims = claimVerifications
      .filter((v: ClaimVerification) => v.verdict === 'UNVERIFIABLE')
      .map((v: ClaimVerification) => v.claim);

    // Preflight availability
    const preflightUnavailable: string[] = [];
    if (!grounding.tscStatus.ran) preflightUnavailable.push('tsc --noEmit');
    if (!grounding.bundleStatus.ran) preflightUnavailable.push('bun build');
    if (grounding.unavailableReasons.length > 0) {
      preflightUnavailable.push(...grounding.unavailableReasons);
    }

    // Bias warnings
    const biasWarnings = this.detectBias(grounding, claimVerifications);

    // Transparency statement
    const statement = this.composeStatement(
      coverage, missing, unverifiableClaims, preflightUnavailable, biasWarnings,
    );

    return {
      evidenceCoverage: coverage,
      presentEvidence: present,
      missingEvidence: missing,
      unverifiableClaims,
      preflightUnavailable,
      biasWarnings,
      statement,
    };
  }

  // ===========================================================================
  // COVERAGE COMPUTATION
  // ===========================================================================

  private computeCoverage(
    evidenceChecks: EvidenceVerification[],
    expected: ExpectedFile[],
  ): { coverage: number; present: string[]; missing: string[] } {
    const checkedPaths = new Set(evidenceChecks.map((e: EvidenceVerification) => {
      const rel = path.relative(this.workspacePath, e.filePath);
      return rel || e.filePath;
    }));

    const presentFiles = expected.filter((f: ExpectedFile) => {
      // Check if the expected file path matches any checked path
      return checkedPaths.has(f.path) ||
             evidenceChecks.some((e: EvidenceVerification) => e.filePath.endsWith(path.basename(f.path)));
    });

    const missingFiles = expected.filter((f: ExpectedFile) => {
      return !checkedPaths.has(f.path) &&
             !evidenceChecks.some((e: EvidenceVerification) => e.filePath.endsWith(path.basename(f.path)));
    });

    // Coverage weights required files more heavily
    const requiredTotal = expected.filter((f: ExpectedFile) => f.required).length;
    const requiredPresent = presentFiles.filter((f: ExpectedFile) => f.required).length;
    const requiredCoverage = requiredTotal > 0 ? requiredPresent / requiredTotal : 1;

    const overallCoverage = expected.length > 0
      ? presentFiles.length / expected.length
      : 1;

    // Use the more conservative (lower) coverage
    const coverage = Math.min(overallCoverage, requiredCoverage);

    return {
      coverage,
      present: presentFiles.map((f: ExpectedFile) => f.path),
      missing: missingFiles.map((f: ExpectedFile) => f.path + (f.required ? ' (REQUIRED)' : '')),
    };
  }

  // ===========================================================================
  // BIAS DETECTION
  // ===========================================================================

  private detectBias(
    grounding: PreflightGrounding,
    verifications: ClaimVerification[],
  ): BiasWarning[] {
    const warnings: BiasWarning[] = [];

    // BIAS 1: Self-audit — agent is verifying its own claims
    warnings.push({
      type: 'self_audit',
      description: 'Verification engine is running in the same context as the agent. ' +
                   'Claims are being verified by the system that also produced them. ' +
                   'Bias risk: the agent may have written evidence to match expected schemas.',
      riskLevel: 'MEDIUM',
    });

    // BIAS 2: Stale grounding — preflight was run long ago
    if (grounding.available) {
      const ageMs = Date.now() - grounding.computedAt;
      if (ageMs > 5 * 60 * 1000) { // 5 minutes
        warnings.push({
          type: 'stale_grounding',
          description: 'Preflight grounding is ' + (ageMs / 60000).toFixed(1) +
                       ' minutes old. Source changes since then are not reflected.',
          riskLevel: 'LOW',
        });
      }
    }

    // BIAS 3: Single source — only one evidence file backs all claims
    const uniqueEvidencePaths = new Set(
      verifications.filter((v: ClaimVerification) => v.evidence).map((v: ClaimVerification) => v.evidence!.filePath)
    );
    if (uniqueEvidencePaths.size === 1 && verifications.length > 2) {
      warnings.push({
        type: 'single_source',
        description: 'All claim verifications depend on a single evidence file. ' +
                     'No cross-referencing across multiple evidence sources.',
        riskLevel: 'MEDIUM',
      });
    }

    // BIAS 4: No cross-reference — claims not checked against independent sources
    const unverifiable = verifications.filter((v: ClaimVerification) => v.verdict === 'UNVERIFIABLE');
    if (unverifiable.length > 0) {
      warnings.push({
        type: 'no_cross_ref',
        description: unverifiable.length + ' claim(s) have no verification predicate. ' +
                     'These claims cannot be checked by this engine.',
        riskLevel: unverifiable.length > 2 ? 'HIGH' : 'LOW',
      });
    }

    return warnings;
  }

  // ===========================================================================
  // TRANSPARENCY STATEMENT COMPOSITION
  // ===========================================================================

  private composeStatement(
    coverage: number,
    missing: string[],
    unverifiable: AgentClaim[],
    preflightUnavailable: string[],
    bias: BiasWarning[],
  ): string {
    const parts: string[] = [];

    // Coverage
    parts.push('Evidence coverage: ' + (coverage * 100).toFixed(0) + '% ' +
               '(' + (missing.length === 0
                 ? 'all expected files present'
                 : missing.length + ' missing: ' + missing.join(', ')) + ').');

    // Preflight
    if (preflightUnavailable.length > 0) {
      parts.push('Preflight unavailable — cannot ground claims against build results ' +
                 '(' + preflightUnavailable.join(', ') + ').');
    } else {
      parts.push('Preflight grounding available — claims checked against actual build output.');
    }

    // Self-audit
    if (bias.some((b: BiasWarning) => b.type === 'self_audit')) {
      parts.push('Self-audit mode — bias risk: agent is verifying its own claims.');
    }

    // Unverifiable
    if (unverifiable.length > 0) {
      parts.push(unverifiable.length + ' claim(s) unverifiable (no predicate for their type).');
    }

    return parts.join(' ');
  }
}
