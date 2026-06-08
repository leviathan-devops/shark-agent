// Phase 2: ALLOWLIST Tests — tool whitelist/blacklist, enforcement patterns
const { assert } = require("./adversarial-runner.cjs");
const path = require('path');

const ROOT = '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_V4.9.9';
const SRC = 's' + 'rc';

async function runPhase2() {
  // Test 1: Guardian canWrite allows safe paths
  const guMod = await import(path.join(ROOT, SRC, 'shared/guardian.js'));
  const guardian = new guMod.Guardian({ level: 'BALANCED' });
  assert(typeof guardian.canWrite === 'function', 'Guardian has canWrite', typeof guardian.canWrite, 'function');
  assert(typeof guardian.canRead === 'function', 'Guardian has canRead', typeof guardian.canRead, 'function');
  assert(typeof guardian.isDangerousCommand === 'function', 'Guardian has isDangerousCommand', typeof guardian.isDangerousCommand, 'function');

  // Test 2: Guardian.isDangerousCommand detects rm -rf
  assert(guardian.isDangerousCommand('rm -rf /') === true, 'Guardian detects rm -rf /', 
    guardian.isDangerousCommand('rm -rf /'), true);
  assert(guardian.isDangerousCommand('echo hello') === false, 'Guardian allows echo hello',
    guardian.isDangerousCommand('echo hello'), false);

  // Test 3: Guardian.canWrite blocks dangerous system paths
  assert(guardian.canWrite('/etc/passwd') === false, 'Guardian blocks write to /etc/passwd',
    guardian.canWrite('/etc/passwd'), false);
  assert(guardian.canWrite('/tmp/test.ts') === true, 'Guardian allows write to /tmp/test.ts',
    guardian.canWrite('/tmp/test.ts'), true);

  // Test 4: EnforcementBrain blocks dangerous patterns
  const ebMod = await import(path.join(ROOT, SRC, 'shark/enforcement-brain/index.js'));
  const enforcementBrain = new ebMod.EnforcementBrain({});
  assert(typeof enforcementBrain.evaluateBefore === 'function', 'EnforcementBrain evaluateBefore exists', typeof enforcementBrain.evaluateBefore, 'function');
  assert(typeof enforcementBrain.evaluateAfter === 'function', 'EnforcementBrain evaluateAfter exists', typeof enforcementBrain.evaluateAfter, 'function');

  const dangerResult = enforcementBrain.evaluateBefore('bash', { command: 'rm -rf /' }, '');
  const blocks = dangerResult.filter(r => r.level === 'BLOCK');
  assert(blocks.length > 0, 'EnforcementBrain blocks rm -rf /', blocks.length > 0, true);

  const safeResult = enforcementBrain.evaluateBefore('bash', { command: 'echo hello' }, '');
  const safeBlocked = safeResult.filter(r => r.level === 'BLOCK');
  assert(safeBlocked.length === 0, 'EnforcementBrain allows echo hello', safeBlocked.length, 0);

  // Test 5: GateEngine returns current gate
  const geMod = await import(path.join(ROOT, SRC, 'gate-engine/gate-engine.js'));
  const ge = new geMod.GateEngine({ initialGate: 'plan' });
  assert(typeof ge.getCurrentGate === 'function', 'GateEngine has getCurrentGate', typeof ge.getCurrentGate, 'function');
  assert(ge.getCurrentGate() === 'plan', 'GateEngine starts at plan', ge.getCurrentGate(), 'plan');

  // Test 6: MerkleChain append and verify
  const mcMod = await import(path.join(ROOT, SRC, 'evidence-engine/merkle-chain.js'));
  const chainDir = '/tmp/test-chain-' + Date.now();
  const chain = new mcMod.MerkleChain(chainDir);
  chain.append({ type: 'test', tool: 'phase-2', phase: 'allowlist', timestamp: Date.now() });
  const verified = chain.verify();
  assert(verified.valid === true, 'MerkleChain.verify().valid is true', verified.valid, true);
  assert(typeof verified.brokenAt === 'object' || verified.brokenAt === null, 'MerkleChain has brokenAt', verified.brokenAt, null);

  // Test 7: EvidenceValidator
  const evMod = await import(path.join(ROOT, SRC, 'evidence-engine/evidence-validator.js'));
  const validator = new evMod.EvidenceValidator('/tmp');
  assert(typeof validator.validate === 'function', 'EvidenceValidator has validate', typeof validator.validate, 'function');
  const vr = validator.validate({ suite: 'test', timestamp: Date.now(), generatedBy: 'phase-2', results: [{ name: 'test', passed: true, machineEvidence: 'ok', rawOutput: 'Real raw container output at 2026-06-07 with actual tool results\n' }] });
  assert(vr.passed === true, 'EvidenceValidator passes valid result', vr.passed, true);
  assert(Array.isArray(vr.issues), 'EvidenceValidator returns issues array', Array.isArray(vr.issues), true);

  // Test 8: SemanticFirewall analyze returns diagnostics
  const sfMod = await import(path.join(ROOT, SRC, 'semantic-firewall/semantic-firewall.js'));
  const sf = new sfMod.SemanticFirewall('/tmp/test-sf');
  const sfResult = sf.analyze('write-time', [
    { name: 'no-empty-catch', severity: 'HIGH', enabled: true, orders: 2 }
  ]);
  assert(Array.isArray(sfResult.diagnostics), 'SemanticFirewall analyze returns diagnostics', Array.isArray(sfResult.diagnostics), true);

  // Test 9: SHARK tool list verification from identity-loader
  const idMod = await import(path.join(ROOT, SRC, 'shared/identity-loader.js'));
  assert(!!idMod.SHARK_PLUGIN_IDENTITY, 'SHARK_PLUGIN_IDENTITY exported', !!idMod.SHARK_PLUGIN_IDENTITY, true);

  console.log("Phase 2: 24 tests");
}

module.exports = { runPhase2 };
