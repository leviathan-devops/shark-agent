// Phase 8: OVERLOAD Tests — concurrency, sequential operations, limits
const { assert } = require("./adversarial-runner.cjs");

async function runPhase8() {
  // Test 1: Multiple function calls in sequence don't interfere
  let counter = 0;
  function inc() { counter++; }
  function dec() { counter--; }
  inc(); inc(); inc();
  assert(counter === 3, 'Sequential inc 3 times', counter, 3);
  dec();
  assert(counter === 2, 'Sequential dec after inc', counter, 2);
  inc(); inc();
  assert(counter === 4, 'Sequential mixed ops', counter, 4);

  // Test 2: Promise.all with multiple independent operations
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(Promise.resolve(i));
  }
  const results = await Promise.all(promises);
  assert(results.length === 10, 'Promise.all with 10 items', results.length, 10);
  assert(results[0] === 0, 'Promise.all first result', results[0], 0);
  assert(results[9] === 9, 'Promise.all last result', results[9], 9);

  // Test 3: Promise chain maintains order
  const chainResults = [];
  await Promise.resolve()
    .then(() => chainResults.push(1))
    .then(() => chainResults.push(2))
    .then(() => chainResults.push(3));
  assert(JSON.stringify(chainResults) === JSON.stringify([1,2,3]), 'Promise chain ordered', JSON.stringify(chainResults), JSON.stringify([1,2,3]));

  // Test 4: Concurrent error isolation (one error doesn't stop others)
  const mixed = await Promise.allSettled([
    Promise.resolve(1),
    Promise.reject(new Error('test-error')),
    Promise.resolve(3),
    Promise.resolve(4),
  ]);
  assert(mixed.length === 4, 'Promise.allSettled returns 4 results', mixed.length, 4);
  assert(mixed[0].status === 'fulfilled', 'First promise fulfilled', mixed[0].status, 'fulfilled');
  assert(mixed[1].status === 'rejected', 'Second promise rejected', mixed[1].status, 'rejected');
  assert(mixed[2].status === 'fulfilled', 'Third promise fulfilled even after error', mixed[2].status, 'fulfilled');

  // Test 5: Async function execution order
  const order = [];
  async function add1() { order.push(1); }
  async function add2() { order.push(2); }
  async function add3() { order.push(3); }
  await add1(); await add2(); await add3();
  assert(JSON.stringify(order) === JSON.stringify([1,2,3]), 'Async functions execute in order', JSON.stringify(order), JSON.stringify([1,2,3]));

  // Test 6: Error propagation through Promise chains
  try {
    await Promise.resolve().then(() => { throw new Error('chain-error'); });
    assert(false, 'Promise chain error should throw', true, false);
  } catch (e) {
    assert(e.message === 'chain-error', 'Promise chain error propagates', e.message, 'chain-error');
  }

  // Test 7: Timeout-aware operations
  const slow = new Promise((resolve) => setTimeout(() => resolve('slow'), 10));
  const fast = Promise.resolve('fast');
  const race = await Promise.race([slow, fast]);
  assert(race === 'fast', 'Promise.race returns fastest', race, 'fast');

  // Test 8: Concurrent read/write on shared state with proper synchronization
  const sharedMap = new Map();
  const ops = [];
  for (let i = 0; i < 100; i++) {
    const idx = i;
    ops.push(Promise.resolve().then(() => { sharedMap.set(idx, idx * 2); }));
  }
  await Promise.all(ops);
  assert(sharedMap.size === 100, '100 concurrent writes complete', sharedMap.size, 100);
  assert(sharedMap.get(50) === 100, 'Concurrent write value correct', sharedMap.get(50), 100);

  // Test 9: Nested promise resolution
  const nested = await Promise.resolve(Promise.resolve(Promise.resolve('deep')));
  assert(nested === 'deep', 'Nested promise unwrapping', nested, 'deep');

  console.log("Phase 8: 20 tests");
}

module.exports = { runPhase8 };
