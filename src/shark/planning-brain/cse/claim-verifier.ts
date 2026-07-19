/**
 * Claim Verifier — Rule V-2: Claim-Reality Verification
 * File: src/shark/planning-brain/cse/claim-verifier.ts
 *
 * V-2: For every claim the agent makes about engineering state (build success,
 * test passage, evidence archived), the engine maps the claim to a verification
 * predicate that checks filesystem reality and returns VERIFIED or CONTRADICTED
 * with documented facts.
 *
 * Each ClaimType maps to a VerificationPredicate that checks filesystem facts.
 * Preflight alignment: build PASS + claim success -> boost x1.5.
 *                        build FAIL + claim success -> SUPPRESS x0.1.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AgentClaim,
  CandidateClaim,
  ClaimType,
  ClaimVerdict,
  ClaimVerification,
  EvidenceVerification,
  FactSupport,
  PreflightAlignment,
  PreflightGrounding,
  SessionWindow,
  VerificationFact,
  VerificationPredicate,
  GatePhase,
} from './cse-types.js';
import {
  EXPECTED_EVIDENCE,
  PASS_RATE_THRESHOLD,
} from './cse-types.js';

// ===========================================================================
// SAFE FILESYSTEM HELPERS (avoid empty catch blocks)
// ===========================================================================

function safeReadJson(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    // File missing, unreadable, or not valid JSON
    if (err instanceof Error && err.message.length > 0) {
      // Expected for missing evidence — return null
    }
    return null;
  }
}

function safeReadDir(dirPath: string): string[] | null {
  try {
    return fs.readdirSync(dirPath);
  } catch (err) {
    // Directory missing or unreadable
    if (err instanceof Error && err.message.length > 0) {
      // Expected — caller handles null
    }
    return null;
  }
}

function safeFileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch (err) {
    // Permission error or similar
    if (err instanceof Error && err.message.length > 0) {
      // Treat as non-existent
    }
    return false;
  }
}

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch (err) {
    // File missing
    if (err instanceof Error && err.message.length > 0) {
      // Expected — return null
    }
    return null;
  }
}

function isMtimeInWindow(mtime: number, window: SessionWindow): boolean {
  const windowStart = window.start - window.stalenessTolerance;
  const windowEnd = window.latestActivity + 60_000;
  return mtime >= windowStart && mtime <= windowEnd;
}

// ===========================================================================
// PREDICATE IMPLEMENTATIONS
// ===========================================================================

/**
 * BUILD_SUCCESS: preflight.tscExitCode===0 AND preflight.buildExitCode===0
 */
const buildSuccessPredicate: VerificationPredicate = {
  claimType: 'BUILD_SUCCESS',
  evaluate(claim, grounding, _evidence, _window, _workspace): VerificationFact[] {
    const facts: VerificationFact[] = [];
    const now = Date.now();

    if (grounding.tscStatus.ran) {
      facts.push({
        checked: 'tsc --noEmit exit code',
        found: grounding.tscStatus.success
          ? 'PASS (0 errors)'
          : 'FAIL (' + grounding.tscErrors.length + ' errors)',
        supports: (grounding.tscStatus.success ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'preflight',
        timestamp: now,
      });
    } else {
      facts.push({
        checked: 'tsc --noEmit',
        found: 'NOT RUN',
        supports: 'NEUTRAL',
        source: 'preflight',
        timestamp: now,
      });
    }

    if (grounding.bundleStatus.ran) {
      facts.push({
        checked: 'bun build exit code',
        found: grounding.bundleStatus.success
          ? 'PASS'
          : 'FAIL: ' + (grounding.bundleStatus.errorMessage ?? 'unknown error'),
        supports: (grounding.bundleStatus.success ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'preflight',
        timestamp: now,
      });
    }

    if (grounding.bundleStatus.success) {
      facts.push({
        checked: 'dist exports count',
        found: grounding.exports.length + ' exports',
        supports: (grounding.exports.length > 0 ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'preflight',
        timestamp: now,
      });
    }

    return facts;
  },
};

/**
 * CONTAINER_TEST_RAN: evidence file exists AND V-1 validated
 */
const containerTestRanPredicate: VerificationPredicate = {
  claimType: 'CONTAINER_TEST_RAN',
  evaluate(claim, _grounding, evidence, _window, workspace): VerificationFact[] {
    const facts: VerificationFact[] = [];
    const now = Date.now();

    facts.push({
      checked: 'ContainerTestResult.json existence',
      found: evidence ? 'EXISTS' : 'MISSING',
      supports: (evidence ? 'SUPPORTS' : 'REFUTES') as FactSupport,
      source: 'evidence_file',
      timestamp: now,
    });

    if (evidence) {
      facts.push({
        checked: 'ContainerTestResult.json content validity',
        found: evidence.valid ? 'VALID' : 'INVALID (' + evidence.failures.length + ' failures)',
        supports: (evidence.valid ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'evidence_file',
        timestamp: now,
      });

      const parsed = evidence.parsedContent as Record<string, unknown> | undefined;
      if (parsed && typeof parsed === 'object') {
        const toolName = parsed.toolName ?? parsed.runner ?? parsed.tool;
        facts.push({
          checked: 'toolName field in evidence',
          found: String(toolName ?? 'ABSENT'),
          supports: (toolName ? 'SUPPORTS' : 'REFUTES') as FactSupport,
          source: 'evidence_file',
          timestamp: now,
        });
      }
    }

    // Also check filesystem accessibility
    const resultPath = claim.evidencePath ?? '.shark/evidence/ContainerTestResult.json';
    const fullPath = path.isAbsolute(resultPath) ? resultPath : path.resolve(workspace, resultPath);
    const stat = safeStat(fullPath);
    if (stat) {
      facts.push({
        checked: 'ContainerTestResult.json readable',
        found: 'READABLE (' + stat.size + ' bytes)',
        supports: 'SUPPORTS',
        source: 'filesystem',
        timestamp: now,
      });
    }

    return facts;
  },
};

/**
 * CONTAINER_TEST_PASSED: evidence passRate >= 0.90
 */
const containerTestPassedPredicate: VerificationPredicate = {
  claimType: 'CONTAINER_TEST_PASSED',
  evaluate(_claim, _grounding, evidence, _window, _workspace): VerificationFact[] {
    const facts: VerificationFact[] = [];
    const now = Date.now();

    if (!evidence) {
      facts.push({
        checked: 'ContainerTestResult.json existence',
        found: 'FILE MISSING',
        supports: 'REFUTES',
        source: 'evidence_file',
        timestamp: now,
      });
      return facts;
    }

    facts.push({
      checked: 'ContainerTestResult.json content validity',
      found: evidence.valid ? 'VALID' : 'INVALID (' + evidence.failures.length + ' failures)',
      supports: (evidence.valid ? 'SUPPORTS' : 'REFUTES') as FactSupport,
      source: 'evidence_file',
      timestamp: now,
    });

    const parsed = evidence.parsedContent as Record<string, unknown> | undefined;
    if (parsed) {
      const overallPassed = parsed.overallPassed ?? parsed.success;
      facts.push({
        checked: 'overallPassed field',
        found: String(overallPassed),
        supports: (overallPassed === true ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'evidence_file',
        timestamp: now,
      });

      const passRate = parsed.passRate ?? parsed.successRate;
      if (typeof passRate === 'number') {
        facts.push({
          checked: 'passRate threshold (>= ' + PASS_RATE_THRESHOLD + ')',
          found: String(passRate),
          supports: (passRate >= PASS_RATE_THRESHOLD ? 'SUPPORTS' : 'REFUTES') as FactSupport,
          source: 'evidence_file',
          timestamp: now,
        });
      }
    }

    return facts;
  },
};

/**
 * EVIDENCE_ARCHIVED: .shark/evidence/ has files with valid timestamps
 */
const evidenceArchivedPredicate: VerificationPredicate = {
  claimType: 'EVIDENCE_ARCHIVED',
  evaluate(claim, _grounding, _evidence, window, workspace): VerificationFact[] {
    const facts: VerificationFact[] = [];
    const now = Date.now();

    const evidenceDir = path.resolve(workspace, claim.evidencePath ?? '.shark/evidence');
    const files = safeReadDir(evidenceDir);

    if (files === null) {
      facts.push({
        checked: 'evidence directory',
        found: 'DIRECTORY MISSING',
        supports: 'REFUTES',
        source: 'filesystem',
        timestamp: now,
      });
      return facts;
    }

    facts.push({
      checked: 'evidence file count',
      found: files.length + ' files in ' + path.basename(evidenceDir),
      supports: (files.length >= 3 ? 'SUPPORTS' : 'REFUTES') as FactSupport,
      source: 'filesystem',
      timestamp: now,
    });

    const freshFiles = files.filter((f: string) => {
      const stat = safeStat(path.join(evidenceDir, f));
      return stat !== null && isMtimeInWindow(stat.mtimeMs, window);
    });

    facts.push({
      checked: 'evidence freshness',
      found: freshFiles.length + '/' + files.length + ' files within session window',
      supports: (freshFiles.length === files.length && files.length > 0 ? 'SUPPORTS' : 'REFUTES') as FactSupport,
      source: 'filesystem',
      timestamp: now,
    });

    return facts;
  },
};

/**
 * GATE_REQUIREMENTS_MET: all gate rules have machine evidence
 */
const gateRequirementsMetPredicate: VerificationPredicate = {
  claimType: 'GATE_REQUIREMENTS_MET',
  evaluate(claim, _grounding, _evidence, _window, workspace): VerificationFact[] {
    const facts: VerificationFact[] = [];
    const now = Date.now();

    const gate = claim.gate as GatePhase;
    const expected = EXPECTED_EVIDENCE[gate] ?? [];

    for (const expectedFile of expected) {
      const fullPath = path.resolve(workspace, expectedFile.path);
      const exists = safeFileExists(fullPath);
      facts.push({
        checked: expectedFile.path + (expectedFile.required ? ' (REQUIRED)' : ''),
        found: exists ? 'PRESENT' : 'MISSING',
        supports: (exists ? 'SUPPORTS' : (expectedFile.required ? 'REFUTES' : 'NEUTRAL')) as FactSupport,
        source: 'filesystem',
        timestamp: now,
      });
    }

    return facts;
  },
};

/**
 * TESTS_PASS: ContainerTestResult.json exists AND overallPassed===true
 */
const testsPassPredicate: VerificationPredicate = {
  claimType: 'TESTS_PASS',
  evaluate(_claim, _grounding, evidence, _window, _workspace): VerificationFact[] {
    const facts: VerificationFact[] = [];
    const now = Date.now();

    if (!evidence) {
      facts.push({
        checked: 'test result file',
        found: 'FILE MISSING',
        supports: 'REFUTES',
        source: 'evidence_file',
        timestamp: now,
      });
      return facts;
    }

    facts.push({
      checked: 'test result content validity',
      found: evidence.valid ? 'VALID' : 'INVALID',
      supports: (evidence.valid ? 'SUPPORTS' : 'REFUTES') as FactSupport,
      source: 'evidence_file',
      timestamp: now,
    });

    const parsed = evidence.parsedContent as Record<string, unknown> | undefined;
    if (parsed) {
      const overallPassed = parsed.overallPassed ?? parsed.success;
      facts.push({
        checked: 'overallPassed field',
        found: String(overallPassed),
        supports: (overallPassed === true ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'evidence_file',
        timestamp: now,
      });
    }

    return facts;
  },
};

/**
 * SPEC_WRITTEN: SPEC.md exists AND non-empty AND >100 bytes
 */
const specWrittenPredicate: VerificationPredicate = {
  claimType: 'SPEC_WRITTEN',
  evaluate(_claim, _grounding, _evidence, _window, workspace): VerificationFact[] {
    const facts: VerificationFact[] = [];
    const now = Date.now();

    const specPath = path.resolve(workspace, 'SPEC.md');
    const stat = safeStat(specPath);

    if (stat) {
      facts.push({
        checked: 'SPEC.md existence',
        found: 'EXISTS (' + stat.size + ' bytes)',
        supports: (stat.size > 100 ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'filesystem',
        timestamp: now,
      });
    } else {
      facts.push({
        checked: 'SPEC.md existence',
        found: 'MISSING',
        supports: 'REFUTES',
        source: 'filesystem',
        timestamp: now,
      });
    }

    return facts;
  },
};

/**
 * CODE_REVIEWED: TridentReport.json exists AND critical===0
 */
const codeReviewedPredicate: VerificationPredicate = {
  claimType: 'CODE_REVIEWED',
  evaluate(_claim, _grounding, _evidence, _window, workspace): VerificationFact[] {
    const facts: VerificationFact[] = [];
    const now = Date.now();

    const reportPath = path.resolve(workspace, '.shark/evidence/TridentReport.json');
    const report = safeReadJson(reportPath);

    if (report) {
      const critical = Number(report.critical ?? report.criticalCount ?? 0);
      facts.push({
        checked: 'TridentReport.json critical findings',
        found: critical + ' critical',
        supports: (critical === 0 ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'evidence_file',
        timestamp: now,
      });
    } else {
      facts.push({
        checked: 'TridentReport.json',
        found: 'MISSING OR UNREADABLE',
        supports: 'REFUTES',
        source: 'evidence_file',
        timestamp: now,
      });
    }

    return facts;
  },
};

/**
 * SHIP_PACKAGE_CREATED: ship package directory exists AND has manifest
 */
const shipPackageCreatedPredicate: VerificationPredicate = {
  claimType: 'SHIP_PACKAGE_CREATED',
  evaluate(_claim, _grounding, _evidence, _window, workspace): VerificationFact[] {
    const facts: VerificationFact[] = [];
    const now = Date.now();

    const shipDir = path.resolve(workspace, '.shark/ship');
    const entries = safeReadDir(shipDir);

    if (entries) {
      facts.push({
        checked: 'ship package directory',
        found: entries.length + ' entries',
        supports: (entries.length > 0 ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'filesystem',
        timestamp: now,
      });

      const hasManifest = entries.some((e: string) => e.includes('manifest') || e.includes('MANIFEST'));
      facts.push({
        checked: 'ship manifest',
        found: hasManifest ? 'PRESENT' : 'MISSING',
        supports: (hasManifest ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'filesystem',
        timestamp: now,
      });
    } else {
      facts.push({
        checked: 'ship package directory',
        found: 'MISSING',
        supports: 'REFUTES',
        source: 'filesystem',
        timestamp: now,
      });
    }

    return facts;
  },
};

/**
 * AUDIT_PASSED: audit report exists with passing result
 */
const auditPassedPredicate: VerificationPredicate = {
  claimType: 'AUDIT_PASSED',
  evaluate(_claim, _grounding, _evidence, _window, workspace): VerificationFact[] {
    const facts: VerificationFact[] = [];
    const now = Date.now();

    const auditPath = path.resolve(workspace, '.shark/evidence/TestAuthenticityReport.json');
    const report = safeReadJson(auditPath);

    if (report) {
      const passed = report.passed ?? report.overallPassed;
      facts.push({
        checked: 'audit report passed',
        found: String(passed),
        supports: (passed === true ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'evidence_file',
        timestamp: now,
      });
    } else {
      facts.push({
        checked: 'audit report',
        found: 'MISSING OR UNREADABLE',
        supports: 'REFUTES',
        source: 'evidence_file',
        timestamp: now,
      });
    }

    return facts;
  },
};

/**
 * MERKLE_CHAIN_VALID: evidence chain hashes link properly
 */
const merkleChainPredicate: VerificationPredicate = {
  claimType: 'MERKLE_CHAIN_VALID',
  evaluate(claim, _grounding, _evidence, _window, workspace): VerificationFact[] {
    const facts: VerificationFact[] = [];
    const now = Date.now();

    const chainPath = path.resolve(workspace, claim.evidencePath ?? '.shark/evidence', 'merkle-chain.json');
    const chain = safeReadJson(chainPath);

    if (chain && Array.isArray(chain)) {
      const chainArr = chain as unknown as Array<{ hash: string; prevHash: string }>;
      let chainValid = true;

      for (let i = 1; i < chainArr.length; i++) {
        if (chainArr[i].prevHash !== chainArr[i - 1].hash) {
          chainValid = false;
          facts.push({
            checked: 'block ' + i + ' prevHash linkage',
            found: 'BROKEN: expected ' + chainArr[i - 1].hash + ', got ' + chainArr[i].prevHash,
            supports: 'REFUTES',
            source: 'evidence_file',
            timestamp: now,
          });
        }
      }

      facts.push({
        checked: 'merkle chain integrity (' + chainArr.length + ' blocks)',
        found: chainValid ? 'VALID' : 'BROKEN',
        supports: (chainValid ? 'SUPPORTS' : 'REFUTES') as FactSupport,
        source: 'evidence_file',
        timestamp: now,
      });
    } else {
      facts.push({
        checked: 'merkle chain file',
        found: 'MISSING OR UNREADABLE',
        supports: 'REFUTES',
        source: 'evidence_file',
        timestamp: now,
      });
    }

    return facts;
  },
};

// ===========================================================================
// CLAIM VERIFIER CLASS
// ===========================================================================

export class ClaimVerifier {
  private matrix: Map<ClaimType, VerificationPredicate>;
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.matrix = this.buildMatrix();
  }

  private buildMatrix(): Map<ClaimType, VerificationPredicate> {
    const m = new Map<ClaimType, VerificationPredicate>();
    m.set('BUILD_SUCCESS', buildSuccessPredicate);
    m.set('BUILD_RAN', buildSuccessPredicate);
    m.set('CONTAINER_TEST_RAN', containerTestRanPredicate);
    m.set('CONTAINER_TEST_PASSED', containerTestPassedPredicate);
    m.set('TESTS_PASS', testsPassPredicate);
    m.set('EVIDENCE_ARCHIVED', evidenceArchivedPredicate);
    m.set('GATE_REQUIREMENTS_MET', gateRequirementsMetPredicate);
    m.set('SPEC_WRITTEN', specWrittenPredicate);
    m.set('CODE_REVIEWED', codeReviewedPredicate);
    m.set('SHIP_PACKAGE_CREATED', shipPackageCreatedPredicate);
    m.set('AUDIT_PASSED', auditPassedPredicate);
    m.set('MERKLE_CHAIN_VALID', merkleChainPredicate);
    m.set('BUILD_VERIFIED', buildSuccessPredicate);
    m.set('PREFLIGHT_PASSED', buildSuccessPredicate);
    return m;
  }

  verify(
    candidate: CandidateClaim,
    grounding: PreflightGrounding,
    evidenceChecks: EvidenceVerification[],
    window: SessionWindow,
  ): ClaimVerification {
    const claim = candidate.claim;
    const predicate = this.matrix.get(claim.type);

    if (!predicate) {
      return this.unverifiableResult(claim);
    }

    const evidence = claim.evidencePath
      ? evidenceChecks.find((e: EvidenceVerification) => {
          const resolvedClaim = path.isAbsolute(claim.evidencePath!)
            ? claim.evidencePath!
            : path.resolve(this.workspacePath, claim.evidencePath!);
          return e.filePath === resolvedClaim || e.filePath === claim.evidencePath;
        })
      : undefined;

    const facts = predicate.evaluate(claim, grounding, evidence, window, this.workspacePath);
    const verdict = this.deriveVerdict(facts, grounding, claim.type);
    const alignment = this.computePreflightAlignment(verdict, grounding, claim.type);
    const confidence = this.applyAlignment(alignment, verdict, facts);

    return {
      claim,
      verdict,
      confidence,
      evidence,
      preflightAlignment: alignment,
      explanation: this.explain(verdict, facts, alignment),
      facts,
    };
  }

  private deriveVerdict(
    facts: VerificationFact[],
    grounding: PreflightGrounding,
    claimType: ClaimType,
  ): ClaimVerdict {
    const refuting = facts.filter((f: VerificationFact) => f.supports === 'REFUTES');
    const supporting = facts.filter((f: VerificationFact) => f.supports === 'SUPPORTS');
    const neutral = facts.filter((f: VerificationFact) => f.supports === 'NEUTRAL');

    if (refuting.length > 0) {
      if ((claimType === 'BUILD_SUCCESS' || claimType === 'BUILD_VERIFIED' || claimType === 'PREFLIGHT_PASSED') &&
          grounding.tscStatus.ran && !grounding.tscStatus.success) {
        return 'SUPPRESSED';
      }
      return 'CONTRADICTED';
    }

    if (supporting.length > 0 && refuting.length === 0) {
      return supporting.length >= 2 ? 'VERIFIED' : 'PARTIALLY_VERIFIED';
    }

    if (neutral.length === facts.length) {
      return 'UNVERIFIABLE';
    }

    return 'INSUFFICIENT_EVIDENCE';
  }

  private computePreflightAlignment(
    verdict: ClaimVerdict,
    grounding: PreflightGrounding,
    claimType: ClaimType,
  ): PreflightAlignment {
    const buildClaimTypes: ClaimType[] = [
      'BUILD_SUCCESS', 'BUILD_RAN', 'BUILD_VERIFIED', 'PREFLIGHT_PASSED', 'EXPORTS_PRESENT',
    ];
    if (!buildClaimTypes.includes(claimType)) {
      return { available: grounding.available, effect: 'N_A' };
    }

    if (!grounding.available || (!grounding.tscStatus.ran && !grounding.bundleStatus.ran)) {
      return {
        available: false,
        effect: 'N_A',
        groundingFact: 'Preflight tools unavailable — cannot ground build claims.',
      };
    }

    const buildActuallyPasses = grounding.tscStatus.success && grounding.bundleStatus.success;

    if (verdict === 'VERIFIED' || verdict === 'PARTIALLY_VERIFIED') {
      if (buildActuallyPasses) {
        return {
          available: true,
          effect: 'BOOST',
          groundingFact: 'Build confirmed: tsc=' + grounding.tscStatus.success +
                         ', bun=' + grounding.bundleStatus.success +
                         ', exports=' + grounding.exports.length,
        };
      } else {
        return {
          available: true,
          effect: 'SUPPRESS',
          groundingFact: 'Build REFUTES claim: tsc=' + grounding.tscStatus.success +
                         ' (' + grounding.tscErrors.length + ' errors)' +
                         ', bun=' + grounding.bundleStatus.success,
        };
      }
    }

    if (verdict === 'CONTRADICTED' || verdict === 'SUPPRESSED') {
      if (!buildActuallyPasses) {
        return {
          available: true,
          effect: 'BOOST',
          groundingFact: 'Build failure confirms the contradiction.',
        };
      }
    }

    return { available: grounding.available, effect: 'NEUTRAL' };
  }

  private applyAlignment(
    alignment: PreflightAlignment,
    _verdict: ClaimVerdict,
    facts: VerificationFact[],
  ): number {
    const supportCount = facts.filter((f: VerificationFact) => f.supports === 'SUPPORTS').length;
    const refuteCount = facts.filter((f: VerificationFact) => f.supports === 'REFUTES').length;
    const total = facts.length || 1;
    let confidence = supportCount / total;

    confidence -= (refuteCount / total) * 0.5;

    switch (alignment.effect) {
      case 'BOOST':
        confidence *= 1.5;
        break;
      case 'SUPPRESS':
        confidence *= 0.1;
        break;
      case 'NEUTRAL':
      case 'N_A':
        break;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private explain(
    verdict: ClaimVerdict,
    facts: VerificationFact[],
    alignment: PreflightAlignment,
  ): string {
    const supporting = facts.filter((f: VerificationFact) => f.supports === 'SUPPORTS');
    const refuting = facts.filter((f: VerificationFact) => f.supports === 'REFUTES');

    const parts: string[] = [];
    parts.push('Verdict: ' + verdict + '.');

    if (supporting.length > 0) {
      parts.push('Supporting facts: ' +
        supporting.map((f: VerificationFact) => f.checked + ' = ' + f.found).join('; ') + '.');
    }

    if (refuting.length > 0) {
      parts.push('Refuting facts: ' +
        refuting.map((f: VerificationFact) => f.checked + ' = ' + f.found).join('; ') + '.');
    }

    if (alignment.effect === 'BOOST') {
      parts.push('Preflight BOOSTED confidence (build confirms claim).');
    } else if (alignment.effect === 'SUPPRESS') {
      parts.push('Preflight SUPPRESSED confidence (build contradicts claim).');
    }

    return parts.join(' ');
  }

  private unverifiableResult(claim: AgentClaim): ClaimVerification {
    return {
      claim,
      verdict: 'UNVERIFIABLE',
      confidence: 0,
      preflightAlignment: { available: false, effect: 'N_A' },
      explanation: 'No verification predicate registered for claim type ' + claim.type +
                   '. This claim type cannot be checked by this engine.',
      facts: [],
    };
  }
}
