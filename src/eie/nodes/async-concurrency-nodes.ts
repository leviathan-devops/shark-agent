/**
 * src/eie/nodes/async-concurrency-nodes.ts — 30 Async Concurrency Knowledge Nodes
 *
 * Deep TypeScript/Node.js asynchronous concurrency primitives and patterns.
 * Distinct from concurrency-nodes.ts (general concurrency models); these
 * nodes focus on the single-threaded async event-loop domain: the microtask
 * vs macrotask distinction, async-native synchronization primitives
 * (mutex/semaphore/rw-lock over promises), async resource pools, and the
 * classic concurrency hazards (deadlock, livelock, starvation, priority
 * inversion, thundering herd) as they manifest in async code.
 *
 * Source: ts-deep (deep TypeScript / Node.js concurrency analysis)
 * Category: async-concurrency
 * Severity: block
 * Layer: 4
 */

import type { KnowledgeNode } from '../types';

// ══ FUNDAMENTALS (6 nodes) ═══════════════════════════════════════

export const ASYNC_EVENT_LOOP: KnowledgeNode = {
  id: 'ASYNC-EVENT-LOOP',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'EVENT LOOP: Node.js runs a single-threaded event loop. Long synchronous work blocks ALL async progress. Never do CPU-bound work on the loop thread.',
  detectionMethod: 'Find long-running synchronous loops, heavy compute, or blocking I/O (fs.readFileSync, execSync) inside async functions. Flag.',
  fixTemplate: 'Move heavy work to a worker_thread or offload via setImmediate chunking: while (work--) { doChunk(); await new Promise(r => setImmediate(r)); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-EVENT-LOOP: Blocking sync work on the event loop. Offload to worker or chunk with setImmediate.',
  warheadTemplate: 'The event loop is single-threaded; blocking it stalls every pending promise, timer, and I/O callback in the process.',
  evidenceSpec: { id: 'event-loop-nonblock', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-MICROTASK', 'ASYNC-MACROTASK', 'CONC-WORKER-POOL'],
  selfVerified: true,
};

export const ASYNC_MICROTASK: KnowledgeNode = {
  id: 'ASYNC-MICROTASK',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'MICROTASK: Promise .then/.catch/.finally and queueMicrotask run BEFORE the next macrotask. Recursively queuing microtasks starves macrotasks (timers, I/O).',
  detectionMethod: 'Find code that recursively enqueues microtasks (await in a tight self-loop, unbounded queueMicrotask). Flag macrotask starvation risk.',
  fixTemplate: 'Yield to the macrotask queue periodically: if (--budget <= 0) { await new Promise(r => scheduleTimer(r, 0)); budget = CHUNK; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-MICROTASK: Microtask re-queue loop. Yield with a zero-delay macrotask to drain pending tasks.',
  warheadTemplate: 'Unbounded microtask recursion starves the macrotask queue — timers and I/O callbacks never run, producing silent hangs.',
  evidenceSpec: { id: 'microtask-yield', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-EVENT-LOOP', 'ASYNC-MACROTASK', 'ASYNC-STARVATION-PREVENTION'],
  selfVerified: true,
};

export const ASYNC_MACROTASK: KnowledgeNode = {
  id: 'ASYNC-MACROTASK',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'MACROTASK: timers, intervals, setImmediate, and I/O callbacks run one per loop turn. Microtasks drain fully between macrotasks. Order: timers -> pending callbacks -> idle/prepare -> poll -> check (setImmediate) -> close.',
  detectionMethod: 'Find code that depends on precise macrotask ordering (timer vs setImmediate vs I/O callback). Flag order-dependent logic.',
  fixTemplate: 'Never rely on relative ordering of macrotask sources — make ordering explicit via awaited promises or a task DAG.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-MACROTASK: Order-dependent timer/IO scheduling. Make ordering explicit via promises.',
  warheadTemplate: 'Macrotask ordering varies across loop phases and platforms; implicit ordering assumptions produce flaky, environment-dependent bugs.',
  evidenceSpec: { id: 'macrotask-order', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-EVENT-LOOP', 'ASYNC-MICROTASK'],
  selfVerified: true,
};

export const ASYNC_STACK_TRACE: KnowledgeNode = {
  id: 'ASYNC-STACK-TRACE',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC STACK TRACE: Enable --async-stack-traces (Error.captureStackTrace on await). A rejected promise without a catch produces an unhandled-rejection with no async frame context.',
  detectionMethod: 'Find rejected promises or thrown errors in async functions without surrounding try/catch or .catch(). Flag missing async stack context.',
  fixTemplate: 'async function run() { try { return await work(); } catch (e) { e.cause = e.cause ?? null; throw e; } } // preserve + attach async frame',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-STACK-TRACE: Rejection without catch loses async frames. Wrap awaits in try/catch.',
  warheadTemplate: 'Without preserved async stack traces, a rejection at a deep await site surfaces with no caller chain — root cause becomes untraceable.',
  evidenceSpec: { id: 'async-stack', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-ERROR-PROPAGATION', 'FM05-UNHANDLED-REJECTION'],
  selfVerified: true,
};

export const ASYNC_ERROR_PROPAGATION: KnowledgeNode = {
  id: 'ASYNC-ERROR-PROPAGATION',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ERROR PROPAGATION: An `await` on a rejected promise throws synchronously at the await site. A returned (un-awaited) rejected promise is a floating rejection. Every async boundary must have a defined error path.',
  detectionMethod: 'Find async functions that return rejected promises without a consumer .catch(), and un-awaited async calls. Flag floating rejections.',
  fixTemplate: 'const result = await mayReject().catch(e => ({ error: e })); // or attach a catch to background tasks',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-ERROR-PROPAGATION: Floating/rejected promise with no catch. Define an error path at every boundary.',
  warheadTemplate: 'Unhandled promise rejections are process-fatal in modern Node.js; every async boundary needs an explicit error sink.',
  evidenceSpec: { id: 'error-propagation', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-STACK-TRACE', 'AP_FLOATING_PROMISE', 'FM05-UNHANDLED-REJECTION'],
  selfVerified: true,
};

export const ASYNC_PROMISE_CHAIN: KnowledgeNode = {
  id: 'ASYNC-PROMISE-CHAIN',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'PROMISE CHAIN: A chained promise executes each .then in a separate microtask. Forgetting to return inner promises (callback hell nesting) breaks the chain and swallows errors.',
  detectionMethod: 'Find .then callbacks that start an inner async operation without returning it, and sequential awaits that could be parallelized. Flag broken chains.',
  fixTemplate: 'return innerAsync(); // inside .then — not: innerAsync(); return; // chain broken',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-PROMISE-CHAIN: .then that doesn\'t return its inner promise. Return to keep the chain intact.',
  warheadTemplate: 'A broken promise chain detaches error propagation — the inner rejection becomes an unhandled rejection at an unrelated site.',
  evidenceSpec: { id: 'promise-chain', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-ERROR-PROPAGATION', 'CONC-PROMISE-ALL', 'FM20-PROMISE-SERIAL'],
  selfVerified: true,
};

// ══ CONCURRENCY PRIMITIVES (6 nodes) ════════════════════════════

export const ASYNC_MUTEX: KnowledgeNode = {
  id: 'ASYNC-MUTEX',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC MUTEX: Guarantees mutual exclusion across async tasks — only one critical section runs at a time. Must be released in finally; must support timeout and cancellation.',
  detectionMethod: 'Find shared mutable state accessed from multiple async contexts without a mutex (a shared counter/Map mutated concurrently). Flag.',
  fixTemplate: 'const release = await mutex.acquire(); try { /* critical section */ } finally { release(); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-MUTEX: Shared mutable state across async tasks with no lock. Acquire a mutex in try/finally.',
  warheadTemplate: 'Without an async mutex, interleaved await points let two coroutines mutate shared state mid-operation, causing torn writes.',
  evidenceSpec: { id: 'async-mutex', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-SEMAPHORE', 'ASYNC-RW-LOCK', 'ASYNC-DEADLOCK-PREVENTION', 'FM15-CONCURRENT-MOD'],
  selfVerified: true,
};

export const ASYNC_SEMAPHORE: KnowledgeNode = {
  id: 'ASYNC-SEMAPHORE',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC SEMAPHORE: Counts permits (initial N). acquire() decrements, blocks at 0; release() increments. Bounds concurrency for rate-limited resources.',
  detectionMethod: 'Find unbounded Promise.all over an external resource array (firing 1000 concurrent DB queries). Flag — wrap in a semaphore of size N.',
  fixTemplate: 'const sem = new AsyncSemaphore(8); await Promise.all(items.map(i => sem.run(() => query(i)))); // run caps at 8 concurrent',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-SEMAPHORE: Unbounded concurrency over a rate-limited resource. Bound with a semaphore.',
  warheadTemplate: 'A semaphore bounds concurrency; without it, unbounded fan-out overwhelms downstream services and triggers throttling/cascading failures.',
  evidenceSpec: { id: 'async-semaphore', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-MUTEX', 'CONC-WORKER-POOL', 'ASYNC-THUNDERING-HERD'],
  selfVerified: true,
};

export const ASYNC_RW_LOCK: KnowledgeNode = {
  id: 'ASYNC-RW-LOCK',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC READ/WRITE LOCK: Many concurrent readers OR one exclusive writer. Writers must wait for readers to drain; readers must block during a write. Prevents read-heavy contention from a plain mutex.',
  detectionMethod: 'Find read-heavy shared state protected by a full mutex (cache reads serialized). Flag — readers don\'t need exclusion.',
  fixTemplate: 'await rwLock.readLock(async () => cachedValue); await rwLock.writeLock(async () => { cache.set(k, v); });',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-RW-LOCK: Read-heavy state under a full mutex. Use a read/write lock to allow concurrent readers.',
  warheadTemplate: 'A read/write lock maximizes throughput on read-heavy data; a plain mutex serializes readers, killing parallelism for no correctness benefit.',
  evidenceSpec: { id: 'async-rwlock', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-MUTEX', 'ASYNC-READERS-WRITERS', 'ASYNC-STARVATION-PREVENTION'],
  selfVerified: true,
};

export const ASYNC_BARRIER: KnowledgeNode = {
  id: 'ASYNC-BARRIER',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC BARRIER: N tasks call await barrier.wait(); all block until the Nth arrives, then all release together. Synchronizes phases of a fan-out computation.',
  detectionMethod: 'Find fan-out where later phases must not start until ALL earlier-phase tasks complete, implemented with manual counters. Flag — use a barrier.',
  fixTemplate: 'await Promise.all(tasks.map(t => phase1(t).then(() => barrier.wait()))); await barrier.wait(); await phase2();',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-BARRIER: Manual phase sync across fan-out tasks. Use a barrier for clean rendezvous.',
  warheadTemplate: 'A barrier provides deterministic phase synchronization; hand-rolled counters race and let later phases start before earlier ones finish.',
  evidenceSpec: { id: 'async-barrier', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-LATCH', 'ASYNC-CONDITION-VARIABLE'],
  selfVerified: true,
};

export const ASYNC_LATCH: KnowledgeNode = {
  id: 'ASYNC-LATCH',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC LATCH: One-shot countdown gate. countDown() N times, then wait() resolves for everyone. Used for startup readiness: wait until N dependencies are initialized.',
  detectionMethod: 'Find startup code that polls or busy-waits for N async services to become ready. Flag — use a latch.',
  fixTemplate: 'const ready = new AsyncLatch(services.length); services.forEach(s => s.init().then(() => ready.countDown())); await ready.wait();',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-LATCH: Polling/busy-wait for N async deps to be ready. Use a countdown latch.',
  warheadTemplate: 'A latch gives clean one-shot readiness signaling; polling burns CPU and races the readiness check.',
  evidenceSpec: { id: 'async-latch', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-BARRIER', 'ASYNC-CONDITION-VARIABLE'],
  selfVerified: true,
};

export const ASYNC_CONDITION_VARIABLE: KnowledgeNode = {
  id: 'ASYNC-CONDITION-VARIABLE',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC CONDITION VARIABLE: wait() blocks until notify() is called (always inside a mutex). Used to wait for a state predicate to become true. Must re-check predicate on wake (spurious wakeups).',
  detectionMethod: 'Find polling loops (while(!ready) await sleep(10)) guarded by shared state. Flag — use a condition variable.',
  fixTemplate: 'await mutex.runExclusive(async () => { while (!predicate()) await cv.wait(mutex); /* state is now true */ });',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-CONDITION-VARIABLE: Polling loop on shared state. Wait on a condition variable instead.',
  warheadTemplate: 'A condition variable signals state changes exactly once; polling wastes CPU and races the predicate check against the mutator.',
  evidenceSpec: { id: 'async-condvar', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-MUTEX', 'ASYNC-BARRIER', 'ASYNC-LATCH'],
  selfVerified: true,
};

// ══ RESOURCES (6 nodes) ════════════════════════════════════════

export const ASYNC_RESOURCE_POOL: KnowledgeNode = {
  id: 'ASYNC-RESOURCE-POOL',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC RESOURCE POOL: Pre-allocate N reusable resources; acquire() hands one out (blocks if empty), release() returns it. Must validate/destroy stale resources and bound idle lifetime.',
  detectionMethod: 'Find code that allocates-and-discards an expensive resource (connection, GPU context) per request. Flag — pool it.',
  fixTemplate: 'const res = await pool.acquire(); try { return await res.process(job); } finally { await pool.release(res); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-RESOURCE-POOL: Per-request allocation of expensive resource. Use a pooled, acquire/release lifecycle.',
  warheadTemplate: 'A resource pool amortizes allocation cost and bounds total resource usage; per-request allocation causes churn, leaks, and exhaustion.',
  evidenceSpec: { id: 'async-respool', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-CONNECTION-POOL', 'ASYNC-THREAD-POOL', 'P4-RESOURCE-LIFECYCLE'],
  selfVerified: true,
};

export const ASYNC_CONNECTION_POOL: KnowledgeNode = {
  id: 'ASYNC-CONNECTION-POOL',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC CONNECTION POOL: DB/client connections are pooled with min/max bounds, idle eviction, health checks (PING), and acquire timeout. A stale connection must be discarded and replaced transparently.',
  detectionMethod: 'Find code that opens a new client connection per request or shares one connection across all requests. Flag both — pool with bounds.',
  fixTemplate: 'const pool = createPool(() => connect(), { min: 2, max: 10, idleTimeout: 30000, acquireTimeout: 5000, healthCheck: ping });',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-CONNECTION-POOL: New/shared connection per request. Pool with min/max/timeout + health check.',
  warheadTemplate: 'A connection pool bounds resource usage and masks transient failures; per-request connections exhaust server limits and single shared connections serialize all traffic.',
  evidenceSpec: { id: 'async-connpool', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-RESOURCE-POOL', 'CONC-RESOURCE-BUDGET', 'ASYNC-CIRCUIT-BREAKER'],
  selfVerified: true,
};

export const ASYNC_THREAD_POOL: KnowledgeNode = {
  id: 'ASYNC-THREAD-POOL',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC THREAD POOL (worker_threads): CPU-bound work runs in worker_threads, not on the event loop. Pool with a fixed size, transfer (not copy) large buffers, and terminate workers on idle to free memory.',
  detectionMethod: 'Find CPU-heavy synchronous loops on the main loop thread (crypto, hashing, parsing GBs). Flag — move to a worker pool.',
  fixTemplate: 'const worker = pool.get(); const result = await runInWorker(worker, heavyFn, transferList); pool.idle(worker);',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-THREAD-POOL: CPU-bound loop on the event loop. Move to a worker_thread pool.',
  warheadTemplate: 'worker_threads give true parallelism for CPU work without blocking the event loop; running it on the loop thread freezes every async callback.',
  evidenceSpec: { id: 'async-threadpool', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-EVENT-LOOP', 'ASYNC-RESOURCE-POOL', 'CONC-WORKER-POOL'],
  selfVerified: true,
};

export const ASYNC_TASK_QUEUE: KnowledgeNode = {
  id: 'ASYNC-TASK-QUEUE',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC TASK QUEUE: Persisted/bounded queue of async tasks processed by N workers in order (FIFO or priority). Must be durable (survive crash) and apply backpressure when full.',
  detectionMethod: 'Find in-memory array used as a durable work queue that grows unbounded and loses work on crash. Flag — use a durable bounded queue.',
  fixTemplate: 'await queue.enqueue(job); // worker: while (job = await queue.dequeue()) await run(job);',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-TASK-QUEUE: In-memory unbounded queue losing work on crash. Use a durable bounded queue.',
  warheadTemplate: 'A durable bounded queue survives crashes and bounds memory; an in-memory array loses all pending work on restart and grows without limit.',
  evidenceSpec: { id: 'async-taskqueue', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-PRODUCER-CONSUMER', 'CONC-QUEUE-BACKPRESSURE', 'ASYNC-BACKPRESSURE'],
  selfVerified: true,
};

export const ASYNC_RATE_LIMITER: KnowledgeNode = {
  id: 'ASYNC-RATE-LIMITER',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC RATE LIMITER: Enforce requests/sec or tokens/window. Two families: token bucket (bursty) and sliding window (smooth). Awaiting the limiter blocks until a slot is free — never retry-storm past it.',
  detectionMethod: 'Find external API calls without a client-side rate limiter. Flag — the API will 429/reject and you have no throttle.',
  fixTemplate: 'await limiter.acquire(); try { return await api.call(); } finally { /* token consumed on acquire */ }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-RATE-LIMITER: External API calls with no client throttle. Add a rate limiter (token bucket or sliding window).',
  warheadTemplate: 'A client-side rate limiter prevents 429 storms and bans; without it, retries amplify load and get the client blocked by the upstream.',
  evidenceSpec: { id: 'async-ratelimit', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['CONC-TOKEN-BUCKET', 'ASYNC-CIRCUIT-BREAKER', 'ASYNC-THUNDERING-HERD'],
  selfVerified: true,
};

export const ASYNC_CIRCUIT_BREAKER: KnowledgeNode = {
  id: 'ASYNC-CIRCUIT-BREAKER',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC CIRCUIT BREAKER: 3-state (closed/open/half-open) gate around a flaky dependency. After N failures -> OPEN (fast-fail). After cooldown -> HALF_OPEN (probe). Success -> CLOSED. Stops cascading failures.',
  detectionMethod: 'Find calls to a flaky external service with plain retries and no breaker. Flag — failures cascade and never fast-fail.',
  fixTemplate: 'const result = await breaker.exec(() => service.call()); // throws "circuit open" if OPEN',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-CIRCUIT-BREAKER: Flaky dependency with retries but no breaker. Add a 3-state circuit breaker.',
  warheadTemplate: 'A circuit breaker fast-fails a down dependency instead of queuing doomed calls; without it, retries pile up and exhaust the caller\'s pool.',
  evidenceSpec: { id: 'async-breaker', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['CONC-CIRCUIT-BREAKER', 'CONC-CIRCUIT-STATES', 'ASYNC-RATE-LIMITER', 'CONC-EXP-BACKOFF'],
  selfVerified: true,
};

// ══ PATTERNS (6 nodes) ═════════════════════════════════════════

export const ASYNC_PUB_SUB: KnowledgeNode = {
  id: 'ASYNC-PUB-SUB',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC PUB/SUB: Publishers emit to a topic without knowing subscribers; subscribers receive async. Slow subscribers must not block the emitter — use per-subscriber queues with backpressure.',
  detectionMethod: 'Find an emitter that calls subscriber callbacks synchronously and a slow subscriber stalls all publishing. Flag — decouple with per-subscriber queues.',
  fixTemplate: 'emitter.on("evt", async (d) => { await subscriberQueue.push(d); }); // emitter never awaits subscribers directly',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-PUB-SUB: Slow subscriber stalls the emitter. Decouple with per-subscriber queues + backpressure.',
  warheadTemplate: 'Decoupled pub/sub keeps the emitter non-blocking; a slow synchronous subscriber freezes every publisher and every other subscriber.',
  evidenceSpec: { id: 'async-pubsub', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-PRODUCER-CONSUMER', 'ARCH-OBSERVER', 'ASYNC-BACKPRESSURE'],
  selfVerified: true,
};

export const ASYNC_PRODUCER_CONSUMER: KnowledgeNode = {
  id: 'ASYNC-PRODUCER-CONSUMER',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC PRODUCER/CONSUMER: Producers push to a bounded queue, consumers pull. The queue applies backpressure on producers when full and idles consumers when empty. No unbounded buffering.',
  detectionMethod: 'Find a producer that pushes to an unbounded array while a consumer drains it — memory grows without limit under load. Flag — bound the queue.',
  fixTemplate: 'const q = new AsyncQueue(100); // produce: await q.push(item); consume: const item = await q.pop();',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-PRODUCER-CONSUMER: Unbounded buffer between producer/consumer. Bound it with backpressure.',
  warheadTemplate: 'A bounded queue ties producer rate to consumer rate; unbounded buffering lets a slow consumer drive the process into OOM.',
  evidenceSpec: { id: 'async-prodcons', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-TASK-QUEUE', 'ASYNC-BACKPRESSURE', 'ASYNC-PUB-SUB'],
  selfVerified: true,
};

export const ASYNC_READERS_WRITERS: KnowledgeNode = {
  id: 'ASYNC-READERS-WRITERS',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC READERS/WRITERS: Many readers OR one writer over shared state. Choose fairness policy: reader-priority (starves writers) vs writer-priority (starves readers) vs fair. Must handle writer-preference to avoid writer starvation.',
  detectionMethod: 'Find a plain mutex over read-heavy state (cache) where readers don\'t need exclusion. Flag — readers can run concurrently.',
  fixTemplate: 'await rwlock.read(() => readCache(k)); await rwlock.write(() => writeCache(k, v));',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-READERS-WRITERS: Read-heavy state under full exclusion. Allow concurrent readers with a RW protocol.',
  warheadTemplate: 'A readers/writers protocol maximizes read concurrency; a plain mutex serializes readers, and reader-priority starves writers indefinitely.',
  evidenceSpec: { id: 'async-rw', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-RW-LOCK', 'ASYNC-STARVATION-PREVENTION'],
  selfVerified: true,
};

export const ASYNC_WAIT_NOTIFY: KnowledgeNode = {
  id: 'ASYNC-WAIT-NOTIFY',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC WAIT/NOTIFY: Tasks wait() on a signal; a notifier calls notify() (one) or notifyAll(). notify must happen after state mutation; waiters must re-check the predicate (no assumption of predicate truth on wake).',
  detectionMethod: 'Find notify() called before the state mutation it announces, or waiters assuming the predicate holds on wake. Flag both ordering and assumption bugs.',
  fixTemplate: 'mutex.runExclusive(async () => { state = newState; cv.notifyAll(); }); // waiter: while (!pred()) await cv.wait();',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-WAIT-NOTIFY: notify before state change, or waiter assumes predicate on wake. Re-check predicate.',
  warheadTemplate: 'Correct wait/notify requires notify AFTER the mutation and a re-checked predicate on wake; otherwise wakeups are lost or based on stale state.',
  evidenceSpec: { id: 'async-waitnotify', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-CONDITION-VARIABLE', 'ASYNC-MUTEX'],
  selfVerified: true,
};

export const ASYNC_COOPERATIVE_CANCELLATION: KnowledgeNode = {
  id: 'ASYNC-COOPERATIVE-CANCELLATION',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC COOPERATIVE CANCELLATION: Use AbortSignal (DOM/Node standard). Long tasks poll signal.aborted / await on an aborted promise and reject with AbortError. Cancellation is cooperative — the task must check the signal.',
  detectionMethod: 'Find long async loops with no AbortSignal check, or tasks that cannot be cancelled. Flag — pass and poll AbortSignal.',
  fixTemplate: 'async function work(signal: AbortSignal) { for (const item of items) { if (signal.aborted) throw new DOMException("aborted", "AbortError"); await process(item); } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-COOPERATIVE-CANCELLATION: Long task with no cancellation point. Pass AbortSignal and poll it.',
  warheadTemplate: 'AbortSignal is the standard cooperative cancellation primitive; without it, runaway tasks cannot be stopped and leak resources after the caller has given up.',
  evidenceSpec: { id: 'async-cancel', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-EVENT-LOOP', 'P4-RESOURCE-LIFECYCLE', 'CONC-NURSERY'],
  selfVerified: true,
};

export const ASYNC_BACKPRESSURE: KnowledgeNode = {
  id: 'ASYNC-BACKPRESSURE',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC BACKPRESSURE: A fast producer feeding a slow consumer must apply backpressure — pause/await the producer when the consumer falls behind. Streams do this via highWaterMark + .pause()/.resume(); queues via bounded size + blocking push.',
  detectionMethod: 'Find a producer writing to a stream/queue without awaiting the consumer (no flow control). Flag memory blowup under load.',
  fixTemplate: 'await stream.write(chunk); // returns a promise that resolves when drained below highWaterMark',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-BACKPRESSURE: Producer not awaiting consumer drain. Apply flow control (await write / pause+resume).',
  warheadTemplate: 'Backpressure ties producer rate to consumer rate; without it the producer fills memory and the process OOMs under sustained load.',
  evidenceSpec: { id: 'async-backpressure', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['CONC-QUEUE-BACKPRESSURE', 'ASYNC-PRODUCER-CONSUMER', 'ASYNC-TASK-QUEUE'],
  selfVerified: true,
};

// ══ ADVANCED (6 nodes) ═════════════════════════════════════════

export const ASYNC_DEADLOCK_PREVENTION: KnowledgeNode = {
  id: 'ASYNC-DEADLOCK-PREVENTION',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC DEADLOCK PREVENTION: Acquire multiple locks in a consistent global order; use tryAcquire-with-timeout; avoid holding a lock across an await that acquires another lock. The Coffman conditions (mutual exclusion, hold-and-wait, no-preemption, circular wait) — break at least one.',
  detectionMethod: 'Find nested async lock acquisitions (acquire A then await then acquire B) where ordering is not enforced. Flag potential circular wait.',
  fixTemplate: 'const [a, b] = await acquireOrdered([lockA, lockB]); // canonical global order try { ... } finally { releaseOrdered([a, b]); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-DEADLOCK-PREVENTION: Nested lock acquisitions in inconsistent order. Acquire in a canonical global order.',
  warheadTemplate: 'Async deadlocks freeze tasks forever (no OS thread to detect); breaking the circular-wait condition via global ordering is the only reliable prevention.',
  evidenceSpec: { id: 'async-nodeadlock', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-MUTEX', 'CONC-DEADLOCK-PREVENT', 'ASYNC-LIVELOCK-DETECTION'],
  selfVerified: true,
};

export const ASYNC_LIVELOCK_DETECTION: KnowledgeNode = {
  id: 'ASYNC-LIVELOCK-DETECTION',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC LIVELOCK DETECTION: Tasks are not blocked but make no forward progress — they repeatedly retry/release-and-reacquire in response to each other. Detect via bounded retry counters and yield-with-jitter to break the lockstep.',
  detectionMethod: 'Find retry loops that always release and immediately re-acquire the same lock with no randomization. Flag livelock risk.',
  fixTemplate: 'if (++retries > MAX) throw new Error("livelock"); await sleep(Math.random() * 100); // jitter breaks the lockstep',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-LIVELOCK-DETECTION: Retry loop with no jitter/counter. Add a retry cap + random jitter.',
  warheadTemplate: 'Livelocked tasks burn CPU while making no progress; a bounded retry counter plus random jitter is the standard break.',
  evidenceSpec: { id: 'async-nolivelock', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-DEADLOCK-PREVENTION', 'ASYNC-STARVATION-PREVENTION', 'CONC-EXP-BACKOFF'],
  selfVerified: true,
};

export const ASYNC_STARVATION_PREVENTION: KnowledgeNode = {
  id: 'ASYNC-STARVATION-PREVENTION',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC STARVATION PREVENTION: A task that never gets scheduled (or a low-priority task always preempted) starves. Prevent with aging (raise priority over wait time), fair queuing, or a bounded wait-per-task deadline.',
  detectionMethod: 'Find a scheduler/queue where one busy task can indefinitely block others, or strict priority with no aging. Flag starvation risk.',
  fixTemplate: 'priority = basePriority + Math.floor(waitMs / AGE_INTERVAL); // aging — old waits rise in priority',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-STARVATION-PREVENTION: Strict-priority queue with no aging. Add aging or fair scheduling.',
  warheadTemplate: 'Starvation makes a task wait forever; aging guarantees every task eventually runs by raising its priority with wait time.',
  evidenceSpec: { id: 'async-nostarve', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-RW-LOCK', 'ASYNC-PRIORITY-INVERSION', 'ASYNC-LIVELOCK-DETECTION'],
  selfVerified: true,
};

export const ASYNC_PRIORITY_INVERSION: KnowledgeNode = {
  id: 'ASYNC-PRIORITY-INVERSION',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC PRIORITY INVERSION: A low-priority task holds a lock a high-priority task needs; a medium-priority task preempts the low one, so the high task is blocked indefinitely. Fix with priority inheritance — the holder temporarily inherits the waiter\'s priority.',
  detectionMethod: 'Find a priority scheduler with locks where a low-priority holder can be preempted by medium-priority tasks while a high-priority task waits. Flag.',
  fixTemplate: 'on acquire: holderPriority = max(holderPriority, waiterPriority); // priority inheritance while high-priority waits',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-PRIORITY-INVERSION: Lock held by low-priority task, high-priority waiter blocked by medium tasks. Use priority inheritance.',
  warheadTemplate: 'Priority inversion can deadlock a real-time/latency-critical path; priority inheritance lets the holder run at the waiter\'s priority until release.',
  evidenceSpec: { id: 'async-noprio', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-STARVATION-PREVENTION', 'ASYNC-MUTEX'],
  selfVerified: true,
};

export const ASYNC_THUNDERING_HERD: KnowledgeNode = {
  id: 'ASYNC-THUNDERING-HERD',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC THUNDERING HERD: When a cached value/circuit opens, ALL waiters wake and hit the backend simultaneously, overwhelming it. Fix with single-flight (one in-flight request, others share its result) + jittered retries.',
  detectionMethod: 'Find many tasks awaiting the same cache-miss/recovery signal and all firing the same upstream call on wake. Flag.',
  fixTemplate: 'result = await singleFlight(key, () => fetchUpstream(key)); // only first call runs, rest await its promise',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-THUNDERING-HERD: All waiters fire the upstream call on wake. Use single-flight + jitter.',
  warheadTemplate: 'Single-flight collapses N identical wake-up calls into one; without it, cache expiry or circuit recovery triggers a synchronized load spike that re-trips the failure.',
  evidenceSpec: { id: 'async-noherd', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-RATE-LIMITER', 'ASYNC-CIRCUIT-BREAKER', 'CONC-EXP-BACKOFF', 'ASYNC-SEMAPHORE'],
  selfVerified: true,
};

export const ASYNC_SHARDING: KnowledgeNode = {
  id: 'ASYNC-SHARDING',
  source: 'ts-deep',
  sourceFile: 'TS-DEEP_ASYNC-CONCURRENCY.md',
  category: 'async-concurrency',
  rule: 'ASYNC SHARDING: Partition work across N independent shards (queues/locks/actors) by key so contention is bounded to a single shard, not global. A hot key still overloads its shard — detect and rebalance.',
  detectionMethod: 'Find a single global queue/lock bottlenecking all traffic. Flag — shard by key so each shard is independent.',
  fixTemplate: 'const shard = shards[hash(key) % N]; await shard.enqueue(task); // contention per-shard, not global',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'ASYNC-SHARDING: Single global queue/lock bottleneck. Shard by key into N independent partitions.',
  warheadTemplate: 'Sharding caps contention per partition instead of serializing everything; a global bottleneck caps throughput at one lock/queue.',
  evidenceSpec: { id: 'async-shard', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['ASYNC-TASK-QUEUE', 'ASYNC-MUTEX', 'CONC-ACTOR-MODEL'],
  selfVerified: true,
};

// ══ EXPORTS ════════════════════════════════════════════════════

export const asyncConcurrencyNodes: KnowledgeNode[] = [
  // Fundamentals (6)
  ASYNC_EVENT_LOOP, ASYNC_MICROTASK, ASYNC_MACROTASK,
  ASYNC_STACK_TRACE, ASYNC_ERROR_PROPAGATION, ASYNC_PROMISE_CHAIN,
  // Concurrency primitives (6)
  ASYNC_MUTEX, ASYNC_SEMAPHORE, ASYNC_RW_LOCK,
  ASYNC_BARRIER, ASYNC_LATCH, ASYNC_CONDITION_VARIABLE,
  // Resources (6)
  ASYNC_RESOURCE_POOL, ASYNC_CONNECTION_POOL, ASYNC_THREAD_POOL,
  ASYNC_TASK_QUEUE, ASYNC_RATE_LIMITER, ASYNC_CIRCUIT_BREAKER,
  // Patterns (6)
  ASYNC_PUB_SUB, ASYNC_PRODUCER_CONSUMER, ASYNC_READERS_WRITERS,
  ASYNC_WAIT_NOTIFY, ASYNC_COOPERATIVE_CANCELLATION, ASYNC_BACKPRESSURE,
  // Advanced (6)
  ASYNC_DEADLOCK_PREVENTION, ASYNC_LIVELOCK_DETECTION,
  ASYNC_STARVATION_PREVENTION, ASYNC_PRIORITY_INVERSION,
  ASYNC_THUNDERING_HERD, ASYNC_SHARDING,
];
