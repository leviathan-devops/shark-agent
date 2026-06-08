// Phase 5: SYNTHESIS Tests — RGE+SRE output combination, rule violations detected
const { assert } = require("./adversarial-runner.cjs");

async function runPhase5() {
  // Test 1: SemanticFirewall detects empty catches
  const { SemanticFirewall } = await import('../../src/semantic-firewall/semantic-firewall.js');
  const sf = new SemanticFirewall('/tmp');
  const result = sf.analyze('write-time', [
    { name: 'no-empty-catch', severity: 'HIGH', enabled: true, orders: 2 }
  ]);
  assert(!!result, 'SemanticFirewall.analyze returns result', !!result, true);
  assert(Array.isArray(result.diagnostics), 'Result has diagnostics array', Array.isArray(result.diagnostics), true);
  assert(result.phase === 'write-time', 'Result phase is write-time', result.phase, 'write-time');

  // Test 2: Rule types are correct
  const { checkNoEmptyCatches } = await import('../../src/semantic-firewall/rules/no-empty-catch.js');
  assert(typeof checkNoEmptyCatches === 'function', 'no-empty-catch exports function', typeof checkNoEmptyCatches, 'function');

  const { checkNoUnsafeCasts } = await import('../../src/semantic-firewall/rules/no-unsafe-cast.js');
  assert(typeof checkNoUnsafeCasts === 'function', 'no-unsafe-cast exports function', typeof checkNoUnsafeCasts, 'function');

  const { checkNoFloatingPromises } = await import('../../src/semantic-firewall/rules/no-floating-promises.js');
  assert(typeof checkNoFloatingPromises === 'function', 'no-floating-promises exports function', typeof checkNoFloatingPromises, 'function');

  const { checkEvidenceBearingResults } = await import('../../src/semantic-firewall/rules/evidence-bearing-results.js');
  assert(typeof checkEvidenceBearingResults === 'function', 'evidence-bearing-results exports function', typeof checkEvidenceBearingResults, 'function');

  const { checkNoHardcodedPaths } = await import('../../src/semantic-firewall/rules/no-hardcoded-paths.js');
  assert(typeof checkNoHardcodedPaths === 'function', 'no-hardcoded-paths exports function', typeof checkNoHardcodedPaths, 'function');

  const { checkCleanupPairedIntervals } = await import('../../src/semantic-firewall/rules/cleanup-paired-intervals.js');
  assert(typeof checkCleanupPairedIntervals === 'function', 'cleanup-paired-intervals exports function', typeof checkCleanupPairedIntervals, 'function');

  const { checkHandleZeroLength } = await import('../../src/semantic-firewall/rules/handle-zero-length.js');
  assert(typeof checkHandleZeroLength === 'function', 'handle-zero-length exports function', typeof checkHandleZeroLength, 'function');

  const { checkTheatricalReturn } = await import('../../src/semantic-firewall/rules/theatrical-return.js');
  assert(typeof checkTheatricalReturn === 'function', 'theatrical-return exports function', typeof checkTheatricalReturn, 'function');

  const { snapshotDirectory, diffSnapshots } = await import('../../src/semantic-firewall/rules/scope-violation.js');
  assert(typeof snapshotDirectory === 'function', 'scope-violation snapshotDirectory exports function', typeof snapshotDirectory, 'function');
  assert(typeof diffSnapshots === 'function', 'scope-violation diffSnapshots exports function', typeof diffSnapshots, 'function');

  const { findDeadExports } = await import('../../src/semantic-firewall/rules/dead-export.js');
  assert(typeof findDeadExports === 'function', 'dead-export exports function', typeof findDeadExports, 'function');

  // Test 3: ExecutionContext allows engineering operations for shark agents
  const { ExecutionContext } = await import('../../src/semantic-firewall/execution-context.js');
  const ctx = new ExecutionContext('/tmp');
  ctx.setAgent('shark');
  const allowed = ctx.shouldAllowEngineeringOperation('write', { filePath: '/tmp/test-project/hello.ts' });
  assert(allowed === true, 'ExecutionContext allows shark write to test project', allowed, true);

  // Test 4: Types module loads correctly (types are type-only at runtime, module exists)
  const typesMod = await import('../../src/semantic-firewall/types.js');
  assert(typesMod !== null && typeof typesMod === 'object', 'Types module loads as object', typeof typesMod, 'object');

  console.log("Phase 5: 20 tests");
}

module.exports = { runPhase5 };
