/**
 * Verification Engine — Main Orchestrator
 * File: src/shark/planning-brain/cse/verification-engine.ts
 *
 * The top-level Common Sense Engine (CSE). Orchestrates the full 6-phase
 * verification pipeline:
 *   Phase 0: Prefilter — generate candidate claims
 *   Phase 1: Preflight grounding (V-4) — run tsc + bun build
 *   Phase 2: Evidence content validation (V-1) — parse and validate content
 *   Phase 3: Claim-reality verification (V-2) — map claims to predicates
 *   Phase 4: Behavioral pattern memory (V-3) — track session trajectory
 *   Phase 5: Blind spot reporting (V-5) — transparent limitations
 *
 * Bible Principle: "Did you VERIFY what you claimed?"
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AgentClaim,
  BehavioralAssessment,
  BlindSpotReport,
  CandidateClaim,
  ClaimType,
  ClaimVerification,
  EnforcementAction,
  EvidenceVerification,
  GatePhase,
  OverallVerdict,
  PreflightGrounding,
  SessionWindow,
  ToolCall,
  VerificationVerdict,
} from './cse-types.js';
import {
  DEFAULT_STALENESS_TOLERANCE,
} from './cse-types.js';
import { EvidenceValidator } from './evidence-validator.js';
import { ClaimVerifier } from './claim-verifier.js';
import { PatternMemoryEngine } from './pattern-memory.js';
import { PreflightRunner } from './preflight-runner.js';
import { BlindSpotReporter } from './blind-spot-reporter.js';

// ===========================================================================
// CLAIM EXTRACTION PATTERNS (Phase 0)
// ===========================================================================

interface ClaimPattern {
  type: ClaimType;
  patterns: RegExp[];
  evidencePath?: string;
}

const CLAIM_PATTERNS: ClaimPattern[] = [
  {
    type: 'BUILD_SUCCESS',
    patterns: [
      /\bbuild\s+(passed|succeeded|completed|finished|is\s+done)\b/i,
      /\bthe\s+build\s+is\s+(working|complete)\b/i,
      /\btsc\s+(passed|clean|no\s+errors)\b/i,
    ],
  },
  {
    type: 'BUILD_RAN',
    patterns: [
      /\bI\s+(ran|executed|completed)\s+(the\s+)?build\b/i,
      /\bbun\s+build\b/i,
      /\bnpm\s+(run\s+)?build\b/i,
    ],
  },
  {
    type: 'CONTAINER_TEST_RAN',
    patterns: [
      /\b(ran|executed)\s+(container\s+)?tests?\b/i,
      /\bcontainer\s+test\b/i,
      /\bshark-test-runner\b/i,
      /\bmanta-test-runner\b/i,
    ],
    // CALIBRATION FIX: evidencePath resolved dynamically in getEvidencePathForType()
    evidencePath: '.shark/ContainerTestResult.json',
  },
  {
    type: 'CONTAINER_TEST_PASSED',
    patterns: [
      /\btests?\s+passed\b/i,
      /\bcontainer\s+tests?\s+passed\b/i,
      /\ball\s+tests?\s+pass/i,
      /\bpass\s*rate\s*(?:is\s+)?\d+%/i,
    ],
    evidencePath: '.shark/ContainerTestResult.json',
  },
  {
    type: 'TESTS_PASS',
    patterns: [
      /\btests?\s+(pass|passed|passing|green)\b/i,
      /\btest\s+suite\s+passed\b/i,
    ],
    evidencePath: '.shark/ContainerTestResult.json',
  },
  {
    type: 'EVIDENCE_ARCHIVED',
    patterns: [
      /\bevidence\s+(has\s+been\s+)?archiv/i,
      /\barchived\s+the\s+evidence\b/i,
      /\bevidence\s+is\s+(complete|ready|archived)\b/i,
    ],
    evidencePath: '.shark/evidence',
  },
  {
    type: 'SPEC_WRITTEN',
    patterns: [
      /\bSPEC\.md\s+(written|created|updated)\b/i,
      /\bspec\s+(is\s+)?(written|complete|ready)\b/i,
    ],
    evidencePath: 'SPEC.md',
  },
  {
    type: 'CODE_REVIEWED',
    patterns: [
      /\b(code\s+)?review\s+(passed|complete|done)\b/i,
      /\btrident\s+report\b/i,
      /\bno\s+(critical|high)\s+(findings|issues)\b/i,
    ],
    evidencePath: '.shark/evidence/TridentReport.json',
  },
  {
    type: 'AUDIT_PASSED',
    patterns: [
      /\baudit\s+passed\b/i,
      /\baudit\s+is\s+(complete|done|passing)\b/i,
    ],
    evidencePath: '.shark/evidence/TestAuthenticityReport.json',
  },
  {
    type: 'BUILD_VERIFIED',
    patterns: [
      /\bbuild\s+(is\s+)?verif/i,
      /\bverified\s+the\s+build\b/i,
    ],
  },
  {
    type: 'SHIP_PACKAGE_CREATED',
    patterns: [
      /\bship\s+package\s+(created|built|ready)\b/i,
      /\bpackaged\s+for\s+delivery\b/i,
    ],
    evidencePath: '.shark/ship',
  },
  {
    type: 'MERKLE_CHAIN_VALID',
    patterns: [
      /\bmerkle\s+chain\s+(is\s+)?(valid|intact)\b/i,
      /\bevidence\s+chain\s+(is\s+)?(valid|intact)\b/i,
    ],
    evidencePath: '.shark/evidence',
  },
  {
    type: 'GATE_ADVANCED',
    patterns: [
      /\bgate\s+(advanced|passed|cleared)\b/i,
      /\bready\s+for\s+(next\s+)?gate\b/i,
    ],
  },
];

/**
 * Map tool names to implicit claim types (used via function below).
 */
const TOOL_TO_CLAIM_TYPE_MAP: Record<string, ClaimType> = {
  'shark-test-runner': 'CONTAINER_TEST_RAN',
  'manta-test-runner': 'CONTAINER_TEST_RAN',
  'shark-run-trident': 'CODE_REVIEWED',
  'trident-code-audit': 'CODE_REVIEWED',
  'manta-code-audit': 'CODE_REVIEWED',
  'manta-runtime-audit': 'AUDIT_PASSED',
};

// ===========================================================================
// VERIFICATION ENGINE
// ===========================================================================

export class CommonSenseEngine {
  private workspacePath: string;
  private evidenceValidator: EvidenceValidator;
  private claimVerifier: ClaimVerifier;
  private patternMemory: PatternMemoryEngine;
  private preflightRunner: PreflightRunner;
  private blindSpotReporter: BlindSpotReporter;
  private claimIdCounter: number = 0;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.evidenceValidator = new EvidenceValidator(workspacePath);
    this.claimVerifier = new ClaimVerifier(workspacePath);
    this.patternMemory = new PatternMemoryEngine(workspacePath);
    this.preflightRunner = new PreflightRunner(workspacePath);
    this.blindSpotReporter = new BlindSpotReporter(workspacePath);
  }

  /**
   * MAIN ENTRY POINT — Run the full verification pipeline.
   */
  async evaluate(
    recentToolCalls: ToolCall[],
    recentMessages: string[],
    gate: GatePhase,
    sessionWindow: { start: number; latestActivity: number },
    sessionId: string = 'default',
  ): Promise<VerificationVerdict> {
    const window: SessionWindow = {
      start: sessionWindow.start,
      latestActivity: sessionWindow.latestActivity,
      stalenessTolerance: DEFAULT_STALENESS_TOLERANCE,
    };

    // PHASE 0: Prefilter — generate candidates
    const candidates = this.extractClaims(recentMessages, recentToolCalls, gate, sessionId);

    // PHASE 1: Preflight grounding (cached per gate)
    const grounding = this.preflightRunner.run(gate);

    // PHASE 2: Evidence content validation
    const evidenceChecks = candidates
      .filter((c: CandidateClaim) => c.claim.evidencePath)
      .map((c: CandidateClaim) => this.evidenceValidator.validate(c, window));

    // PHASE 3: Claim-reality verification
    const claimVerifications = candidates.map((c: CandidateClaim) =>
      this.claimVerifier.verify(c, grounding, evidenceChecks, window)
    );

    // PHASE 4: Behavioral pattern memory
    const behavioral = this.patternMemory.update(
      sessionId,
      claimVerifications,
      recentToolCalls,
      sessionWindow.start,
    );

    // PHASE 5: Blind spot reporting
    const blindSpots = this.blindSpotReporter.report(
      claimVerifications,
      evidenceChecks,
      grounding,
      gate,
    );

    // AGGREGATE
    const verdict = this.aggregate(
      gate, grounding, claimVerifications, evidenceChecks, behavioral, blindSpots,
    );

    this.writeEvidence(verdict);
    return verdict;
  }

  // ===========================================================================
  // PHASE 0: CLAIM EXTRACTION (PREFILTER)
  // ===========================================================================

  /**
   * Extract candidate claims from messages and tool calls.
   */
  private extractClaims(
    messages: string[],
    toolCalls: ToolCall[],
    gate: GatePhase,
    sessionId: string,
  ): CandidateClaim[] {
    const candidates: CandidateClaim[] = [];
    const now = Date.now();

    // A. Keyword scan: scan agent chat for claim phrases
    for (const message of messages) {
      for (const claimPattern of CLAIM_PATTERNS) {
        for (const pattern of claimPattern.patterns) {
          const match = pattern.exec(message);
          if (match) {
            // Find the claim context (surrounding text)
            const startIdx = Math.max(0, match.index - 50);
            const endIdx = Math.min(message.length, match.index + match[0].length + 50);
            const rawText = message.substring(startIdx, endIdx).trim();

            const claim: AgentClaim = {
              claimId: 'claim-' + (++this.claimIdCounter),
              sessionId,
              gate,
              timestamp: now,
              type: claimPattern.type,
              rawText,
              source: 'chat',
              extractionConfidence: 0.8,
              evidencePath: claimPattern.evidencePath,
            };

            const checkedPath = claim.evidencePath
              ? path.resolve(this.workspacePath, claim.evidencePath)
              : '';
            const fileExists = checkedPath ? safeFileExists(checkedPath) : false;

            candidates.push({
              claim,
              triggerSource: 'keyword_scan',
              fileExists,
              checkedPath,
            });
          }
        }
      }
    }

    // B. Tool-to-claim: if a build/test tool was called, generate implicit claim
    for (const toolCall of toolCalls) {
      const claimType = lookupToolClaimType(toolCall.toolName);
      if (claimType) {
        const claim: AgentClaim = {
          claimId: 'claim-' + (++this.claimIdCounter),
          sessionId,
          gate,
          timestamp: toolCall.timestamp,
          type: claimType,
          rawText: 'Tool ' + toolCall.toolName + ' was called',
          source: 'tool_output',
          extractionConfidence: 0.7,
          toolCallId: toolCall.toolCallId,
          evidencePath: this.getEvidencePathForType(claimType),
        };

        const checkedPath = claim.evidencePath
          ? path.resolve(this.workspacePath, claim.evidencePath)
          : '';
        const fileExists = checkedPath ? safeFileExists(checkedPath) : false;

        candidates.push({
          claim,
          triggerSource: 'tool_requirement_map',
          fileExists,
          checkedPath,
        });
      }
    }

    // Deduplicate by claim type (keep highest confidence)
    const byType = new Map<ClaimType, CandidateClaim>();
    for (const c of candidates) {
      const existing = byType.get(c.claim.type);
      if (!existing || c.claim.extractionConfidence > existing.claim.extractionConfidence) {
        byType.set(c.claim.type, c);
      }
    }

    return [...byType.values()];
  }

  private getEvidencePathForType(type: ClaimType): string | undefined {
    // CALIBRATION FIX: ContainerTestResult.json may be in ANY .shark subdirectory.
    // Search all known locations and return the first that exists.
    if (type === 'CONTAINER_TEST_RAN' || type === 'CONTAINER_TEST_PASSED' || type === 'TESTS_PASS') {
      const subDirs = ['evidence', 'evidence/test', 'evidence/verify', 'evidence/delivery', 'evidence/audit', ''];
      for (const sub of subDirs) {
        const candidate = sub
          ? `${this.workspacePath}/.shark/${sub}/ContainerTestResult.json`
          : `${this.workspacePath}/.shark/ContainerTestResult.json`;
        try {
          if (require('node:fs').existsSync(candidate)) return candidate;
        } catch { /* skip */ }
      }
      // Fall back to the standard path (may not exist — that's OK)
      return '.shark/evidence/ContainerTestResult.json';
    }

    const map: Partial<Record<ClaimType, string>> = {
      EVIDENCE_ARCHIVED: '.shark/evidence',
      SPEC_WRITTEN: 'SPEC.md',
      CODE_REVIEWED: '.shark/evidence/TridentReport.json',
      AUDIT_PASSED: '.shark/evidence/TestAuthenticityReport.json',
      SHIP_PACKAGE_CREATED: '.shark/ship',
    };
    return map[type];
  }

  // ===========================================================================
  // AGGREGATE VERDICT
  // ===========================================================================

  private aggregate(
    gate: GatePhase,
    grounding: PreflightGrounding,
    claimVerifications: ClaimVerification[],
    evidenceChecks: EvidenceVerification[],
    behavioral: BehavioralAssessment,
    blindSpots: BlindSpotReport,
  ): VerificationVerdict {
    // Overall verdict from claim verifications
    const allContradicted = claimVerifications.length > 0 && claimVerifications.every((v: ClaimVerification) =>
      v.verdict === 'CONTRADICTED' || v.verdict === 'SUPPRESSED'
    );
    const anyContradicted = claimVerifications.some((v: ClaimVerification) =>
      v.verdict === 'CONTRADICTED' || v.verdict === 'SUPPRESSED'
    );
    const allVerified = claimVerifications.length > 0 && claimVerifications.every((v: ClaimVerification) =>
      v.verdict === 'VERIFIED' || v.verdict === 'PARTIALLY_VERIFIED'
    );

    let overall: OverallVerdict;
    let enforcementAction: EnforcementAction;

    if (claimVerifications.length === 0) {
      // No claims to verify — BUT check grounding before passing.
      // BYPASS FIX: empty claims + failed tsc = BLOCK, not PASS.
      // Without this, the agent can advance past gates with zero claims
      // even when the project doesn't compile.
      if (grounding.tscStatus?.ran && grounding.tscStatus?.success === false) {
        overall = 'INSUFFICIENT_EVIDENCE';
        enforcementAction = 'BLOCK';
      } else if (blindSpots.evidenceCoverage === 0 && grounding.tscStatus?.ran === false) {
        // tsc didn't run AND there's zero evidence coverage — nothing verified at all
        overall = 'INSUFFICIENT_EVIDENCE';
        enforcementAction = 'BLOCK';
      } else {
        overall = 'VERIFIED';
        enforcementAction = 'PASS';
      }
    } else if (allVerified && behavioral.derailmentRisk < 0.4) {
      overall = 'VERIFIED';
      enforcementAction = 'PASS';
    } else if (allVerified && behavioral.derailmentRisk >= 0.4) {
      overall = 'PARTIAL';
      enforcementAction = 'WARN';
    } else if (anyContradicted && allContradicted) {
      overall = 'CONTRADICTED';
      enforcementAction = 'BLOCK';
    } else if (anyContradicted) {
      overall = 'FAILED';
      enforcementAction = 'BLOCK';
    } else if (behavioral.derailmentRisk >= 0.7) {
      overall = 'FAILED';
      enforcementAction = 'ESCALATE';
    } else if (claimVerifications.some((v: ClaimVerification) => v.verdict === 'INSUFFICIENT_EVIDENCE')) {
      overall = 'INSUFFICIENT_EVIDENCE';
      enforcementAction = 'WARN';
    } else {
      overall = 'PARTIAL';
      enforcementAction = 'WARN';
    }

    // Aggregate confidence
    const avgConfidence = claimVerifications.length > 0
      ? claimVerifications.reduce((sum, v) => sum + v.confidence, 0) / claimVerifications.length
      : 1.0;

    // Summary
    const summary = this.composeSummary(
      overall, avgConfidence, claimVerifications.length, behavioral.derailmentRisk,
      blindSpots.evidenceCoverage, blindSpots.statement,
    );

    // ═══ CALIBRATION FIX: CSE advisory mode during PLAN and BUILD gates ═══
    // CSE should only BLOCK during VERIFY, TEST, AUDIT, DELIVERY gates.
    // During PLAN and BUILD, CSE is advisory (warn but don't block).
    //
    // This prevents the chicken-and-egg death spiral where CSE demands
    // evidence (dist/index.js, BuildReport.json) before the agent can
    // CREATE that evidence through actual work. The agent needs to be able
    // to run build commands and write files during BUILD gate without CSE
    // blocking the work that produces the evidence CSE itself requires.
    {
      const gateLower = String(gate).toLowerCase();
      if ((gateLower === 'plan' || gateLower === 'build') && enforcementAction === 'BLOCK') {
        // Downgrade BLOCK → WARN. Downgrade overall verdict to PARTIAL.
        enforcementAction = 'WARN';
        if (overall === 'CONTRADICTED' || overall === 'FAILED' || overall === 'INSUFFICIENT_EVIDENCE') {
          overall = 'PARTIAL';
        }
      }
    }

    return {
      overall,
      confidence: avgConfidence,
      gate,
      evaluatedAt: Date.now(),
      claimVerifications,
      evidenceChecks,
      behavioral,
      blindSpots,
      preflightGrounding: grounding,
      enforcementAction,
      summary,
    };
  }

  private composeSummary(
    overall: OverallVerdict,
    confidence: number,
    claimCount: number,
    derailmentRisk: number,
    coverage: number,
    blindSpotStatement: string,
  ): string {
    return 'Verification: ' + overall + ' (confidence ' + (confidence * 100).toFixed(0) + '%). ' +
           claimCount + ' claims checked. Derailment risk: ' +
           (derailmentRisk * 100).toFixed(0) + '%. ' + blindSpotStatement;
  }

  /**
   * Write a verification verdict evidence artifact to disk (best-effort).
   */
  private writeEvidence(verdict: VerificationVerdict): void {
    try {
      const evidenceDir = path.join(
        this.workspacePath,
        '.shark',
        'cse-evidence',
      );
      fs.mkdirSync(evidenceDir, { recursive: true });
      const evidencePath = path.join(
        evidenceDir,
        `VERIFICATION_VERDICT_${Date.now()}.json`,
      );
      fs.writeFileSync(
        evidencePath,
        JSON.stringify(
          {
            ...verdict,
            engineVersion: 'CSE-v5.0',
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    } catch {
      // Best-effort
    }
  }

  /**
   * Bust the preflight cache (e.g., after source files change).
   */
  bustPreflight(gate?: GatePhase): void {
    this.preflightRunner.bustCache(gate);
  }

  /**
   * Get the pattern history for a session.
   */
  getPatternHistory(sessionId: string): import('./cse-types.js').PatternHistory | undefined {
    return this.patternMemory.getHistory(sessionId);
  }

  /**
   * Verify plan quality for PLAN→BUILD advancement.
   * A plan must be substantial and contain actual architecture/requirements.
   *
   * Called by gate-engine when evaluating plan evidence for gate advancement.
   * Checks SPEC.md existence, size, required sections, and theatrical patterns.
   */
  verifyPlanQuality(workspacePath: string = this.workspacePath): {
    passed: boolean;
    score: number;
    missing: string[];
    feedback: string;
  } {
    const specPath = path.join(workspacePath, 'SPEC.md');

    // Check 1: Does SPEC.md exist?
    if (!fs.existsSync(specPath)) {
      return {
        passed: false,
        score: 0,
        missing: ['SPEC.md'],
        feedback: 'No plan document found. Write SPEC.md with architecture and requirements.',
      };
    }

    const content = fs.readFileSync(specPath, 'utf-8');
    const size = content.length;

    // Check 2: Is it substantial? (> 500 bytes)
    if (size < 500) {
      return {
        passed: false,
        score: 0.1,
        missing: ['substantial-plan'],
        feedback: `Plan is too short (${size} bytes). Write a detailed plan with architecture, error strategy, and test plan.`,
      };
    }

    // Check 3: Does it have architecture sections?
    // Require actual markdown headers (#) or underlined sections, not just
    // keyword mentions anywhere in the body text.
    const hasArchitecture =
      /^#+\s*(architecture|design|structure|components?)/im.test(content) ||
      /\n(architecture|design|structure|components?)\n[-=]{3,}/i.test(content);
    const hasRequirements =
      /^#+\s*(requirements?|features?|specification)/im.test(content) ||
      /\n(requirements?|features?)\n[-=]{3,}/i.test(content);
    const hasErrorStrategy =
      /^#+\s*(error|failure|edge cases?|exception|fallback|error handling|error strategy)/im.test(content) ||
      /\n(error (handling|strategy)|failure|edge cases?)\n[-=]{3,}/i.test(content);
    const hasTestPlan =
      /^#+\s*(test|testing|verification|validation)/im.test(content) ||
      /\n(tests?|testing|verification)\n[-=]{3,}/i.test(content);

    const missing: string[] = [];
    if (!hasArchitecture) missing.push('architecture section');
    if (!hasRequirements) missing.push('requirements section');
    if (!hasErrorStrategy) missing.push('error strategy');
    if (!hasTestPlan) missing.push('test plan');

    const score = (4 - missing.length) / 4;

    if (score < 0.75) {
      return {
        passed: false,
        score,
        missing,
        feedback: `Plan missing: ${missing.join(', ')}. Add these sections to SPEC.md.`,
      };
    }

    // Check 4: Is it theatrical? (just "I'll build it" without details)
    const theatricalPatterns = [
      /^i.?ll build it/i,
      /^just build it/i,
      /^create the project/i,
      /^implement the requirements/i,
    ];
    for (const p of theatricalPatterns) {
      if (p.test(content.trim()) && size < 1000) {
        return {
          passed: false,
          score: 0.2,
          missing: ['detailed-plan'],
          feedback: 'Plan appears theatrical — it makes claims without architectural detail. Write specific sections.',
        };
      }
    }

    return {
      passed: true,
      score,
      missing: [],
      feedback: `Plan verified: ${size} bytes, ${4 - missing.length}/4 sections present. Ready for BUILD.`,
    };
  }
}

// ===========================================================================
// SAFE HELPERS
// ===========================================================================

function safeFileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    void errMsg; // Permission error — treat as non-existent
    return false;
  }
}

function lookupToolClaimType(toolName: string): ClaimType | undefined {
  // Handle both exact names and tool variations via regex
  if (/shark-test-runner|manta-test-runner/i.test(toolName)) return 'CONTAINER_TEST_RAN';
  if (/shark-run-trident|trident-code-audit|manta-code-audit/i.test(toolName)) return 'CODE_REVIEWED';
  if (/manta-runtime-audit/i.test(toolName)) return 'AUDIT_PASSED';
  return TOOL_TO_CLAIM_TYPE_MAP[toolName];
}
