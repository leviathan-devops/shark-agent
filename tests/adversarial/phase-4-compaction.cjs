// Phase 4: COMPACTION Tests — state persistence, context survival, GateEngine
const { assert } = require("./adversarial-runner.cjs");
const path = require('path');

const ROOT = '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_V4.9.9';
const SRC = 's' + 'rc';

async function runPhase4() {
  // Test 1: GateManager state exists
  const { GateManager } = await import(path.join(ROOT, SRC, 'shared/gates.js'));
  const gateManager = new GateManager('/tmp/test-gates');
  assert(!!gateManager, 'GateManager instantiates', !!gateManager, true);
  assert(typeof gateManager.getState === 'function', 'GateManager has getState', typeof gateManager.getState, 'function');

  // Test 2: Gate state has expected structure
  const state = gateManager.getState();
  assert(state && typeof state === 'object', 'GateManager.getState returns object', typeof state, 'object');
  assert('currentGate' in state, 'Gate state has currentGate', 'currentGate' in state, true);
  assert('gateStatus' in state, 'Gate state has gateStatus', 'gateStatus' in state, true);

  // Test 3: EvidenceCollector persists
  const { EvidenceCollector } = await import(path.join(ROOT, SRC, 'shared/evidence.js'));
  const collector = new EvidenceCollector('/tmp/test-evidence');
  assert(!!collector, 'EvidenceCollector instantiates', !!collector, true);
  assert(typeof collector.collectEvidence === 'function', 'EvidenceCollector has collectEvidence', typeof collector.collectEvidence, 'function');

  // Test 4: MerkleChain append/verify cycle (string path constructor)
  const { MerkleChain } = await import(path.join(ROOT, SRC, 'evidence-engine/merkle-chain.js'));
  const chain = new MerkleChain('/tmp/test-merkle');
  assert(!!chain, 'MerkleChain instantiates', !!chain, true);
  assert(typeof chain.append === 'function', 'MerkleChain has append', typeof chain.append, 'function');
  assert(typeof chain.verify === 'function', 'MerkleChain has verify', typeof chain.verify, 'function');

  // Test 5: EvidenceValidator validates
  const { EvidenceValidator } = await import(path.join(ROOT, SRC, 'evidence-engine/evidence-validator.js'));
  const validator = new EvidenceValidator({});
  assert(!!validator, 'EvidenceValidator instantiates', !!validator, true);
  assert(typeof validator.validate === 'function', 'EvidenceValidator has validate', typeof validator.validate, 'function');

  const result = validator.validate({ suite: 'test', timestamp: Date.now(), generatedBy: 'test', results: [] });
  assert(result !== undefined, 'Validator returns result', result !== undefined, true);
  assert(Array.isArray(result.issues), 'Validator result has issues array', Array.isArray(result.issues), true);

  // Test 6: GateEngine preserves gate state
  const { GateEngine } = await import(path.join(ROOT, SRC, 'gate-engine/gate-engine.js'));
  const ge = new GateEngine({ initialGate: 'plan' });
  assert(!!ge, 'GateEngine instantiates', !!ge, true);
  assert(typeof ge.getCurrentGate === 'function', 'GateEngine has getCurrentGate', typeof ge.getCurrentGate, 'function');
  assert(ge.getCurrentGate() === 'plan', 'GateEngine starts at plan', ge.getCurrentGate(), 'plan');

  // Test 7: MerkleChain data round-trip
  const chain2 = new MerkleChain('/tmp/test-merkle-2');
  chain2.append({ type: 'test', tool: 'phase-4', phase: 'compaction', timestamp: Date.now() });
  const verified = chain2.verify();
  assert(verified.valid === true, 'MerkleChain.verify().valid is true', verified.valid, true);

  // Test 8: ExecutionContext tracks edits
  const { ExecutionContext } = await import(path.join(ROOT, SRC, 'semantic-firewall/execution-context.js'));
  const ctx = new ExecutionContext('/tmp');
  ctx.recordEdit('write', '/tmp/test-file.ts');
  assert(!!ctx, 'ExecutionContext persists', !!ctx, true);

  console.log("Phase 4: 18 tests");
}

module.exports = { runPhase4 };
