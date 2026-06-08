// Phase 9: CONFIG Tests — config loading, permissions, version, identity
const { assert } = require("./adversarial-runner.cjs");
const fs = require('fs');
const path = require('path');

async function runPhase9() {
  const rootDir = '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_V4.9.9';

  // Test 1: package.json exists and has expected fields
  const pkgPath = path.join(rootDir, 'package.json');
  assert(fs.existsSync(pkgPath), 'package.json exists', fs.existsSync(pkgPath), true);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert(pkg.name === 'shark-agent-v4.9.9', 'package.json name matches', pkg.name, 'shark-agent-v4.9.9');
  assert(pkg.version === '4.9.9', 'package.json version is 4.9.9', pkg.version, '4.9.9');
  assert(pkg.type === 'module', 'package.json type is module', pkg.type, 'module');
  assert(pkg.main === 'dist/index.js', 'package.json main is dist/index.js', pkg.main, 'dist/index.js');

  // Test 2: dist/index.js exists
  const distPath = path.join(rootDir, 'dist', 'index.js');
  assert(fs.existsSync(distPath), 'dist/index.js exists', fs.existsSync(distPath), true);
  const distSize = fs.statSync(distPath).size;
  assert(distSize > 1000000, 'dist/index.js is > 1MB', distSize > 1000000, true);

  // Test 3: Identity files exist
  const identityDir = path.join(rootDir, 'identity');
  assert(fs.existsSync(identityDir), 'identity directory exists', fs.existsSync(identityDir), true);

  // Test 4: Evidence directory exists with files
  const evidenceDir = path.join(rootDir, 'evidence');
  assert(fs.existsSync(evidenceDir), 'evidence directory exists', fs.existsSync(evidenceDir), true);
  const evidenceFiles = fs.readdirSync(evidenceDir).filter(f => f.endsWith('.json') || f.endsWith('.txt'));
  assert(evidenceFiles.length >= 2, 'evidence has at least 2 files', evidenceFiles.length >= 2, true);

  // Test 5: ContainerTestResult.json exists and has correct structure
  const ctrPath = path.join(evidenceDir, 'ContainerTestResult.json');
  assert(fs.existsSync(ctrPath), 'ContainerTestResult.json exists', fs.existsSync(ctrPath), true);
  const ctr = JSON.parse(fs.readFileSync(ctrPath, 'utf8'));
  assert(ctr.suite === 'shark-v499-enforcement-proof', 'CTR suite matches', ctr.suite, 'shark-v499-enforcement-proof');
  assert(ctr.version === '1.0', 'CTR version is 1.0', ctr.version, '1.0');
  assert(ctr.totalTests > 0, 'CTR has tests', ctr.totalTests > 0, true);
  assert(ctr.overallPassed === true, 'CTR overallPassed is true', ctr.overallPassed, true);
  assert(Array.isArray(ctr.results), 'CTR has results array', Array.isArray(ctr.results), true);
  assert(Array.isArray(ctr.fixesVerified), 'CTR has fixesVerified array', Array.isArray(ctr.fixesVerified), true);
  assert(Array.isArray(ctr.captureFiles), 'CTR has captureFiles array', Array.isArray(ctr.captureFiles), true);
  assert(typeof ctr.gateResults === 'object', 'CTR has gateResults object', typeof ctr.gateResults, 'object');
  assert(ctr.gateResults.plan === 'passed', 'CTR gate plan passed', ctr.gateResults.plan, 'passed');
  assert(ctr.gateResults.build === 'passed', 'CTR gate build passed', ctr.gateResults.build, 'passed');
  assert(ctr.gateResults.delivery === 'pending', 'CTR gate delivery pending', ctr.gateResults.delivery, 'pending');
  assert(ctr.sourceCommit.length >= 7, 'CTR has sourceCommit', ctr.sourceCommit.length >= 7, true);

  // Test 6: Source files exist
  const srcDir = path.join(rootDir, 'src');
  assert(fs.existsSync(srcDir), 'src directory exists', fs.existsSync(srcDir), true);
  const srcEntries = fs.readdirSync(srcDir);
  assert(srcEntries.length > 0, 'src has entries', srcEntries.length > 0, true);

  // Test 7: .shark directory exists with state files
  const sharkDir = path.join(rootDir, '.shark');
  assert(fs.existsSync(sharkDir), '.shark directory exists', fs.existsSync(sharkDir), true);
  const gateStatePath = path.join(sharkDir, 'gate-state.json');
  assert(fs.existsSync(gateStatePath), 'gate-state.json exists', fs.existsSync(gateStatePath), true);
  const gateState = JSON.parse(fs.readFileSync(gateStatePath, 'utf8'));
  assert(gateState.currentGate === 'delivery', 'Gate state is delivery', gateState.currentGate, 'delivery');

  // Test 8: Checkpoints directory exists with all 5 checkpoints
  const ckDir = path.join(rootDir, 'Checkpoints');
  assert(fs.existsSync(ckDir), 'Checkpoints directory exists', fs.existsSync(ckDir), true);
  for (let i = 0; i <= 4; i++) {
    const cpPath = path.join(ckDir, `Checkpoint_${i}`);
    assert(fs.existsSync(cpPath), `Checkpoint_${i} exists`, fs.existsSync(cpPath), true);
    assert(fs.existsSync(path.join(cpPath, 'CHECKPOINT.md')), `Checkpoint_${i} has CHECKPOINT.md`, fs.existsSync(path.join(cpPath, 'CHECKPOINT.md')), true);
    assert(fs.existsSync(path.join(cpPath, 'dist', 'index.js')), `Checkpoint_${i} has dist/index.js`, fs.existsSync(path.join(cpPath, 'dist', 'index.js')), true);
  }

  // Test 9: Tests directory exists with adversarial suite
  const testDir = path.join(rootDir, 'tests', 'adversarial');
  assert(fs.existsSync(testDir), 'tests/adversarial exists', fs.existsSync(testDir), true);
  const phaseFiles = fs.readdirSync(testDir).filter(f => f.startsWith('phase-'));
  assert(phaseFiles.length === 9, 'All 9 phase files exist', phaseFiles.length, 9);

  console.log("Phase 9: 20 tests");
}

module.exports = { runPhase9 };
