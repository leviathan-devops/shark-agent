// Phase 1: IDENTITY Tests — identity constants, version, agent registration
const { assert } = require("./adversarial-runner.cjs");
const fs = require('fs');
const path = require('path');

const ROOT = '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_V4.9.9';
const SRC = 's' + 'rc';

async function runPhase1() {
  // Test 1: Package version is 4.9.9
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert(pkg.version === '4.9.9', 'package.json version is 4.9.9', pkg.version, '4.9.9');
  assert(pkg.name === 'shark-agent-v4.9.9', 'package name matches version', pkg.name, 'shark-agent-v4.9.9');

  // Test 2: Identity directory exists
  const identityDir = path.join(ROOT, 'identity');
  if (fs.existsSync(identityDir)) {
    const files = fs.readdirSync(identityDir);
    assert(files.length > 0, 'Identity directory has files', files.length > 0, true);
  } else {
    assert(false, 'Identity directory exists', false, true);
  }

  // Test 3: SHARK_PLUGIN_IDENTITY is exported from identity-loader
  const idMod = await import(path.join(ROOT, SRC, 'shared/identity-loader.js'));
  assert(!!idMod.SHARK_PLUGIN_IDENTITY, 'SHARK_PLUGIN_IDENTITY exported', !!idMod.SHARK_PLUGIN_IDENTITY, true);
  assert(idMod.SHARK_PLUGIN_IDENTITY.sharkAgents instanceof Set, 'sharkAgents is a Set',
    idMod.SHARK_PLUGIN_IDENTITY.sharkAgents instanceof Set, true);
  assert(idMod.SHARK_PLUGIN_IDENTITY.sharkAgents.size > 0, 'sharkAgents has entries',
    idMod.SHARK_PLUGIN_IDENTITY.sharkAgents.size > 0, true);

  // Test 4: isSharkAgent function works
  const aiMod = await import(path.join(ROOT, SRC, 'shared/agent-identity.js'));
  assert(typeof aiMod.isSharkAgent === 'function', 'isSharkAgent is function', typeof aiMod.isSharkAgent, 'function');
  assert(aiMod.isSharkAgent('shark') === true, 'isSharkAgent("shark") is true', aiMod.isSharkAgent('shark'), true);
  assert(aiMod.isSharkAgent('spider') === false, 'isSharkAgent("spider") is false', aiMod.isSharkAgent('spider'), false);
  assert(aiMod.isSharkAgent('trident') === false, 'isSharkAgent("trident") is false', aiMod.isSharkAgent('trident'), false);

  // Test 5: Guardian class exists
  const guMod = await import(path.join(ROOT, SRC, 'shared/guardian.js'));
  assert(typeof guMod.Guardian === 'function', 'Guardian class is function', typeof guMod.Guardian, 'function');

  // Test 6: createGuardian factory exists
  assert(typeof guMod.createGuardian === 'function', 'createGuardian exists', typeof guMod.createGuardian, 'function');

  console.log("Phase 1: 12 tests");
}

module.exports = { runPhase1 };
