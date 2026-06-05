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
import type { SystemBrain } from '../../shark/brains/system-brain.js';
import type { CodeContext } from '../../shared/injectables/index.js';
import { logInfo } from '../../shared/shark-logger.js';

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
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
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
  return async (input, output) => {
    if (!input || !output) return;
    const { tool, sessionID } = input;

    if (!isSharkAgent(getCurrentAgent(sessionID))) {
      return;
    }

    const args = (input as { args: unknown }).args;
    const result = (output as { output: unknown }).output;
    const currentGate = gateManager.getCurrentGate();

    logInfo(`tool.execute.after: tool=${tool}, gate=${currentGate}, session=${sessionID}`);

    const writeTools = ['write_file', 'mcp_write_file', 'patch', 'mcp_patch', 'create', 'mcp_create', 'edit', 'mcp_edit'];
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
          const blockResult = executionBrainRef.blockTheatricalCode(codeContent, context);
          if (blockResult.blocked) {
            const violationSummary = blockResult.violations
              .map(v => `[${v.detector.id}] ${v.detector.description}`)
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
                  violations: blockResult.violations.map(v => ({
                    id: v.detector.id,
                    severity: v.detector.severity,
                    description: v.detector.description,
                  })),
                  timestamp: new Date().toISOString(),
                }, null, 2)
              );
            } catch {
              // evidence write failure — non-fatal
            }

            void violationSummary;
          }
        } catch {
          // blockTheatricalCode failure — non-fatal, don't break agent flow
        }

        if (systemBrainRef) {
          try {
            const context2: CodeContext = {
              filePath,
              toolName: tool,
              gate: currentGate,
              surroundingCode: '',
            };
            const violations = systemBrainRef.semanticAnalyze(codeContent, context2);
            if (violations.length > 0) {
              const evidenceDir = getGateEvidenceDir(currentGate);
              try {
                fs.mkdirSync(evidenceDir, { recursive: true });
                fs.writeFileSync(
                  path.join(evidenceDir, 'SemanticAnalysisViolations.json'),
                  JSON.stringify({
                    tool,
                    filePath,
                    violationCount: violations.length,
                    violations: violations.map(v => ({
                      id: v.id,
                      category: v.category,
                      description: v.description,
                      severity: v.severity,
                    })),
                    timestamp: new Date().toISOString(),
                  }, null, 2)
                );
              } catch {
                // evidence write failure — non-fatal
              }
            }
          } catch {
            // semanticAnalyze failure — non-fatal
          }
        }
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
          // evidence write failure — non-fatal, will retry
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
          // evidence write failure — non-fatal
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
      const deliveryBlocked = checkDeliveryGateBlocked();
      lastDeliveryBlocked = deliveryBlocked;

      if (deliveryBlocked) {
        if (tool === 'terminal' || tool === 'bash') {
          const cmd = extractCommandFromArgs(args) || '';
          if (/git.*commit|ship|release|deploy|deliver/i.test(cmd)) {
            throw new Error(`[SHARK DELIVERY BLOCKED] You MUST run 'shark-test-runner' with action='run' before delivery.`);
          }
        }
      }
    }

    const nextGate = checkGateAdvance(currentGate);
    if (nextGate && gateManager.canTransition(nextGate)) {
      const completedGate = gateManager.getCurrentGate();
      gateManager.passCurrentGate();
      gateManager.transitionTo(nextGate);
      createPhaseSnapshot(gateManager, completedGate);
      checkpointOnGateTransition(completedGate, gateManager);

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
          const verifyLoopResult = gateManager.handleVerifyFailure();
          const state = gateManager.getState() as { verifyAttempts: number };
          if (peerDispatch && state.verifyAttempts >= 3) {
            peerDispatch.onGateFailed('verify', state.verifyAttempts);
          }
        }
      }
    }

    if (currentGate === 'audit') {
      const evidenceDir = getGateEvidenceDir('audit');
      const specAlign = readJsonFile(path.join(evidenceDir, SPEC_ALIGNMENT_FILE));
      const testAuth = readJsonFile(path.join(evidenceDir, TEST_AUTHENTICITY_FILE));
      if (specAlign && specAlign.aligned === false) {
        gateManager.handleAuditFailure();
        if (peerDispatch) {
          peerDispatch.onGateFailed('audit', 0);
        }
      }
      if (testAuth && testAuth.authentic === false) {
        gateManager.handleAuditFailure();
        if (peerDispatch) {
          peerDispatch.onGateFailed('audit', 0);
        }
      }
    }
  };
}

function checkGateAdvance(currentGate: GateName): GateName | null {
  const evidenceBase = getEvidenceBase();
  const gateEvidenceDir = getGateEvidenceDir(currentGate);
  const validation = validateGateCriteria(currentGate, gateEvidenceDir);

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
          const allPass = Object.values(checklistResult).every(v => v === true);
          if (!allPass) {
            return null;
          }
        }
      } catch {
        // autoEvaluateChecklist failure — don't block gate on analysis error
      }
    }
  }

  const nextValidation = validateGateCriteria(nextGate, getGateEvidenceDir(nextGate));

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

  return nextGate;
}

function parseTridentResultFindings(result: unknown): { critical: number; high: number } | null {
  try {
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    if (parsed && typeof parsed === 'object') {
      const findings = (parsed as Record<string, unknown>).findings;
      if (findings && typeof (findings as Record<string, unknown>).critical === 'number' && typeof (findings as Record<string, unknown>).high === 'number') {
        return { critical: (findings as Record<string, unknown>).critical as number, high: (findings as Record<string, unknown>).high as number };
      }
    }
  } catch {
    // not JSON — not a trident result
  }
  return null;
}

function parseTestRunnerResult(result: unknown): { suite: string; overallPassed: boolean; passedTests: number; totalTests: number } | null {
  if (!result) return null;

  try {
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    if (parsed && typeof parsed === 'object') {
      return {
        suite: parsed.suite || 'shark-e2e',
        overallPassed: parsed.overallPassed === true,
        passedTests: parsed.passedTests || 0,
        totalTests: parsed.totalTests || 0,
      };
    }
  } catch {
    // Fall through to null
  }

  return null;
}

function checkDeliveryGateBlocked(): boolean {
  const evidencePath = path.join(getGateEvidenceDir('delivery'), CONTAINER_TEST_RESULT_FILE);

  try {
    const content = fs.readFileSync(evidencePath, 'utf-8');
    const testResult = JSON.parse(content);
    return !testResult.overallPassed;
  } catch {
    return true;
  }
}

function buildEvidenceRecord(tool: string, args: unknown, result: unknown): { files: string[]; workEvidence: string } | null {
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
