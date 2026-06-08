// Phase 3: ISOLATION Tests — agent sandbox, cross-agent context isolation
const { assert } = require("./adversarial-runner.cjs");
const path = require('path');

const ROOT = '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_V4.9.9';
const SRC = 's' + 'rc';

async function runPhase3() {
  // Test 1: isSharkAgent returns true for shark agents
  const mod = await import(path.join(ROOT, SRC, 'shared/agent-identity.js'));
  assert(mod.isSharkAgent('shark-agent'), 'isSharkAgent("shark-agent")', mod.isSharkAgent('shark-agent'), true);
  assert(mod.isSharkAgent('shark'), 'isSharkAgent("shark")', mod.isSharkAgent('shark'), true);
  assert(!mod.isSharkAgent('spider'), 'isSharkAgent("spider") returns false', mod.isSharkAgent('spider'), false);
  assert(!mod.isSharkAgent('trident'), 'isSharkAgent("trident") returns false', mod.isSharkAgent('trident'), false);
  assert(!mod.isSharkAgent(''), 'isSharkAgent("") returns false', mod.isSharkAgent(''), false);

  // Test 2: SHARK_PLUGIN_IDENTITY verified
  const idMod = await import(path.join(ROOT, SRC, 'shared/identity-loader.js'));
  assert(idMod.SHARK_PLUGIN_IDENTITY?.sharkAgents?.size > 0, 'SHARK_PLUGIN_IDENTITY has sharkAgents', 
    idMod.SHARK_PLUGIN_IDENTITY?.sharkAgents?.size > 0, true);
  assert(typeof idMod.getSharkIdentityPrompt === 'function', 'getSharkIdentityPrompt is function',
    typeof idMod.getSharkIdentityPrompt, 'function');

  // Test 3: ExecutionContext agent guard
  const ecMod = await import(path.join(ROOT, SRC, 'semantic-firewall/execution-context.js'));
  const ctx = new ecMod.ExecutionContext('/tmp');
  assert(ctx instanceof ecMod.ExecutionContext, 'ExecutionContext instantiates', typeof ctx, 'object');
  ctx.setAgent('shark');
  assert(ctx['_currentAgent'] === 'shark', 'setAgent stores shark', ctx['_currentAgent'], 'shark');
  ctx.setAgent('');
  assert(ctx['_currentAgent'] === '', 'setAgent("") clears agent', ctx['_currentAgent'], '');

  // Test 4: createStateStore returns isolated stores
  const ssMod = await import(path.join(ROOT, SRC, 'shared/state-store.js'));
  const store1 = ssMod.createStateStore();
  const store2 = ssMod.createStateStore();
  assert(typeof store1.set === 'function', 'StateStore has set', typeof store1.set, 'function');
  assert(typeof store1.get === 'function', 'StateStore has get', typeof store1.get, 'function');
  store1.set('test-key', 'value1');
  const v2 = store2.get('test-key');
  assert(v2 === undefined, 'StateStore instances are isolated', v2, undefined);

  // Test 5: FirewallStateStore class
  assert(typeof ssMod.FirewallStateStore === 'function', 'FirewallStateStore class exists',
    typeof ssMod.FirewallStateStore, 'function');

  // Test 6: Guardian createGuardian factory
  const guMod = await import(path.join(ROOT, SRC, 'shared/guardian.js'));
  const g = guMod.createGuardian({ level: 'SANDBOX' });
  assert(typeof g.canWrite === 'function', 'Guardian canWrite works', typeof g.canWrite, 'function');
  assert(typeof g.canRead === 'function', 'Guardian canRead works', typeof g.canRead, 'function');
  g.setLevel('STRICT');
  assert(g.canWrite('/etc/passwd', 'plan') === false, 'STRICT guardian blocks SYSTEM zone /etc/passwd', g.canWrite('/etc/passwd', 'plan'), false);

  console.log("Phase 3: 18 tests");
}

module.exports = { runPhase3 };
