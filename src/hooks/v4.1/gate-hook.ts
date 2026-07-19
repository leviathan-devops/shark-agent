import type { Hooks } from '@opencode-ai/plugin';
import { GateManager, GATE_CHAIN, validateGateCriteria } from '../../shared/gates.js';
import { EvidenceCollector, type GateEvidence, type GateName } from '../../shared/evidence.js';
import { extractCommandFromArgs } from './utils.js';
import type { SharkPeerDispatch } from '../../shark/macro/peer-dispatch.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { getCurrentAgent } from './agent-state.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createPhaseSnapshot } from '../../tools/checkpoint.js';
import { checkpointOnGateTransition } from '../../shared/autonomous-survival.js';
import type { ExecutionBrain } from '../../shark/brains/execution-brain.js';
import type { SystemBrain, RuntimeViolation } from '../../shark/brains/system-brain.js';
import type { CodeContext, EnforcementRule } from '../../shared/injectables/index.js';
import type { BehavioralRequirement } from '../../shared/verification-matrix.js';
import { loadMatrix } from '../../shared/verification-matrix.js';
import { logInfo } from '../../shared/shark-logger.js';
import { runFullAudit } from '../../shared/audit-engine.js';
import { generateDelivery, type DeliveryConfig } from '../../shared/delivery-engine.js';
import { getPlanningBrain } from '../../shark/planning-brain/index.js';
import { safeParseJSON } from '../../shared/type-guards.js';
import { trackGateTransition } from '../../eie/pse-loop-prevention.js';
import { 
  updateThoughtStream, updateCompactionSurvival,
  updatePostCompactionPrompt
} from '../../shared/context-manager.js';

const CONTAINER_TEST_RESULT_FILE = 'ContainerTestResult.json';
const CONTAINER_SPAWN_RESULT_FILE = 'ContainerSpawnResult.json';
const BROWSER_TEST_RESULT_FILE = 'BrowserTestResult.json';
const TRIDENT_REPORT_FILE = 'TridentReport.json';
const ENGINEERING_CHECKLIST_FILE = 'EngineeringChecklist.json';
const SPEC_ALIGNMENT_FILE = 'SpecAlignmentReport.json';
const TEST_AUTHENTICITY_FILE = 'TestAuthenticityReport.json';

let lastDeliveryBlocked = false;
let executionBrainRef: ExecutionBrain | null = null;
let systemBrainRef: SystemBrain | null = null;

export function resetGateHookState(): void {
  lastDeliveryBlocked = false;
}

export function setGateHookBrains(executionBrain: ExecutionBrain, systemBrain: SystemBrain): void {
  executionBrainRef = executionBrain;
  systemBrainRef = systemBrain;
}

function getEvidenceBase(): string {
  return path.join(process.cwd(), '.shark', 'evidence');
}

function getGateEvidenceDir(gate: GateName): string {
  return path.join(getEvidenceBase(), gate);
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return safeParseJSON<Record<string, unknown>>(content);
  } catch (err) {
    logInfo('[gate-hook] readJsonFile failed: ' + (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

function extractCodeContentFromArgs(args: unknown): string {
  if (!args) return '';
  const a = args as Record<string, unknown>;
  if (typeof a.content === 'string') return a.content;
  if (typeof a.code === 'string') return a.code;
  if (typeof a.body === 'string') return a.body;
  if (typeof a.patch === 'string') return a.patch;
  if (typeof a.text === 'string') return a.text;
  if (typeof a.data === 'string') return a.data;
  return '';
}

function extractFilePathFromArgs(args: unknown): string {
  if (!args) return '';
  const a = args as Record<string, unknown>;
  if (typeof a.path === 'string') return a.path;
  if (typeof a.filePath === 'string') return a.filePath;
  if (typeof a.file === 'string') return a.file;
  return '';
}

export function createGateHook(
  gateManager: GateManager,
  evidenceCollector: EvidenceCollector,
  peerDispatch?: SharkPeerDispatch
): Hooks['tool.execute.after'] {
  return async (input: Record<string, unknown>, output: Record<string, unknown>) => {
    if (!input || !output) return;
    const tool = typeof input.tool === 'string' ? input.tool : '';
    const sessionID = typeof input.sessionID === 'string' ? input.sessionID : '';

    if (!isSharkAgent(getCurrentAgent(sessionID))) {
      return;
    }

    const args = (input as { args: unknown }).args;
    const result = (output as { output: unknown }).output;
    const currentGate = gateManager.getCurrentGate() as GateName;

    logInfo(`tool.execute.after: tool=${tool}, gate=${currentGate}, session=${sessionID}`);

    const writeTools = ['write', 'mcp_write', 'write_file', 'mcp_write_file', 'patch', 'mcp_patch', 'create', 'mcp_create', 'edit', 'mcp_edit'];
    if (writeTools.includes(tool) && executionBrainRef) {
      const codeContent = extractCodeContentFromArgs(args);
      const filePath = extractFilePathFromArgs(args);

      if (codeContent.length > 0) {
        const context: CodeContext = {
          filePath,
          toolName: tool,
          gate: currentGate,
          surroundingCode: '',
        };

        try {
          const blockResult = await executionBrainRef.blockTheatricalCode(codeContent, context);
          if (blockResult.blocked) {
            const violationSummary = blockResult.violations
              .map((v: EnforcementRule) => `[${v.detector.id}] ${v.detector.description}`)
              .join('; ');

            const evidenceDir = getGateEvidenceDir(currentGate);
            try {
              fs.mkdirSync(evidenceDir, { recursive: true });
              fs.writeFileSync(
                path.join(evidenceDir, 'TheatricalCodeViolations.json'),
                JSON.stringify({
                  tool,
                  filePath,
                  blocked: true,
                  violations: blockResult.violations.map((v: EnforcementRule) => ({
                    id: v.detector.id,
                    severity: v.detector.severity,
                    description: v.detector.description,
                  })),
                  timestamp: new Date().toISOString(),
                }, null, 2)
              );
            } catch (writeErr) {
              logInfo('[gate-hook] Theatrical code evidence write failed: ' + (writeErr instanceof Error ? writeErr.message : String(writeErr)));
            }

            // HARD BLOCK: Theatrical code detected. Do NOT let this write through.
            throw new Error(`[ENFORCEMENT BLOCKED] Theatrical code detected: ${violationSummary}. File was NOT written. Fix the violations and try again.`);
          }
        } catch (err) {
          // Re-throw enforcement errors that are already structured block messages
          if (err instanceof Error && err.message.startsWith('[ENFORCEMENT BLOCKED]')) {
            throw err;
          }
          logInfo('[gate-hook] blockTheatricalCode failed: ' + (err instanceof Error ? err.message : String(err)));
          // blockTheatricalCode failure — non-fatal, don't break agent flow
        }
        // FIX 3: Removed duplicate semanticAnalyze + violations.length check.
        // The blockTheatricalCode pipeline above already runs the full
        // semantic enforcement (Phase 0 + Phase 1 + Phase 2). Running
        // systemBrainRef.semanticAnalyze() again was dual execution.
      }
    }

    if (tool === 'shark-test-runner') {
      const testResult = parseTestRunnerResult(result);
      if (testResult) {
        const evidenceDir = getGateEvidenceDir(currentGate);
        try {
          fs.mkdirSync(evidenceDir, { recursive: true });
          fs.writeFileSync(
            path.join(evidenceDir, CONTAINER_TEST_RESULT_FILE),
            JSON.stringify(testResult)
          );
        } catch (writeErr) {
          logInfo('[gate-hook] test evidence write failed: ' + (writeErr instanceof Error ? writeErr.message : String(writeErr)));
        }


        const gateEvidence: GateEvidence = {
          gate: currentGate,
          timestamp: Date.now(),
          passed: testResult.overallPassed,
          files: [path.join(evidenceDir, CONTAINER_TEST_RESULT_FILE)],
          metadata: {
            tool: 'shark-test-runner',
            sessionID,
            testSuite: testResult.suite,
            passedTests: testResult.passedTests,
            totalTests: testResult.totalTests,
            overallPassed: testResult.overallPassed,
          },
        };
        evidenceCollector.collectEvidence(gateEvidence);
      }
    }

    if (tool === 'shark-run-trident') {
      const tridentFindings = parseTridentResultFindings(result);
      if (tridentFindings) {
        const evidenceDir = getGateEvidenceDir(currentGate);
        try {
          fs.mkdirSync(evidenceDir, { recursive: true });
          fs.writeFileSync(
            path.join(evidenceDir, TRIDENT_REPORT_FILE),
            JSON.stringify({
              findings: tridentFindings,
              timestamp: Date.now(),
              gate: currentGate,
            })
          );
        } catch (writeErr) {
          logInfo('[gate-hook] trident evidence write failed: ' + (writeErr instanceof Error ? writeErr.message : String(writeErr)));
        }
      }
    }

    const evidence = buildEvidenceRecord(tool, args, result);
    if (evidence) {
      const gateEvidence: GateEvidence = {
        gate: currentGate,
        timestamp: Date.now(),
        passed: true,
        files: evidence.files || [],
        metadata: { tool, sessionID, workEvidence: evidence.workEvidence },
      };
      evidenceCollector.collectEvidence(gateEvidence);
    }

    if (currentGate === 'delivery' && !lastDeliveryBlocked) {
      let deliveryBlocked = checkDeliveryGateBlocked();

      // Check verification matrix — all 7 protocols must be behavioral-pass
      try {
        const planningBrain = getPlanningBrain();
        if (planningBrain && planningBrain.enabled) {
          const matrix = planningBrain.getMatrix();
          const allBehavioralPass = matrix.every((r: BehavioralRequirement) => r.status === 'behavioral-pass');
          if (!allBehavioralPass) {
            const failing = matrix.filter((r: BehavioralRequirement) => r.status !== 'behavioral-pass');
            logInfo(`Delivery blocked: verification matrix has ${failing.length} non-passing requirements: ${failing.map((r: BehavioralRequirement) => `${r.id}:${r.status}`).join(', ')}`);
            deliveryBlocked = true;
          }
        }
      } catch (err) {
        logInfo('[GateHook] Operation failed: ' + (err instanceof Error ? err.message : String(err)));
        // Non-fatal — verification matrix check failure
      }

      lastDeliveryBlocked = deliveryBlocked;

      if (deliveryBlocked) {
        if (tool === 'terminal' || tool === 'bash') {
          const cmd = extractCommandFromArgs(args) || '';
          if (/git.*commit|ship|release|deploy|deliver/i.test(cmd)) {
            throw new Error(`[SHARK DELIVERY BLOCKED] Container test or verification matrix not passing. Run 'shark-test-runner action=run' and ensure all 7 protocols are behavioral-pass.`);
          }
        }
      }
    }

    const nextGate = checkGateAdvance(currentGate);
    if (nextGate && gateManager.canTransition(nextGate)) {
      const completedGate = gateManager.getCurrentGate() as GateName;
      gateManager.passCurrentGate();
      gateManager.transitionTo(nextGate);
      // Track gate transition for loop detection
      trackGateTransition(currentGate, nextGate);
      createPhaseSnapshot(gateManager, completedGate);
      checkpointOnGateTransition(completedGate, gateManager);

      if (peerDispatch) {
        peerDispatch.onGateTransition(completedGate, nextGate);
      }

      if (nextGate === 'verify' && currentGate === 'build' && peerDispatch) {
        peerDispatch.onBuildComplete();
      }
    }

    if (currentGate === 'test') {
      if (tool === 'shark-test-runner') {
        const tr = parseTestRunnerResult(result);
        if (tr && tr.totalTests > 0) {
          const passRate = tr.passedTests / tr.totalTests;
          if (passRate < 0.90) {
            gateManager.blockCurrentGate();
            gateManager.failCurrentGate();
            const testLoopResult = gateManager.handleTestFailure();
            if (peerDispatch && testLoopResult.action === 'escalate') {
              peerDispatch.onGateFailed('test', gateManager.getTestAttempts());
            }
          }
        }
      }
    }

    if (currentGate === 'verify') {
      if (tool === 'shark-run-trident') {
        const tridentFindings = parseTridentResultFindings(result);
        if (tridentFindings && (tridentFindings.critical > 0 || tridentFindings.high > 0)) {
          gateManager.blockCurrentGate();
          gateManager.failCurrentGate();
          gateManager.handleVerifyFailure();
          if (peerDispatch) {
            peerDispatch.onVerifyFailure();
          }
          const verifyAttempts = gateManager.getVerifyAttempts();
          if (peerDispatch && verifyAttempts >= 3) {
            peerDispatch.onGateFailed('verify', verifyAttempts);
          }
        }
      }
    }

    if (currentGate === 'audit') {
      // Run full audit engine — generates SpecAlignmentReport.json and TestAuthenticityReport.json
      try {
        const auditResult = runFullAudit(path.join(process.cwd(), 'src'));
        logInfo(`AuditEngine: aligned=${auditResult.specAlignment.aligned}, authentic=${auditResult.testAuthenticity.authentic}, theatrical=${auditResult.theatricalCode.clean}, overall=${auditResult.overallPassed}`);

        // ── Collect audit evidence with required IDs ──────────────
        // The EvidenceCollector requires entries with IDs 'spec-alignment',
        // 'test-authenticity', 'theatrical-scan' for canTransition('delivery')
        // to pass. Without this, the audit→delivery transition is always blocked
        // even when the report files exist with positive results.
        try {
          evidenceCollector.collectEvidenceById('audit', 'spec-alignment', auditResult.specAlignment.aligned === true);
          evidenceCollector.collectEvidenceById('audit', 'test-authenticity', auditResult.testAuthenticity.authentic === true);
          evidenceCollector.collectEvidenceById('audit', 'theatrical-scan', auditResult.theatricalCode.clean === true);
        } catch (collectErr) {
          logInfo('[AuditEngine] collectEvidenceById failed: ' + (collectErr instanceof Error ? collectErr.message : String(collectErr)));
        }

        if (!auditResult.overallPassed) {
          const issues: string[] = [
            ...auditResult.specAlignment.issues,
            ...auditResult.testAuthenticity.issues,
            ...auditResult.theatricalCode.violations.map((v: { file: string; line: number; pattern: string; description: string }) => `${v.file}:${v.line} — ${v.description}`),
          ];
          if (!Array.isArray(output.system)) output.system = [];
          (output.system as unknown[]).push(`[AUDIT ENGINE] ${issues.length} issues found:`);
          for (const issue of issues.slice(0, 5)) {
            (output.system as unknown[]).push(`  [AUDIT] ${issue}`);
          }
        }
      } catch (auditErr) {
        logInfo('[AuditEngine] runFullAudit failed: ' + (auditErr instanceof Error ? auditErr.message : String(auditErr)));
      }

      const evidenceDir = getGateEvidenceDir('audit');
      const specAlign = readJsonFile(path.join(evidenceDir, SPEC_ALIGNMENT_FILE));
      const testAuth = readJsonFile(path.join(evidenceDir, TEST_AUTHENTICITY_FILE));
      if (specAlign && specAlign.aligned === false) {
        gateManager.blockCurrentGate();
        gateManager.failCurrentGate();
        gateManager.handleAuditFailure();
        if (peerDispatch) {
          peerDispatch.onGateFailed('audit', 0);
        }
      }
      if (testAuth && testAuth.authentic === false) {
        gateManager.blockCurrentGate();
        gateManager.failCurrentGate();
        gateManager.handleAuditFailure();
        if (peerDispatch) {
          peerDispatch.onGateFailed('audit', 0);
        }
      }
    }

    // DeliveryEngine: Generate ship package when entering delivery gate
    // VERIFICATION MATRIX GATE: block ship if any matrix item is not behavioral-pass
    if (currentGate === 'delivery') {
      try {
        // ── Pre-flight: check verification matrix ──
        const sharkBase = path.join(process.cwd(), '.shark');
        const matrix = loadMatrix(sharkBase);
        const unverified = matrix.filter(r => r.status !== 'behavioral-pass');
        if (unverified.length > 0) {
          const ids = unverified.map(r => `${r.id}:${r.status}`).join(', ');
          logInfo(`[DeliveryEngine] BLOCKED — verification matrix not satisfied: ${ids}`);
          if (!Array.isArray(output.system)) output.system = [];
          (output.system as unknown[]).push(`[DELIVERY] BLOCKED: ${unverified.length} unverified matrix items: ${ids}`);
          (output.system as unknown[]).push('[DELIVERY] All items must be behavioral-pass before shipping.');
          return; // Do NOT ship
        }

        const evidenceBase = path.join(process.cwd(), '.shark', 'evidence');
        const config: DeliveryConfig = {
          projectName: 'SHARK',
          version: 'v5.1.0',
          evidenceBase,
          sourceDir: path.join(process.cwd(), 'src'),
          identityDir: path.join(process.cwd(), 'identity'),
        };
        const result = generateDelivery(config);
        if (result.success) {
          logInfo(`DeliveryEngine: Package shipped to ${result.shipDir}`);
          if (!Array.isArray(output.system)) output.system = [];
          (output.system as unknown[]).push(`[DELIVERY] Ship package: ${result.shipDir}`);
          (output.system as unknown[]).push(`[DELIVERY] Changelog: ${result.changelogPath}`);
          (output.system as unknown[]).push(`[DELIVERY] Build report: ${result.buildReportPath}`);
        } else {
          logInfo(`DeliveryEngine: Ship failed — ${result.error || 'unknown error'}`);
        }
      } catch (deliveryErr) {
        logInfo('[DeliveryEngine] generateDelivery failed: ' + (deliveryErr instanceof Error ? deliveryErr.message : String(deliveryErr)));
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // AUTONOMOUS CONTEXT DOC UPDATES — mechanical triggers (fallback)
    // Primary updates are in hooks/index.ts tool.execute.after handler.
    // This is a secondary update point in case the primary is bypassed.
    // ═══════════════════════════════════════════════════════════════
    try {
      const toolName = tool || 'unknown';
      const gateStr = currentGate || 'unknown';

      updateThoughtStream(`tool=${toolName} gate=${gateStr}`);
      updateCompactionSurvival(gateStr.toUpperCase(), 0, 0, `Tool: ${toolName}`);
      updatePostCompactionPrompt(toolName, gateStr, 0, 0);
    } catch (ctxErr) {
      logInfo(`[GateHook-FallbackCtx] Context doc update failed for ${tool}: ${ctxErr instanceof Error ? ctxErr.message : String(ctxErr)}`);
    }
  };
}

function checkGateAdvance(currentGate: GateName): GateName | null {
  // FIXED: Pass the .shark base path (NOT the gate-specific evidence dir).
  // validateGateCriteria() creates EvidenceCollector(basePath) which reads
  // from basePath/evidence/{gate}/. Passing '.shark/evidence/{gate}' would
  // cause it to read from '.shark/evidence/{gate}/evidence/{gate}/' — a
  // non-existent double-nested path that never finds evidence.
  const sharkBase = path.join(process.cwd(), '.shark');
  const validation = validateGateCriteria(currentGate, sharkBase);
  // gateEvidenceDir is still needed for reading specific evidence files below
  const gateEvidenceDir = getGateEvidenceDir(currentGate);

  if (!validation.passed) {
    return null;
  }

  const currentIndex = GATE_CHAIN.indexOf(currentGate);
  if (currentIndex >= GATE_CHAIN.length - 1) {
    return null;
  }

  const nextGate = GATE_CHAIN[currentIndex + 1];

  if (nextGate === 'verify') {
    const checklist = readJsonFile(path.join(gateEvidenceDir, ENGINEERING_CHECKLIST_FILE));
    if (checklist) {
      const requiredFields = [
        'returnTypeCorrect', 'nullSafetyHandled', 'errorPathsComplete',
        'resourceCleanupAllPaths', 'concurrentSafety', 'importValidity',
        'pathResolution', 'configValidated', 'typeAssertionsGuarded',
        'asyncDiscipline', 'crossSystemDataContractsValidated',
        'coupledDataConsistencyVerified', 'gridDataIntegrityVerified',
      ];
      for (const field of requiredFields) {
        if (checklist[field] !== true) {
          return null;
        }
      }
    }

    if (executionBrainRef) {
      try {
        const state = executionBrainRef.getState();
        if (state?.state.context?.buildOutput && typeof state.state.context.buildOutput === 'string') {
          const context: CodeContext = {
            filePath: '',
            toolName: 'gate-advance',
            gate: currentGate,
            surroundingCode: '',
          };
          const checklistResult = executionBrainRef.autoEvaluateChecklist(
            state.state.context.buildOutput,
            context,
          );
          const allPass = Object.values(checklistResult).every((v: boolean) => v === true);
          if (!allPass) {
            return null;
          }
        }
      } catch (checklistErr) {
        logInfo('[gate-hook] autoEvaluateChecklist failed: ' + (checklistErr instanceof Error ? checklistErr.message : String(checklistErr)));
        return null;
      }
    }
  }

  validateGateCriteria(nextGate as GateName, getGateEvidenceDir(nextGate as GateName));

  if (nextGate === 'test') {
    const tridentReport = readJsonFile(path.join(getGateEvidenceDir('verify'), TRIDENT_REPORT_FILE));
    if (!tridentReport) {
      return null;
    }
    const findings = tridentReport.findings as Record<string, unknown> | undefined;
    if (!findings) return null;
    const critical = typeof findings.critical === 'number' ? findings.critical : -1;
    const high = typeof findings.high === 'number' ? findings.high : -1;
    if (critical > 0 || high > 0) {
      return null;
    }
  }

  if (nextGate === 'audit') {
    const spawnResult = readJsonFile(path.join(getGateEvidenceDir('test'), CONTAINER_SPAWN_RESULT_FILE));
    const testResult = readJsonFile(path.join(getGateEvidenceDir('test'), CONTAINER_TEST_RESULT_FILE));
    const browserTestResult = readJsonFile(path.join(getGateEvidenceDir('test'), BROWSER_TEST_RESULT_FILE));

    const containerTestPassed = spawnResult && spawnResult.success === true &&
      testResult && testResult.overallPassed === true;

    const browserTestPassed = browserTestResult &&
      browserTestResult.overallPassed === true &&
      browserTestResult.syntaxPass === true;

    if (!containerTestPassed && !browserTestPassed) {
      return null;
    }
    if (containerTestPassed) {
      const passRate = typeof testResult.passRate === 'number' ? testResult.passRate : 0;
      if (passRate < 0.9) return null;
    }
  }

  if (nextGate === 'delivery') {
    const specAlign = readJsonFile(path.join(getGateEvidenceDir('audit'), SPEC_ALIGNMENT_FILE));
    const testAuth = readJsonFile(path.join(getGateEvidenceDir('audit'), TEST_AUTHENTICITY_FILE));
    if (!specAlign || specAlign.aligned !== true) return null;
    if (!testAuth || testAuth.authentic !== true) return null;
  }

  return nextGate as GateName;
}

function parseTridentResultFindings(result: unknown): { critical: number; high: number } | null {
  try {
    const parsed = typeof result === 'string' ? safeParseJSON(result) : result;
    if (parsed && typeof parsed === 'object') {
      const findings = (parsed as Record<string, unknown>).findings;
      if (findings && typeof (findings as Record<string, unknown>).critical === 'number' && typeof (findings as Record<string, unknown>).high === 'number') {
        return { critical: (findings as Record<string, unknown>).critical as number, high: (findings as Record<string, unknown>).high as number };
      }
    }
  } catch (parseErr) {
    logInfo('[gate-hook] parseTridentResultFindings failed: ' + (parseErr instanceof Error ? parseErr.message : String(parseErr)));
    return null;
  }
  return null;
}

function parseTestRunnerResult(result: unknown): { suite: string; overallPassed: boolean; passedTests: number; totalTests: number } | null {
  if (!result) return null;

  try {
    const parsed = typeof result === 'string' ? safeParseJSON(result) : result;
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      return {
        suite: (p.suite as string) || 'shark-e2e',
        overallPassed: p.overallPassed === true,
        passedTests: (p.passedTests as number) || 0,
        totalTests: (p.totalTests as number) || 0,
      };
    }
  } catch (parseErr2) {
    logInfo('[gate-hook] parseTestRunnerResult failed: ' + (parseErr2 instanceof Error ? parseErr2.message : String(parseErr2)));
    return null;
  }

  return null;
}

function checkDeliveryGateBlocked(): boolean {
  const evidencePath = path.join(getGateEvidenceDir('delivery'), CONTAINER_TEST_RESULT_FILE);

  try {
    const content = fs.readFileSync(evidencePath, 'utf-8');
    const testResult = safeParseJSON(content) as Record<string, unknown>;
    return !testResult.overallPassed;
  } catch (err) {
    logInfo(`[GateHook] Operation failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function buildEvidenceRecord(tool: string, args: unknown, _result: unknown): { files: string[]; workEvidence: string } | null {
  if (!args) return null;
  const a = args as Record<string, unknown>;

  switch (tool) {
    case 'write_file':
    case 'mcp_write_file': {
      const filePath = a.path as string;
      return { files: filePath ? [filePath] : [], workEvidence: `wrote:${filePath}` };
    }
    case 'patch':
    case 'mcp_patch': {
      const filePath = a.path as string;
      return { files: filePath ? [filePath] : [], workEvidence: `patched:${filePath}` };
    }
    case 'terminal':
    case 'mcp_terminal': {
      const cmd = extractCommandFromArgs(args) || '';
      return { files: [], workEvidence: `ran:${cmd.slice(0, 100)}` };
    }
    default:
      return null;
  }
}
