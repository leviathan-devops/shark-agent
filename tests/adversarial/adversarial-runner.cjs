// Shared adversarial test utilities
let passed = 0, failed = 0;
let assertions = [];

function assert(condition, name, actual, expected) {
  if (condition) {
    passed++;
    assertions.push({ name, passed: true });
  } else {
    failed++;
    assertions.push({ name, passed: false, actual, expected });
    console.error(`FAIL: ${name} | got: ${JSON.stringify(actual)} | expected: ${JSON.stringify(expected)}`);
  }
}

function summary() {
  console.log(`PASSED: ${passed}, FAILED: ${failed}, TOTAL: ${passed + failed}`);
  return failed === 0;
}

function reset() {
  passed = 0;
  failed = 0;
  assertions = [];
}

function getResults() {
  return { passed, failed, total: passed + failed, assertions };
}

module.exports = { assert, summary, reset, getResults };
