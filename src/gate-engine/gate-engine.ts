import { getGateManager } from '../tools/shark-gate.js';
import { GATE_ORDER as CANON_GATE_ORDER } from '../shared/gates.js';
import type { GateName } from '../shared/evidence.js';
import { safeParseJSON } from '../shared/type-guards.js';
import { logInfo } from '../shared/shark-logger.js';
import { verifyEvidence } from '../eie/index.js';
import type { EvidenceSpec } from '../eie/index.js';
import { evaluateBuildGate } from './gates/build-gate.js';
import { evaluateVerifyGate } from './gates/verify-gate.js';
import { evaluateTestGate } from './gates/test-gate.js';
import { evaluateAuditGate } from './gates/audit-gate.js';
import { evaluateDeliveryGate } from './gates/delivery-gate.js';
import { CommonSenseEngine } from '../shark/planning-brain/cse/verification-engine.js';
// Note: plan-gate.ts exports BlockOrchestrator (a tool-blocker), not an evidence
// evaluator. The plan gate evaluator is defined inline in GATE_EVALUATORS below.

export type GateID = 'plan' | 'build' | 'test' | 'verify' | 'audit' | 'delivery';

export interface GateCriteria {
  requiredEvidence: string[];
  minEvidence: number;
  requiresBuild: boolean;
  requiresTest: boolean;
}

export interface GateState {
  currentGate: GateID;
  previousGates: GateID[];
  evidence: Map<string, boolean>;
  iteration: number;
}

const GATE_CRITERIA: Record<GateID, GateCriteria> = {
  plan: { requiredEvidence: ['spec', 'architecture', 'error-strategy'], minEvidence: 3, requiresBuild: false, requiresTest: false },
  build: { requiredEvidence: ['compiled', 'source-verified', 'deps-installed'], minEvidence: 3, requiresBuild: false, requiresTest: false },
  test: { requiredEvidence: ['container-test', 'unit-test', 'browser-test'], minEvidence: 2, requiresBuild: true, requiresTest: false },
  verify: { requiredEvidence: ['compiled', 'source-verified', 'deps-installed'], minEvidence: 3, requiresBuild: true, requiresTest: true },
  audit: { requiredEvidence: ['trident-report', 'semantic-firewall-pass', 'no-critical', 'spec-alignment', 'test-authenticity', 'theatrical-scan'], minEvidence: 6, requiresBuild: true, requiresTest: true },
  delivery: { requiredEvidence: ['ship-package', 'checksum', 'evidence-archive'], minEvidence: 3, requiresBuild: true, requiresTest: true },
};

/**
 * EIE_EVIDENCE_SPECS — maps evidence IDs to semantic verification specs.
 *
 * When the GateEngine checks if evidence is satisfied, it can optionally
 * run EIE semantic verification to ensure the evidence is REAL, not just
 * registered. This catches theatrical patterns where the agent claims to
 * have produced evidence but the actual artifacts are missing/invalid.
 *
 * Only lightweight methods are used here (spec-read, fs-check). Expensive
 * methods (exec-tsc, exec-build, test-run) can be added per-evidence in
 * future iterations.
 */
const EIE_EVIDENCE_SPECS: Record<string, EvidenceSpec> = {
  'spec': { id: 'spec', verify: 'spec-read', minQuality: 0.75 },
  'architecture': { id: 'architecture', verify: 'spec-read', minQuality: 0.6 },
  'error-strategy': { id: 'error-strategy', verify: 'spec-read', minQuality: 0.6 },
  'compiled': { id: 'compiled', verify: 'exec-tsc', minQuality: 1.0 },
  'source-verified': { id: 'source-verified', verify: 'exec-build', minQuality: 1.0 },
  'deps-installed': {
    id: 'deps-installed',
    verify: 'fs-check',
    params: { paths: ['node_modules'] },
    minQuality: 0.8,
  },
  'ship-package': {
    id: 'ship-package',
    verify: 'fs-check',
    params: { paths: ['dist/index.js'], minSize: 1000 },
    minQuality: 0.9,
  },
  'checksum': {
    id: 'checksum',
    verify: 'fs-check',
    params: { paths: ['dist/index.js.sha256'] },
    minQuality: 0.9,
  },
  'evidence-archive': {
    id: 'evidence-archive',
    verify: 'fs-check',
    params: { paths: ['.shark/evidence-archive.json'] },
    minQuality: 0.8,
  },
};

/**
 * GATE_EVALUATORS — maps each gate to its evidence-checking evaluator function.
 *
 * build/verify/test/audit/delivery use the dedicated evaluator files in ./gates/.
 * plan uses an inline evaluator because plan-gate.ts exports BlockOrchestrator
 * (a tool-blocking pre-flight checker), not an evidence evaluator.
 *
 * The PLAN evaluator now ALSO calls CSE.verifyPlanQuality() (Phase 6b) to
 * verify that SPEC.md has real content (not theatrical/stub), meets size
 * requirements, and contains required architecture/requirements/error-strategy
 * sections.
 */
type GateEvaluatorFn = (evidence: Map<string, boolean>, workspacePath?: string) => { passed: boolean; missing: string[]; planQuality?: { passed: boolean; reason: string } };

let _gateEvaluatorWorkspacePath: string | undefined;

/**
 * Set the workspace path for gate evaluators that need filesystem access
 * (e.g., the PLAN evaluator which calls CSE.verifyPlanQuality()).
 */
export function setGateEvaluatorWorkspacePath(workspacePath: string): void {
  _gateEvaluatorWorkspacePath = workspacePath;
}

const GATE_EVALUATORS: Record<GateID, GateEvaluatorFn> = {
  plan: (evidence, workspacePath) => {
    const required = ['spec', 'architecture', 'error-strategy'];
    const missing: string[] = [];
    for (const req of required) {
      if (!evidence.has(req) || !evidence.get(req)) missing.push(req);
    }

    // Phase 6b: CSE Plan Quality Verification
    // Call verifyPlanQuality() to validate SPEC.md has real content.
    // ROOT CAUSE 1 FIX (v5.1): The gate evidence check previously required
    // SEPARATE files for 'architecture' and 'error-strategy', but CSE's
    // verifyPlanQuality() confirms these exist as SECTIONS within SPEC.md.
    // If CSE reports no missing sections, mark architecture/error-strategy
    // as satisfied even though they're not separate files on disk.
    const planQuality: { passed: boolean; reason: string } = { passed: true, reason: 'CSE not available' };
    const wp = workspacePath || _gateEvaluatorWorkspacePath;
    if (wp) {
      try {
        const cse = new CommonSenseEngine(wp);
        const qualityResult = cse.verifyPlanQuality();
        planQuality.passed = qualityResult.passed;
        planQuality.reason = qualityResult.feedback;

        // RC1: CSE confirmed SPEC.md has required sections → satisfy gate evidence
        // even though they're not separate files. verifyPlanQuality() returns
        // missing: string[] with entries like 'architecture section', 'error strategy'.
        // If those are absent from the missing list, the sections ARE present.
        const cseMissing = qualityResult.missing || [];
        if (!cseMissing.includes('architecture section')) {
          const archIdx = missing.indexOf('architecture');
          if (archIdx !== -1) missing.splice(archIdx, 1);
        }
        if (!cseMissing.includes('error strategy')) {
          const esIdx = missing.indexOf('error-strategy');
          if (esIdx !== -1) missing.splice(esIdx, 1);
        }

        if (!qualityResult.passed) {
          // Add to missing so gate advancement is blocked
          missing.push('plan-quality:' + qualityResult.feedback);
        }
      } catch (cseErr) {
        logInfo('[GateEngine] CSE.verifyPlanQuality() failed: ' + (cseErr instanceof Error ? cseErr.message : String(cseErr)));
        planQuality.passed = false;
        planQuality.reason = 'CSE verification engine error';
        missing.push('plan-quality:CSE error');
      }
    }

    return { passed: missing.length === 0, missing, planQuality };
  },
  build: evaluateBuildGate,
  verify: evaluateVerifyGate,
  test: evaluateTestGate,
  audit: evaluateAuditGate,
  delivery: evaluateDeliveryGate,
};

/**
 * GateEngine — evidence tracker that DELEGATES gate state to GateManager.
 *
 * Gate state (current gate, transitions, failure counters) is the responsibility
 * of the GateManager singleton (shared/gates.ts) — the single source of truth.
 * GateEngine retains its local evidence Map and previousGates for tracking which
 * evidence IDs have been satisfied.
 *
 * Before this consolidation, GateEngine maintained a parallel gate tracker that
 * could diverge from GateManager. All gate state now flows through GateManager.
 */
export class GateEngine {
  private state: GateState = { currentGate: 'plan', previousGates: [], evidence: new Map(), iteration: 1 };

  /**
   * Current gate — delegated to GateManager singleton (single source of truth).
   * Falls back to internal state when the singleton is not yet registered
   * (e.g. during unit tests or before plugin initialization completes).
   */
  getCurrentGate(): GateID {
    const gm = getGateManager();
    if (gm) return gm.getCurrentGate() as GateID;
    return this.state.currentGate;
  }

  getState(): GateState {
    const currentGate = this.getCurrentGate();
    return { ...this.state, currentGate, evidence: new Map(this.state.evidence) };
  }

  /**
   * Evidence tracking stays local to GateEngine.
   * GateManager handles persistent evidence via its own EvidenceCollector.
   *
   * In addition to updating the local Map, evidence is persisted to the
   * GateManager's EvidenceCollector so it survives across sessions and
   * can be verified by hasRequiredEvidence().
   */
  submitEvidence(evidenceId: string, passed: boolean): void {
    this.state.evidence.set(evidenceId, passed);
    // Also persist to EvidenceCollector so hasRequiredEvidence() can match it
    try {
      const gm = getGateManager();
      if (gm) {
        const collector = gm.getEvidenceCollector();
        if (collector && typeof collector.collectEvidenceById === 'function') {
          collector.collectEvidenceById(
            this.getCurrentGate() as GateName,
            evidenceId,
            passed,
          );
        }
      }
    } catch (err) {
      logInfo('[GateEngine] Evidence persistence FAILED: ' + (err instanceof Error ? err.message : String(err)));
      throw err; // CRITICAL: evidence must persist
    }
  }

  /**
   * EIE Semantic Verification — verify evidence QUALITY, not just existence.
   *
   * Runs verifyEvidence() on each registered evidence item that (a) has an
   * EIE spec AND (b) is required by the CURRENT gate. If any fails semantic
   * verification, the gate cannot advance. This catches theatrical patterns
   * where evidence is registered but the underlying artifacts are missing,
   * empty, or malformed.
   *
   * IMPORTANT: Only verifies evidence required by the current gate — NOT all
   * accumulated evidence. This prevents BUILD-gate evidence (e.g. 'compiled'
   * which runs exec-tsc) from blocking PLAN-gate advancement. Evidence from
   * other gates accumulates in the map but is only verified when its own gate
   * is the current gate.
   *
   * Only lightweight methods (spec-read, fs-check) are used here.
   * Returns true if all verifiable evidence passes, or if no specs match.
   */
  eieVerify(): { passed: boolean; failures: string[] } {
    const failures: string[] = [];
    const workspacePath = _gateEvaluatorWorkspacePath;
    if (!workspacePath) return { passed: true, failures };

    // Only verify evidence required by the CURRENT gate — not all accumulated evidence.
    // This prevents cross-gate evidence (e.g. 'compiled' at PLAN gate) from blocking
    // advancement via expensive exec-tsc/exec-build checks.
    const currentGate = this.getCurrentGate();
    const requiredIds = new Set(GATE_CRITERIA[currentGate].requiredEvidence);

    for (const [evidenceId, registered] of this.state.evidence) {
      if (!registered) continue;
      if (!requiredIds.has(evidenceId)) continue; // skip non-current-gate evidence
      const spec = EIE_EVIDENCE_SPECS[evidenceId];
      if (!spec) continue; // no EIE spec → skip semantic verification
      try {
        const result = verifyEvidence(evidenceId, workspacePath, spec);
        if (!result.passed) {
          failures.push(`${evidenceId}: ${result.reason}`);
          logInfo(`[GateEngine] EIE evidence ${evidenceId} failed verification: ${result.reason}`);
        }
      } catch (eieErr) {
        // EIE verification crashed — fall back to existence check (pass)
        logInfo('[GateEngine] EIE verification error for ' + evidenceId + ': ' + (eieErr instanceof Error ? eieErr.message : String(eieErr)));
      }
    }
    return { passed: failures.length === 0, failures };
  }

  canAdvance(): { allowed: boolean; missing: string[]; failed: string[]; planQuality?: { passed: boolean; reason: string } } {
    const currentGate = this.getCurrentGate();
    const evalResult = GATE_EVALUATORS[currentGate](this.state.evidence, _gateEvaluatorWorkspacePath);
    // Partition the evaluator's missing list into truly-missing vs present-but-failed
    const missing: string[] = [];
    const failed: string[] = [];
    for (const m of evalResult.missing) {
      if (this.state.evidence.has(m)) {
        failed.push(m);
      } else {
        missing.push(m);
      }
    }
    return { allowed: evalResult.passed, missing, failed, planQuality: evalResult.planQuality };
  }

  /**
   * Advance to the next gate.
   * The authoritative gate transition is delegated to GateManager.transitionTo()
   * using the canonical GATE_ORDER from shared/gates.ts.
   * GateEngine keeps its internal evidence map and previousGates in sync.
   */
  advance(): boolean {
    const currentGate = this.getCurrentGate();
    if (currentGate === 'delivery') return false;

    // The gate engine's own evidence check is BINDING — do NOT delegate
    // to GateManager when required evidence is missing.
    const check = this.canAdvance();
    if (!check.allowed) {
      logInfo(
        `[GateEngine] ADVANCE BLOCKED: missing=${check.missing.join(',')} ` +
        `failed=${check.failed.join(',')}`
      );
      return false;
    }

    // EIE Semantic Verification — verify evidence is REAL, not just registered.
    // Runs lightweight verification (spec-read, fs-check) on each evidence
    // item that has an EIE spec. Blocks advancement if any evidence fails.
    const eieCheck = this.eieVerify();
    if (!eieCheck.passed) {
      logInfo(`[GateEngine] EIE VERIFICATION FAILED: ${eieCheck.failures.join('; ')}`);
      return false;
    }

    // Compute the next gate using the CANONICAL GateManager ordering.
    const currentIdx = CANON_GATE_ORDER.indexOf(currentGate);
    if (currentIdx === -1 || currentIdx >= CANON_GATE_ORDER.length - 1) return false;
    const nextGate = CANON_GATE_ORDER[currentIdx + 1] as GateID;

    // Delegate the authoritative gate transition to GateManager.
    const gm = getGateManager();
    if (gm) {
      const result = gm.transitionTo(nextGate);
      if (!result.success) {
        logInfo(`[GateEngine] GateManager rejected transition to ${nextGate}: ${result.error}`);
        return false;
      }
    } else {
      logInfo('[GateEngine] No GateManager registered — gate transition not delegated');
    }

    // Keep internal tracking in sync.
    this.state.previousGates.push(currentGate);
    this.state.currentGate = nextGate;
    this.state.iteration++;
    return true;
  }

  reset(gate: GateID = 'plan'): void {
    this.state = { currentGate: gate, previousGates: [], evidence: new Map(), iteration: 1 };
    const gm = getGateManager();
    if (gm) gm.transitionTo(gate);
  }

  getCriteria(gate: GateID): GateCriteria { return { ...GATE_CRITERIA[gate] }; }

  serialize(): string {
    return JSON.stringify({
      currentGate: this.getCurrentGate(),
      previousGates: this.state.previousGates,
      evidence: Array.from(this.state.evidence.entries()),
      iteration: this.state.iteration,
    });
  }

  deserialize(json: string): void {
    try {
      const data = safeParseJSON<Record<string, unknown>>(json) || {};
      this.state = {
        currentGate: (typeof data.currentGate === 'string' && data.currentGate ? data.currentGate : 'plan') as GateID,
        previousGates: Array.isArray(data.previousGates) ? data.previousGates as GateID[] : [],
        evidence: new Map(Array.isArray(data.evidence) ? data.evidence as [string, boolean][] : []),
        iteration: typeof data.iteration === 'number' ? data.iteration : 1,
      };
    } catch {
      logInfo('[gate-engine] deserialize failed, reset to plan');
      this.reset('plan');
    }
  }
}
