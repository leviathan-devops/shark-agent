/**
 * Shark Agent v5.1.0 — 2-Lobe Planning Brain Architecture
 *
 * Triple-Brain Parallel Architecture: Execution + Reasoning + System brains
 * running concurrently, synchronized only at workflow gates.
 *
 * NOT a swarm. NOT an orchestrator. Standalone linear execution agent.
 */
import type { Plugin, PluginInput, Hooks } from '@opencode-ai/plugin';
import * as path from 'node:path';
import { createStateStore } from './shared/state-store.js';
import { createSharkMessenger } from './shared/messenger.js';
import { Guardian } from './shared/guardian.js';
import { GateManager } from './shared/gates.js';
import { EvidenceCollector } from './shared/evidence.js';
import { createSharkHooks } from './hooks/v4.1/index.js';
import { createSharkStatusTool } from './tools/shark-status.js';
import { createSharkGateTool, setGateManager } from './tools/shark-gate.js';
import { createSharkEvidenceTool } from './tools/shark-evidence.js';
import { createCheckpointTool } from './tools/checkpoint.js';
import { createSharkTestRunnerTool } from './tools/shark-test-runner.js';
import { createSharkDiagnosticTool, createSharkHealthCheckTool } from './tools/shark-diagnose.js';
import { createSharkSpawnContainerTool } from './tools/shark-spawn-container.js';
import { createSharkRunTridentTool } from './tools/shark-run-trident.js';
import { createHiveContextTool } from './tools/hive-context.js';
import { createCheckpointHistoryTool } from './tools/checkpoint-history.js';
import { createSharkAuditTool } from './tools/shark-audit.js';
import { createSharkBrowserTool } from './tools/shark-browser.js';
import { createSharkVisionTool } from './tools/shark-vision.js';
import { createSharkBrowserTestTool } from './tools/shark-browser-test.js';
import { createSharkEvidenceQueryTool } from './tools/shark-evidence-query.js';
import { createSharkDeliverTool } from './tools/shark-deliver.js';
import { initializeTripleBrain } from './shark/brains/index.js';
import { getSharkIdentityPrompt, SHARK_PLUGIN_IDENTITY, setPluginDirectory } from './shared/identity-loader.js';
import { getSharkInstructions } from './shared/identity-header.js';
import { synthesizeT1Injectables, getT1TotalSize, setSynthesizerPluginDirectory } from './shared/identity-synthesizer.js';
import { initLogger, logInfo } from './shared/shark-logger.js';
import { EnforcementBrain } from './shark/enforcement-brain/index.js';
import { initializeContextManager } from './shared/context-manager.js';
import { createPlanningBrain, getPlanningBrain } from './shark/planning-brain/index.js';
import { SemanticFirewall } from './semantic-firewall/semantic-firewall.js';
import { ExecutionContext } from './semantic-firewall/execution-context.js';
import { MerkleChain, setMerkleChain } from './evidence-engine/merkle-chain.js';
import { validateEvidence } from './evidence-engine/evidence-validator.js';
import { GateEngine, setGateEvaluatorWorkspacePath } from './gate-engine/gate-engine.js';

import { initializeWarheads, getWarheadCount } from './shared/warhead-synthesizer.js';
import { VerbFrameLexicon } from './shark/karpathy/verb-frame-lexicon.js';

// ── Wave 3 imports ─────────────────────────────────────────────
import { EvidenceDB, setEvidenceDB } from './evidence-engine/evidence-db.js';
import { Tokenizer, setTokenizer } from './nlp-pipeline/tokenizer.js';
import { IntentProcessor, setIntentProcessor } from './nlp-pipeline/intent-processor.js';
import { EditHistory, setEditHistory } from './shared/edit-history.js';
import { GateMachineXState, setGateMachineXState } from './gate-engine/gate-machine-xstate.js';
import type { GatePhase } from './gate-engine/gate-machine-xstate.js';

const sharkColor = '#228B22';

export default async function SharkAgent(input: PluginInput): Promise<Hooks> {
  const { directory } = input;
  const workspacePath = process.cwd();

  setPluginDirectory(directory);
  setSynthesizerPluginDirectory(directory);

  const stateStore = createStateStore();
  const messenger = createSharkMessenger();
  const guardian = new Guardian({ level: 'SANDBOX' });
  const gm = new GateManager(path.join(workspacePath, '.shark'));
  setGateManager(gm); // Register singleton for cross-module access
  const ec = new EvidenceCollector(path.join(workspacePath, '.shark'));

  // Initialize triple-brain parallel architecture
  const {
    executionBrain,
    reasoningBrain,
    systemBrain,
    concurrencyManager,
  } = initializeTripleBrain(workspacePath);

  // Load Shark identity
  const sharkIdentityPrompt = getSharkIdentityPrompt();

  // Synthesize T1 warheads from T2 identity (runs once, caches result)
  synthesizeT1Injectables();
  logInfo('T1 warheads synthesized: ' + getT1TotalSize() + ' bytes total');

  // Initialize Enforcement Brain (Karpathy frontal lobe + RGE + SRE)
  const enforcementBrain = new EnforcementBrain({
    basePath: path.join(workspacePath, '.shark'),
    frontalLobe: { enabled: true, enforcement: 'MEDIUM' }, // Start MEDIUM (warn), graduate to CRITICAL (block)
    rge: { enabled: true, enforcement: 'CRITICAL' },
    sre: { enabled: true, enforcement: 'CRITICAL' },
  });

  // Initialize Context Manager — creates project folder + seeds all 9 docs
  const contextDir = initializeContextManager(workspacePath);
  logInfo(`ContextManager: ${contextDir}`);

  const executionCtx = new ExecutionContext(workspacePath);
  const semanticFirewall = new SemanticFirewall(workspacePath, executionCtx);
  let sfInitialized = false;
  try {
    sfInitialized = semanticFirewall.initialize();
  } catch (err) {
    console.warn('[SharkAgent] SemanticFirewall init crashed (non-fatal):', err);
  }
  logInfo(`SemanticFirewall initialized: ${sfInitialized}`);

  const merkleChain = new MerkleChain(workspacePath);
  setMerkleChain(merkleChain);
  logInfo(`MerkleChain initialized: ${merkleChain.recent(1).length} existing blocks`);

  const gateEngine = new GateEngine();
  setGateEvaluatorWorkspacePath(workspacePath);
  logInfo(`GateEngine initialized: gate=${gateEngine.getCurrentGate()}`);

  // ── Wave 3: EvidenceDB — SQLite-backed evidence persistence ──
  const evidenceDB = new EvidenceDB(path.join(workspacePath, '.shark'));
  setEvidenceDB(evidenceDB);
  logInfo(`EvidenceDB initialized: SQLite at .shark/evidence.db`);

  // ── Wave 3: NLP Pipeline — tokenizer + intent processor ────
  const tokenizer = new Tokenizer();
  const intentProcessor = new IntentProcessor({
    basePath: path.join(workspacePath, '.shark'),
    gate: gm.getCurrentGate() || 'PLAN',
  });
  logInfo(`NLP Pipeline initialized: tokenizer + intentProcessor`);

  // ── Wire NLP Pipeline singletons ───────────────────────────
  setTokenizer(tokenizer);
  setIntentProcessor(intentProcessor);

  // ── Wave 3: GateMachineXState — hierarchical state machine ─
  const gateMachineXState = new GateMachineXState(gm, (gm.getCurrentGate() || 'plan').toLowerCase() as GatePhase);
  setGateMachineXState(gateMachineXState);
  logInfo(`GateMachineXState initialized: phase=${gateMachineXState.getPhase()}`);

  // Initialize warhead system (11 warheads — FATAL on failure)
  // If warheads don't register, enforcement is dead. Plugin must not load.
  try {
    await initializeWarheads();
    logInfo('Warheads initialized: ' + getWarheadCount() + ' registered');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logInfo(`Warhead init FAILED: ${msg}`);
    throw new Error(`[FATAL] Warhead initialization failed — enforcement unavailable: ${msg}`);
  }

  // Initialize Planning Brain — 3-lobe intelligence (disabled via DISABLE_PLANNING_BRAIN=true)
  const verbFrameLexicon = new VerbFrameLexicon();
  const planningBrain = createPlanningBrain({
    basePath: workspacePath,
    contextDir: contextDir,
    verbFrameLexicon,
  });
  if (planningBrain.enabled) {
    logInfo('PlanningBrain: enabled (3-lobe: CommonSense + ContextMgmt + Frontal PSM)');
  } else {
    logInfo('PlanningBrain: disabled via DISABLE_PLANNING_BRAIN=true');
  }

  // Linear hooks setup with identity injection + enforcement brain
  const hooks = createSharkHooks(
    guardian,
    gm,
    ec,
    stateStore,
    messenger,
    sharkIdentityPrompt,
    SHARK_PLUGIN_IDENTITY,
    concurrencyManager,
    executionBrain,
    systemBrain,
    enforcementBrain,
    semanticFirewall,
    executionCtx,
    merkleChain,
    gateEngine,
    validateEvidence
  );

  // Start triple-brain concurrency (200ms/200ms/500ms polling loops)
  concurrencyManager.startAll();

  // Initialize file-based logger (writes to .shark/shark-agent.log)
  initLogger(directory || workspacePath);

  // Log hook registration for runtime verification (T2 Bible §Checklist)
  const hookList = Object.keys(hooks).filter(k => k !== 'tool' && k !== 'config');
  // NOTE: tools are defined in the return object below, not in `hooks`.
  // We list them explicitly here since they're created in the return statement.
  const TOOL_NAMES = [
    'shark-status', 'shark-gate', 'shark-evidence', 'shark-test-runner',
    'shark-checkpoint', 'shark-diagnose', 'shark-health', 'shark-spawn-container',
    'shark-run-trident', 'shark-hive-context', 'shark-checkpoint-history',
    'shark-audit', 'shark-browser', 'shark-vision', 'shark-browser-test',
    'shark-evidence-query', 'shark-deliver',
  ];
  logInfo(`Plugin v5.1.0 initialized: ${hookList.length} hooks, ${TOOL_NAMES.length} tools`);
  logInfo(`Hooks: ${hookList.join(', ')}`);
  logInfo(`Tools: ${TOOL_NAMES.join(', ')}`);
  logInfo(`Identity: shark | Brains: execution, reasoning, system | Gate: PLAN`);

  // Set initial brain state so shark-status doesn't show "unknown"
  const brainStatus = concurrencyManager.getStatus();
  stateStore.set('shark-macro-state', {
    activeBrains: ['execution', 'reasoning', 'system'],
    executionRunning: brainStatus.executionRunning,
    reasoningRunning: brainStatus.reasoningRunning,
    systemRunning: brainStatus.systemRunning,
    messagesProcessed: brainStatus.messagesProcessed,
  }, 'shark-state', 'shark-execution-brain');

  // NLP Pipeline components registered via singletons (setTokenizer, setIntentProcessor)
  // XState Gate Machine registered via singleton (setGateMachineXState)
  // EvidenceDB registered via singleton (setEvidenceDB)

  // ── Edit History tracker ────────────────────────────────────
  const editHistory = new EditHistory();
  setEditHistory(editHistory);
  logInfo(`EditHistory initialized`);

  return {
    tool: {
      'shark-status': createSharkStatusTool(stateStore, gm),
      'shark-gate': createSharkGateTool(gm, guardian, gateEngine),
      'shark-evidence': createSharkEvidenceTool(ec),
      'shark-test-runner': createSharkTestRunnerTool(),
      'shark-checkpoint': createCheckpointTool(stateStore, gm),
      'shark-diagnose': createSharkDiagnosticTool(),
      'shark-health': createSharkHealthCheckTool(),
      'shark-spawn-container': createSharkSpawnContainerTool(),
      'shark-run-trident': createSharkRunTridentTool(),
      'shark-hive-context': createHiveContextTool(),
      'shark-checkpoint-history': createCheckpointHistoryTool(),
      'shark-audit': createSharkAuditTool(),
      'shark-browser': createSharkBrowserTool(),
      'shark-vision': createSharkVisionTool(),
      'shark-browser-test': createSharkBrowserTestTool(),
      'shark-evidence-query': createSharkEvidenceQueryTool(),
      'shark-deliver': createSharkDeliverTool(gateEngine),
    },
    config: async (cfg: Record<string, unknown>) => {
      if (!cfg) return;
      if (!cfg.agent) cfg.agent = {};
      const agent = cfg.agent as Record<string, unknown>;
      // MERGE: only set shark, preserve all other agents + any existing shark config
      agent['shark'] = {
        ...(agent['shark'] as Record<string, unknown>),
        name: 'shark',
        description: 'SHARK v5.1.0 — 2-Lobe Planning Brain — Common Sense + Context Management + Frontal PSM. Execute autonomously.',
        instructions: getSharkInstructions(),
        mode: 'primary',
        permission: { task: 'allow', tool: 'allow' },
        color: sharkColor,
        tools: {
          'shark-status': true,
          'shark-gate': true,
          'shark-evidence': true,
          'shark-test-runner': true,
          'shark-checkpoint': true,
          'shark-diagnose': true,
          'shark-health': true,
          'shark-spawn-container': true,
          'shark-run-trident': true,
          'shark-hive-context': true,
          'shark-checkpoint-history': true,
          'shark-audit': true,
          'shark-browser': true,
          'shark-vision': true,
          'shark-browser-test': true,
          'shark-evidence-query': true,
          'shark-deliver': true,
        },
      };
      agent['shark-agent-v5'] = {
        ...(agent['shark-agent-v5'] as Record<string, unknown>),
        name: 'shark-agent-v5',
        description: 'SHARK v5.1.0 — 2-Lobe Planning Brain — Common Sense + Context Management + Frontal PSM. Execute autonomously.',
        instructions: getSharkInstructions(),
        mode: 'primary',
        permission: { task: 'allow', tool: 'allow' },
        color: sharkColor,
        tools: {
          'shark-status': true,
          'shark-gate': true,
          'shark-evidence': true,
          'shark-test-runner': true,
          'shark-checkpoint': true,
          'shark-diagnose': true,
          'shark-health': true,
          'shark-spawn-container': true,
          'shark-run-trident': true,
          'shark-hive-context': true,
          'shark-checkpoint-history': true,
          'shark-audit': true,
          'shark-browser': true,
          'shark-vision': true,
          'shark-browser-test': true,
          'shark-evidence-query': true,
          'shark-deliver': true,
        },
      };
    },
    ...hooks,
  };
}