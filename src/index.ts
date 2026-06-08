/**
 * Shark Agent v4.9.9 — 3-Lobe Planning Brain Architecture
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
import { createSharkGateTool } from './tools/shark-gate.js';
import { createSharkEvidenceTool } from './tools/shark-evidence.js';
import { createCheckpointTool } from './tools/checkpoint.js';
import { createSharkTestRunnerTool } from './tools/shark-test-runner.js';
import { createFirewallStatusTool } from './tools/firewall-status.js';
import { createFirewallAuditTool } from './tools/firewall-audit-tool.js';
import { createSharkDiagnosticTool, createSharkHealthCheckTool } from './tools/shark-diagnose.js';
import { createSharkSpawnContainerTool } from './tools/shark-spawn-container.js';
import { createSharkRunTridentTool } from './tools/shark-run-trident.js';
import { createHiveContextTool } from './tools/hive-context.js';
import { createCheckpointHistoryTool } from './tools/checkpoint-history.js';
import { createSharkAuditTool } from './tools/shark-audit.js';
import { createSharkBrowserTool } from './tools/shark-browser.js';
import { createSharkVisionTool } from './tools/shark-vision.js';
import { createSharkBrowserTestTool } from './tools/shark-browser-test.js';
import { initializeTripleBrain } from './shark/brains/index.js';
import { getSharkIdentityPrompt, SHARK_PLUGIN_IDENTITY, setPluginDirectory } from './shared/identity-loader.js';
import { getSharkInstructions } from './shared/identity-header.js';
import { synthesizeT1Injectables, getT1TotalSize, setSynthesizerPluginDirectory } from './shared/identity-synthesizer.js';
import { initLogger, logInfo } from './shared/shark-logger.js';
import { EnforcementBrain } from './shark/enforcement-brain/index.js';
import { initializeContextManager } from './shared/context-manager.js';
import { createPlanningBrain, getPlanningBrain } from './shark/planning-brain/index.js';

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

  // Initialize 3-Lobe Enforcement Brain (Karpathy + RGE + SRE)
  const enforcementBrain = new EnforcementBrain({
    basePath: path.join(workspacePath, '.shark'),
    frontalLobe: { enabled: true, enforcement: 'BLOCK' },
    rge: { enabled: true, enforcement: 'BLOCK' },
    sre: { enabled: true, enforcement: 'BLOCK' },
  });

  // Initialize Context Manager — creates project folder + seeds all 9 docs
  const contextDir = initializeContextManager(workspacePath);
  logInfo(`ContextManager: ${contextDir}`);

  // Initialize Planning Brain — 3-lobe intelligence (disabled unless SHARK_PLANNING_BRAIN=enabled)
  const planningBrain = createPlanningBrain({
    basePath: workspacePath,
    contextDir: contextDir,
  });
  if (planningBrain.enabled) {
    logInfo('PlanningBrain: enabled (3-lobe: CommonSense + ContextMgmt + Frontal PSM)');
  } else {
    logInfo('PlanningBrain: disabled (set SHARK_PLANNING_BRAIN=enabled to activate)');
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
    enforcementBrain
  );

  // Start triple-brain concurrency (200ms/200ms/500ms polling loops)
  concurrencyManager.startAll();

  // Initialize file-based logger (writes to .shark/shark-agent.log)
  initLogger(directory || workspacePath);

  // Log hook registration for runtime verification (T2 Bible §Checklist)
  const hookList = Object.keys(hooks).filter(k => k !== 'tool' && k !== 'config');
  const toolList = Object.keys(hooks.tool || {});
  logInfo(`Plugin v4.9.9 initialized: ${hookList.length} hooks, ${toolList.length} tools`);
  logInfo(`Hooks: ${hookList.join(', ')}`);
  logInfo(`Tools: ${toolList.join(', ')}`);
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

  return {
    tool: {
      'shark-status': createSharkStatusTool(stateStore, gm),
      'shark-gate': createSharkGateTool(gm, guardian),
      'shark-evidence': createSharkEvidenceTool(ec),
      'shark-test-runner': createSharkTestRunnerTool(),
      'shark-checkpoint': createCheckpointTool(stateStore, gm),
      'shark-firewall-status': createFirewallStatusTool(),
      'shark-firewall-audit': createFirewallAuditTool(),
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
    },
    config: async (cfg: any) => {
      if (!cfg) return;
      if (!cfg.agent) cfg.agent = {};
      cfg.agent['shark'] = {
        name: 'shark',
        description: 'SHARK v4.9.9 — 3-Lobe Planning Brain — Common Sense + Context Management + Frontal PSM. Execute autonomously.',
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
          'shark-firewall-status': true,
          'shark-firewall-audit': true,
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
        },
      };
    },
    ...hooks,
  };
}