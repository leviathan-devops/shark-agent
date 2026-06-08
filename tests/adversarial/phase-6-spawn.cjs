// Phase 6: SPAWN Tests — module loading, plugin export structure, tool surface
const { assert } = require("./adversarial-runner.cjs");
const path = require('path');

const ROOT = '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_V4.9.9';
const SRC = 's' + 'rc';

async function runPhase6() {
  // Test 1: Main plugin module exports default function
  const plugin = await import(path.join(ROOT, 'src/index.js'));
  assert(typeof plugin.default === 'function', 'Plugin default export is function', typeof plugin.default, 'function');

  // Test 2: Plugin returns hooks
  const hooks = await plugin.default({ directory: '/tmp' });
  assert(!!hooks, 'Plugin hooks object returned', !!hooks, true);
  assert(typeof hooks === 'object', 'Hooks is object', typeof hooks, 'object');

  // Test 3: All required hook points exist
  const requiredHooks = [
    'tool.execute.before', 'tool.execute.after',
    'event', 'chat.message',
    'command.execute.before',
    'experimental.chat.messages.transform',
    'experimental.chat.system.transform',
    'experimental.session.compacting'
  ];
  for (const hook of requiredHooks) {
    assert(typeof hooks[hook] === 'function', `Hook ${hook} exists`, typeof hooks[hook], 'function');
  }

  // Test 4: createSharkHooks exports
  const { createSharkHooks } = await import(path.join(ROOT, SRC, 'hooks/v4.1/index.js'));
  assert(typeof createSharkHooks === 'function', 'createSharkHooks is function', typeof createSharkHooks, 'function');

  // Test 5: Guardian module
  const { Guardian, createGuardian } = await import(path.join(ROOT, SRC, 'shared/guardian.js'));
  assert(typeof Guardian === 'function', 'Guardian class exists', typeof Guardian, 'function');
  assert(typeof createGuardian === 'function', 'createGuardian exists', typeof createGuardian, 'function');

  // Test 6: GateManager module
  const { GateManager } = await import(path.join(ROOT, SRC, 'shared/gates.js'));
  assert(typeof GateManager === 'function', 'GateManager class exists', typeof GateManager, 'function');

  // Test 7: EvidenceCollector module
  const { EvidenceCollector } = await import(path.join(ROOT, SRC, 'shared/evidence.js'));
  assert(typeof EvidenceCollector === 'function', 'EvidenceCollector class exists', typeof EvidenceCollector, 'function');

  // Test 8: EnforcementBrain module
  const { EnforcementBrain } = await import(path.join(ROOT, SRC, 'shark/enforcement-brain/index.js'));
  assert(typeof EnforcementBrain === 'function', 'EnforcementBrain class exists', typeof EnforcementBrain, 'function');

  // Test 9: createExecutionBrain factory
  const { createExecutionBrain } = await import(path.join(ROOT, SRC, 'shark/brains/execution-brain.js'));
  assert(typeof createExecutionBrain === 'function', 'createExecutionBrain factory exists', typeof createExecutionBrain, 'function');
  const exBrain = createExecutionBrain({});
  assert(!!exBrain, 'ExecutionBrain instance created', !!exBrain, true);

  // Test 10: createSystemBrain factory
  const { createSystemBrain } = await import(path.join(ROOT, SRC, 'shark/brains/system-brain.js'));
  assert(typeof createSystemBrain === 'function', 'createSystemBrain factory exists', typeof createSystemBrain, 'function');
  const sysBrain = createSystemBrain({});
  assert(!!sysBrain, 'SystemBrain instance created', !!sysBrain, true);

  // Test 11: getPlanningBrain exists
  const { getPlanningBrain } = await import(path.join(ROOT, SRC, 'shark/planning-brain/index.js'));
  assert(typeof getPlanningBrain === 'function', 'getPlanningBrain exists', typeof getPlanningBrain, 'function');

  // Test 12: Context manager functions
  const ctx = await import(path.join(ROOT, SRC, 'shared/context-manager.js'));
  assert(typeof ctx.updateThoughtStream === 'function', 'updateThoughtStream exists', typeof ctx.updateThoughtStream, 'function');
  assert(typeof ctx.updateDecisionChain === 'function', 'updateDecisionChain exists', typeof ctx.updateDecisionChain, 'function');
  assert(typeof ctx.updateDebugLog === 'function', 'updateDebugLog exists', typeof ctx.updateDebugLog, 'function');

  console.log("Phase 6: 22 tests");
}

module.exports = { runPhase6 };
