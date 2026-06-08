// Run all adversarial phases 1-9
const path = require('path');
const { reset, summary, getResults } = require('./adversarial-runner.cjs');

const ROOT = __dirname;
const phases = [
  'phase-1-identity',
  'phase-2-allowlist',
  'phase-3-isolation',
  'phase-4-compaction',
  'phase-5-synthesis',
  'phase-6-spawn',
  'phase-7-context',
  'phase-8-overload',
  'phase-9-config',
];

async function runAll() {
  reset();
  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;

  for (const phase of phases) {
    console.log(`\n=== ${phase} ===`);
    try {
      const mod = require(path.join(ROOT, phase + '.cjs'));
      reset();
      const phaseNum = phase.match(/\d+/)[0];
      await mod['runPhase' + phaseNum]();
      const phaseResult = getResults();
      summary();
      totalPassed += phaseResult.passed || 0;
      totalFailed += phaseResult.failed || 0;
      totalTests += (phaseResult.passed || 0) + (phaseResult.failed || 0);
    } catch (e) {
      console.error(`ERROR in ${phase}:`, e.message);
      totalFailed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`MULTI-PHASE SUMMARY`);
  console.log(`TOTAL: ${totalTests}, PASSED: ${totalPassed}, FAILED: ${totalFailed}`);
  process.exit(totalFailed > 0 ? 1 : 0);
}

runAll();
