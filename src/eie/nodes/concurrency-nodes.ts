/**
 * src/eie/nodes/concurrency-nodes.ts — 20 Concurrency Knowledge Nodes
 *
 * From KB-03:
 * - Actor model patterns
 * - Worker pool management
 * - Message passing
 * - Priority queue
 * - Token bucket rate limiter
 * - Circuit breaker (3 states)
 * - Exponential backoff with jitter
 * - Structured concurrency (nursery)
 * - Process execution
 * - Resource budget
 *
 * Source: KB-03_CONCURRENCY_PATTERNS.md
 */

import type { KnowledgeNode } from '../types';

// ══ ACTOR MODEL (3 nodes) ══════════════════════════════════════

export const CONC_ACTOR_MODEL: KnowledgeNode = {
  id: 'CONC-ACTOR-MODEL',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'ACTOR MODEL: Each actor owns its state. Communication via immutable messages. No shared mutable state.',
  detectionMethod: 'Find shared mutable state accessed from multiple async contexts. Flag — use actor pattern.',
  fixTemplate: 'class Actor { private state: State; async receive(msg: Message): Promise<void> { /* process */ } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-ACTOR-MODEL: Shared mutable state. Use Actor model with message passing.',
  warheadTemplate: 'Actor model eliminates race conditions by making state private to each actor.',
  evidenceSpec: { id: 'actor-model', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-MESSAGE-PASSING', 'FM-15-CONCURRENT-MOD', 'P5-ATOMIC-STATE'],
  selfVerified: true,
};

export const CONC_MESSAGE_PASSING: KnowledgeNode = {
  id: 'CONC-MESSAGE-PASSING',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'MESSAGE PASSING: Communication between actors via messages. Messages must be immutable (deep frozen).',
  detectionMethod: 'Find mutable message objects passed between concurrent contexts. Flag.',
  fixTemplate: 'const msg = Object.freeze({ type: "request", data: Object.freeze(payload) }); actor.send(msg);',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-MESSAGE-PASSING: Mutable message between actors. Freeze messages.',
  warheadTemplate: 'Immutable messages prevent data races in concurrent systems.',
  evidenceSpec: { id: 'msg-passing', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-ACTOR-MODEL'],
  selfVerified: true,
};

export const CONC_ACTOR_LIFECYCLE: KnowledgeNode = {
  id: 'CONC-ACTOR-LIFECYCLE',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'ACTOR LIFECYCLE: Actors must be stopped cleanly. Pending messages drained. Resources released.',
  detectionMethod: 'Find actors without stop/drain lifecycle. Flag — missing cleanup.',
  fixTemplate: 'async stop(): Promise<void> { await this.drainQueue(); this.releaseResources(); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-ACTOR-LIFECYCLE: Actor without stop/drain. Add lifecycle management.',
  warheadTemplate: 'Actor lifecycle management prevents resource leaks and message loss.',
  evidenceSpec: { id: 'actor-lifecycle', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-ACTOR-MODEL', 'P4-RESOURCE-LIFECYCLE'],
  selfVerified: true,
};

// ══ WORKER POOL (2 nodes) ══════════════════════════════════════

export const CONC_WORKER_POOL: KnowledgeNode = {
  id: 'CONC-WORKER-POOL',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'WORKER POOL: Fixed-size pool of workers processing tasks from a queue. Prevents resource exhaustion.',
  detectionMethod: 'Find unbounded concurrent task spawning. Flag — use bounded pool.',
  fixTemplate: 'class Pool { constructor(size: number) { this.workers = Array(size).fill(null).map(() => createWorker()); } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-WORKER-POOL: Unbounded concurrency. Use bounded worker pool.',
  warheadTemplate: 'Worker pools prevent resource exhaustion by limiting concurrent operations.',
  evidenceSpec: { id: 'worker-pool', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-RESOURCE-BUDGET', 'CONC-CIRCUIT-BREAKER'],
  selfVerified: true,
};

export const CONC_QUEUE_BACKPRESSURE: KnowledgeNode = {
  id: 'CONC-QUEUE-BACKPRESSURE',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'BACKPRESSURE: Queue must apply backpressure when full. Reject or await — never grow unbounded.',
  detectionMethod: 'Find queues without max size or backpressure. Flag.',
  fixTemplate: 'class BoundedQueue<T> { constructor(readonly max: number) {} async enqueue(item: T) { while (this.items.length >= this.max) await this.notFull.wait(); this.items.push(item); this.notEmpty.notify(); } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-QUEUE-BACKPRESSURE: Queue without backpressure. Add max size + await.',
  warheadTemplate: 'Backpressure prevents memory exhaustion from unbounded queues.',
  evidenceSpec: { id: 'backpressure', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-WORKER-POOL'],
  selfVerified: true,
};

// ══ PRIORITY QUEUE (1 node) ════════════════════════════════════

export const CONC_PRIORITY_QUEUE: KnowledgeNode = {
  id: 'CONC-PRIORITY-QUEUE',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'PRIORITY QUEUE: Tasks processed by priority. Higher priority tasks preempt lower ones.',
  detectionMethod: 'Find FIFO queues where priority matters. Flag — use priority queue.',
  fixTemplate: 'class PriorityQueue<T> { push(item: T, priority: number) { this.heap.push({ item, priority }); this.heap.sort((a, b) => b.priority - a.priority); } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD'] }],
  bulletTemplate: 'CONC-PRIORITY-QUEUE: FIFO queue where priority matters. Use priority queue.',
  warheadTemplate: 'Priority queues ensure critical tasks are processed first.',
  evidenceSpec: { id: 'priority-queue', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: ['CONC-WORKER-POOL'],
  selfVerified: true,
};

// ══ TOKEN BUCKET RATE LIMITER (1 node) ═════════════════════════

export const CONC_TOKEN_BUCKET: KnowledgeNode = {
  id: 'CONC-TOKEN-BUCKET',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'TOKEN BUCKET RATE LIMITER: Limit operations per time window. Tokens refill at fixed rate. Request consumes token.',
  detectionMethod: 'Find code without rate limiting on external calls. Flag — add token bucket.',
  fixTemplate: 'class TokenBucket { constructor(rate: number, capacity: number) {} tryTake(): boolean { this.refill(); if (this.tokens >= 1) { this.tokens -= 1; return true; } return false; } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-TOKEN-BUCKET: No rate limiting on external calls. Add token bucket.',
  warheadTemplate: 'Token bucket rate limiting prevents API abuse and resource exhaustion.',
  evidenceSpec: { id: 'rate-limited', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-CIRCUIT-BREAKER', 'CONC-EXP-BACKOFF'],
  selfVerified: true,
};

// ══ CIRCUIT BREAKER (2 nodes) ══════════════════════════════════

export const CONC_CIRCUIT_BREAKER: KnowledgeNode = {
  id: 'CONC-CIRCUIT-BREAKER',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'CIRCUIT BREAKER (3 states): CLOSED (normal) → OPEN (failing, reject fast) → HALF_OPEN (testing recovery).',
  detectionMethod: 'Find external calls without circuit breaker. Flag repeated failures without fast-fail.',
  fixTemplate: 'class CircuitBreaker { private state: "closed" | "open" | "half-open" = "closed"; async exec<T>(fn: () => Promise<T>): Promise<T> { if (this.state === "open") throw new Error("circuit open"); try { return await fn(); } catch (e) { this.recordFailure(); throw e; } } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-CIRCUIT-BREAKER: External call without circuit breaker. Add 3-state breaker.',
  warheadTemplate: 'Circuit breakers prevent cascading failures by fast-failing when a service is down.',
  evidenceSpec: { id: 'circuit-breaker', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-TOKEN-BUCKET', 'CONC-EXP-BACKOFF'],
  selfVerified: true,
};

export const CONC_CIRCUIT_STATES: KnowledgeNode = {
  id: 'CONC-CIRCUIT-STATES',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'CIRCUIT BREAKER STATES: CLOSED→OPEN after N failures. OPEN→HALF_OPEN after cooldown. HALF_OPEN→CLOSED on success, →OPEN on failure.',
  detectionMethod: 'Find circuit breakers without proper state transitions. Flag.',
  fixTemplate: 'private onFailure() { this.failCount++; if (this.failCount >= this.threshold) this.state = "open"; } private onCooldown() { this.state = "half-open"; } private onSuccess() { this.failCount = 0; this.state = "closed"; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD'] }],
  bulletTemplate: 'CONC-CIRCUIT-STATES: Verify state transitions: CLOSED→OPEN→HALF_OPEN→CLOSED.',
  warheadTemplate: 'Correct state transitions are essential for circuit breaker effectiveness.',
  evidenceSpec: { id: 'circuit-states', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: ['CONC-CIRCUIT-BREAKER'],
  selfVerified: true,
};

// ══ EXPONENTIAL BACKOFF (2 nodes) ══════════════════════════════

export const CONC_EXP_BACKOFF: KnowledgeNode = {
  id: 'CONC-EXP-BACKOFF',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'EXPONENTIAL BACKOFF WITH JITTER: Retry with increasing delay + random jitter to prevent thundering herd.',
  detectionMethod: 'Find retry loops with fixed delay. Flag — use exponential backoff + jitter.',
  fixTemplate: 'async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> { for (let i = 0; i < maxRetries; i++) { try { return await fn(); } catch (e) { if (i === maxRetries - 1) throw e; const delay = Math.min(1000 * 2 ** i, 30000) * (0.5 + Math.random() * 0.5); await sleep(delay); } } throw new Error("unreachable"); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-EXP-BACKOFF: Fixed retry delay. Use exponential backoff + jitter.',
  warheadTemplate: 'Exponential backoff with jitter prevents thundering herd on service recovery.',
  evidenceSpec: { id: 'backoff', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-CIRCUIT-BREAKER', 'CONC-TOKEN-BUCKET'],
  selfVerified: true,
};

export const CONC_RETRY_BUDGET: KnowledgeNode = {
  id: 'CONC-RETRY-BUDGET',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'RETRY BUDGET: Limit total retries per time window. Prevents retry storms from amplifying failures.',
  detectionMethod: 'Find unlimited retry loops. Flag — add retry budget.',
  fixTemplate: 'class RetryBudget { private retries = 0; canRetry(): boolean { return this.retries < this.maxRetries; } consume(): void { this.retries++; } reset(): void { this.retries = 0; } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD'] }],
  bulletTemplate: 'CONC-RETRY-BUDGET: Unlimited retries. Add budget to prevent retry storms.',
  warheadTemplate: 'Retry budgets prevent retry storms from amplifying service failures.',
  evidenceSpec: { id: 'retry-budget', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-EXP-BACKOFF'],
  selfVerified: true,
};

// ══ STRUCTURED CONCURRENCY (2 nodes) ═══════════════════════════

export const CONC_NURSERY: KnowledgeNode = {
  id: 'CONC-NURSERY',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'STRUCTURED CONCURRENCY — NURSERY: All spawned tasks complete before nursery exits. If one fails, all are cancelled.',
  detectionMethod: 'Find Promise.all without error cancellation. Flag — use nursery pattern.',
  fixTemplate: 'async function withNursery<T>(fn: (spawn: <U>(task: Promise<U>) => Promise<U>) => Promise<T>): Promise<T> { const tasks: Promise<unknown>[] = []; try { return await fn((task) => { tasks.push(task); return task; }); } finally { await Promise.allSettled(tasks); } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-NURSERY: Unstructured concurrency. Use nursery to scope child tasks.',
  warheadTemplate: 'Nurseries ensure all child tasks complete or cancel before parent exits.',
  evidenceSpec: { id: 'nursery', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-ACTOR-MODEL', 'CONC-PROMISE-ALL'],
  selfVerified: true,
};

export const CONC_PROMISE_ALL: KnowledgeNode = {
  id: 'CONC-PROMISE-ALL',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'PROMISE.ALL: Run independent operations in parallel. Use Promise.all for independent ops, not sequential awaits.',
  detectionMethod: 'Find sequential awaits for independent operations. Flag — use Promise.all.',
  fixTemplate: 'const [a, b, c] = await Promise.all([fetchA(), fetchB(), fetchC()]);',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-PROMISE-ALL: Sequential awaits for independent ops. Use Promise.all.',
  warheadTemplate: 'Promise.all runs operations in parallel, improving throughput.',
  evidenceSpec: { id: 'promise-all', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: ['CONC-NURSERY', 'FM-20-PROMISE-SERIAL'],
  selfVerified: true,
};

// ══ PROCESS EXECUTION (1 node) ════════════════════════════════

export const CONC_PROCESS_EXEC: KnowledgeNode = {
  id: 'CONC-PROCESS-EXEC',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'PROCESS EXECUTION: Spawn child processes safely. Capture stdout/stderr, handle exit codes, enforce timeout.',
  detectionMethod: 'Find exec/execSync without timeout or error handling. Flag.',
  fixTemplate: 'const result = await execAsync(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 }); if (result.code !== 0) throw new Error(`failed: ${result.stderr}`);',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-PROCESS-EXEC: Process spawn without timeout/error handling. Add safety.',
  warheadTemplate: 'Safe process execution prevents zombie processes and resource leaks.',
  evidenceSpec: { id: 'process-safe', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['SEC-CAPABILITY-PROCESS'],
  selfVerified: true,
};

// ══ RESOURCE BUDGET (2 nodes) ══════════════════════════════════

export const CONC_RESOURCE_BUDGET: KnowledgeNode = {
  id: 'CONC-RESOURCE-BUDGET',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'RESOURCE BUDGET: Declare maximum CPU, memory, connections, and time. Enforce limits at runtime.',
  detectionMethod: 'Find code without resource limits. Flag — add budget enforcement.',
  fixTemplate: 'const budget = { maxHeap: 256 * 1024 * 1024, maxCpu: 5000, maxConnections: 10, maxTime: 30000 }; checkBudget(budget);',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-RESOURCE-BUDGET: No resource limits declared. Add budget enforcement.',
  warheadTemplate: 'Resource budgets prevent resource exhaustion attacks and runaway processes.',
  evidenceSpec: { id: 'resource-budget', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-WORKER-POOL', 'SEC-CAPABILITY-MEMORY'],
  selfVerified: true,
};

export const CONC_DEADLOCK_PREVENTION: KnowledgeNode = {
  id: 'CONC-DEADLOCK-PREVENT',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'DEADLOCK PREVENTION: Acquire locks in consistent order. Use timeout on lock acquisition. Avoid nested locks.',
  detectionMethod: 'Find nested lock acquisitions. Flag potential deadlock.',
  fixTemplate: 'Always acquire locks in canonical order. Use tryLock with timeout. No nested locks.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-DEADLOCK-PREVENT: Nested lock acquisition. Use consistent ordering.',
  warheadTemplate: 'Deadlock prevention ensures concurrent systems don\'t freeze.',
  evidenceSpec: { id: 'no-deadlock', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-ACTOR-MODEL', 'CONC-RESOURCE-BUDGET'],
  selfVerified: true,
};

// ══ ADDITIONAL (1 node) ════════════════════════════════════════

export const CONC_ASYNC_ITERATOR: KnowledgeNode = {
  id: 'CONC-ASYNC-ITERATOR',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'ASYNC ITERATOR: Use async iterators for streaming data. Must have proper cleanup on break/return.',
  detectionMethod: 'Find for-await-of loops without finally cleanup. Flag.',
  fixTemplate: 'async function* stream(): AsyncIterator<T> { try { while (hasMore()) yield await next(); } finally { await cleanup(); } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-ASYNC-ITERATOR: Async iterator without cleanup. Add finally to generator.',
  warheadTemplate: 'Async iterators must clean up resources when the consumer breaks early.',
  evidenceSpec: { id: 'async-iterator', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'guide',
  layer: 4,
  links: ['P4-RESOURCE-LIFECYCLE'],
  selfVerified: true,
};

// ══ WORKER THREADS & PIPELINES (3 nodes) ═══════════════════════

export const CONC_WORKER_THREAD: KnowledgeNode = {
  id: 'CONC-WORKER-THREAD',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'WORKER THREAD POOL: Offload CPU-bound work (hashing, parsing, transforms, compression) to a pool of worker threads. Never block the event loop with long synchronous computation.',
  detectionMethod: 'Find CPU-bound computation running on the main event loop that blocks async progress (large JSON.parse, crypto, image transforms, big loops). Flag — offload to a worker thread pool.',
  fixTemplate: 'class WorkerThreadPool { private idle: Worker[] = []; private waiters: Array<(w: Worker) => void> = []; constructor(n: number, script: string) { this.idle = Array.from({ length: n }, () => new Worker(script)); } async run<T>(task: unknown): Promise<T> { const w = this.idle.pop() ?? await new Promise<Worker>((res) => this.waiters.push(res)); return new Promise<T>((res, rej) => { w.removeAllListeners(); w.once("message", (r) => { this.release(w); res(r as T); }); w.once("error", rej); w.postMessage(task); }); } private release(w: Worker) { if (this.waiters.length) this.waiters.shift()!(w); else this.idle.push(w); } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-WORKER-THREAD: CPU-bound work on the event loop. Offload to a worker thread pool.',
  warheadTemplate: 'Worker thread pools keep the event loop responsive by isolating CPU-bound computation.',
  evidenceSpec: { id: 'worker-thread', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-WORKER-POOL', 'CONC-RESOURCE-BUDGET', 'CONC-PROCESS-EXEC'],
  selfVerified: true,
};

export const CONC_BACKPRESSURE_PIPE: KnowledgeNode = {
  id: 'CONC-BACKPRESSURE-PIPE',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'BACKPRESSURE PIPE: In an async pipeline, a fast producer must pause when a slow consumer falls behind. Buffer between stages is bounded; upstream awaits when full. Never buffer unbounded or drop silently.',
  detectionMethod: 'Find async pipelines where a fast producer feeds a slow consumer with no await/pause between stages (unbounded queue, fire-and-forget handoff). Flag — add bounded buffer + backpressure.',
  fixTemplate: 'async function* pipe<S, T>(src: AsyncIterable<S>, stage: (s: S) => Promise<T>, buf: number): AsyncGenerator<T> { const q = new BoundedQueue<T>(buf); const DONE = Symbol("done"); const pump = (async () => { try { for await (const item of src) await q.enqueue(await stage(item)); } finally { await q.enqueue(DONE as unknown as T); } })(); try { for (let v = await q.dequeue(); v !== DONE; v = await q.dequeue()) yield v as T; } finally { await pump; } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-BACKPRESSURE-PIPE: Pipeline stage without backpressure. Add bounded buffer between stages.',
  warheadTemplate: 'Backpressure in pipelines prevents memory blowup when a producer outruns its consumer.',
  evidenceSpec: { id: 'backpressure-pipe', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-QUEUE-BACKPRESSURE', 'CONC-ASYNC-ITERATOR', 'CONC-ASYNC-SEMAPHORE'],
  selfVerified: true,
};

export const CONC_ASYNC_SEMAPHORE: KnowledgeNode = {
  id: 'CONC-ASYNC-SEMAPHORE',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'ASYNC SEMAPHORE: Bound concurrent access to a shared resource to N. acquire() resolves when a permit is free and returns a release handle. Always release exactly once — use try/finally or the returned handle.',
  detectionMethod: 'Find shared-resource access with unbounded concurrency (unlimited parallel connections, file handles, in-flight requests to a limited pool). Flag — bound with an async semaphore.',
  fixTemplate: 'class AsyncSemaphore { private avail: number; private waiters: Array<() => void> = []; constructor(readonly max: number) { this.avail = max; } async acquire(): Promise<() => void> { if (this.avail <= 0) await new Promise<void>((res) => this.waiters.push(res)); this.avail--; let released = false; return () => { if (released) return; released = true; this.avail++; this.waiters.shift()?.(); }; } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-ASYNC-SEMAPHORE: Unbounded concurrent access to a shared resource. Bound it with a semaphore.',
  warheadTemplate: 'Async semaphores cap concurrency on a resource, preventing overload and contention.',
  evidenceSpec: { id: 'async-semaphore', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-WORKER-POOL', 'CONC-RESOURCE-BUDGET', 'CONC-DEADLOCK-PREVENT'],
  selfVerified: true,
};

// ══ ADVANCED CONCURRENCY PATTERNS (10 nodes) ═══════════════════

export const CONC_ACTOR_MODEL_ADVANCED: KnowledgeNode = {
  id: 'CONC-ACTOR-MODEL-ADVANCED',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'ADVANCED ACTOR MODEL: Actors with supervision trees, location transparency, and mailbox priority. Failed actors restart via supervisor strategies (one-for-one, one-for-all, rest-for-one).',
  detectionMethod: 'Find actor systems without supervision/restart strategies. Flag actors that crash without recovery.',
  fixTemplate: 'supervisor.strategy("one-for-one", { restart: (child) => restartChild(child) }); // restart failed actor',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-ACTOR-MODEL-ADVANCED: Actor without supervision. Add restart strategies.',
  warheadTemplate: 'Supervision trees make actor systems self-healing by restarting failed actors.',
  evidenceSpec: { id: 'actor-advanced', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-ACTOR-MODEL', 'CONC-ACTOR-LIFECYCLE', 'DOMAIN-ORCH-STATE-MACHINE'],
  selfVerified: true,
};

export const CONC_STM: KnowledgeNode = {
  id: 'CONC-STM',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'SOFTWARE TRANSACTIONAL MEMORY (STM): Transactions over shared memory that are atomic, consistent, isolated — retry on conflict.',
  detectionMethod: 'Find lock-based shared state that could use STM for composable atomicity. Flag complex lock hierarchies.',
  fixTemplate: 'const result = atomically(() => { const a = read(refA); write(refB, a + 1); }); // retries on conflict',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-STM: Complex lock hierarchies. Use STM for composable atomic transactions.',
  warheadTemplate: 'STM eliminates deadlocks by retrying transactions on conflict instead of locking.',
  evidenceSpec: { id: 'conc-stm', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'guide',
  layer: 4,
  links: ['CONC-ACTOR-MODEL', 'CONC-DEADLOCK-PREVENTION'],
  selfVerified: true,
};

export const CONC_CSP: KnowledgeNode = {
  id: 'CONC-CSP',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'COMMUNICATING SEQUENTIAL PROCESSES (CSP): Concurrency via channels — processes communicate through channels, no shared state. Go-style concurrency.',
  detectionMethod: 'Find shared-state concurrency that could use channels for decoupled communication.',
  fixTemplate: 'const ch = channel<T>(); go(async () => { await ch.put(data); }); go(async () => { const d = await ch.take(); });',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-CSP: Use channels for communication instead of shared state.',
  warheadTemplate: 'CSP channels provide deterministic, deadlock-free communication between concurrent processes.',
  evidenceSpec: { id: 'conc-csp', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'guide',
  layer: 4,
  links: ['CONC-MESSAGE-PASSING', 'CONC-ACTOR-MODEL'],
  selfVerified: true,
};

export const CONC_DATAFLOW: KnowledgeNode = {
  id: 'CONC-DATAFLOW',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'DATAFLOW CONCURRENCY: Variables are computed asynchronously; consumers block until producers set the value. Declarative parallelism.',
  detectionMethod: 'Find sequential awaits for independent values that could be computed in parallel via dataflow.',
  fixTemplate: 'const x = future(() => computeX()); const y = future(() => computeY()); const result = x + y; // blocks until both ready',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-DATAFLOW: Use dataflow variables for declarative parallel computation.',
  warheadTemplate: 'Dataflow concurrency auto-parallelizes independent computations.',
  evidenceSpec: { id: 'conc-dataflow', verify: 'rge-audit', minQuality: 0.80 },
  severity: 'guide',
  layer: 4,
  links: ['CONC-PROMISE-ALL', 'CONC-FUTURES-PROMISES'],
  selfVerified: true,
};

export const CONC_FUTURES_PROMISES: KnowledgeNode = {
  id: 'CONC-FUTURES-PROMISES',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'FUTURES AND PROMISES: A Future is a read-only handle to a result being computed; a Promise is the write-side. Separate producer from consumer.',
  detectionMethod: 'Find functions returning values that could return Futures for non-blocking composition.',
  fixTemplate: 'const p = new Promise<T>((resolve) => compute(resolve)); const f = p.then; // future = read side',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-FUTURES-PROMISES: Return Futures for non-blocking async composition.',
  warheadTemplate: 'Futures decouple when a result is computed from when it is consumed.',
  evidenceSpec: { id: 'conc-futures', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'guide',
  layer: 4,
  links: ['CONC-PROMISE-ALL', 'CONC-DATAFLOW', 'AP-NESTED-PROMISE'],
  selfVerified: true,
};

export const CONC_REACTIVE_STREAMS: KnowledgeNode = {
  id: 'CONC-REACTIVE-STREAMS',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'REACTIVE STREAMS: Asynchronous stream processing with non-blocking backpressure. Publisher-Subscriber with demand signaling.',
  detectionMethod: 'Find event handlers that buffer unbounded events. Flag missing backpressure on streams.',
  fixTemplate: 'publisher.subscribe({ onNext: (item) => process(item), onSubscribe: (sub) => sub.request(10) }); // demand-driven',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-REACTIVE-STREAMS: Unbounded event buffering. Use demand-driven backpressure.',
  warheadTemplate: 'Reactive streams prevent producer-consumer imbalance via demand signaling.',
  evidenceSpec: { id: 'conc-reactive', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'warn',
  layer: 4,
  links: ['CONC-QUEUE-BACKPRESSURE', 'CONC-BACKPRESSURE-PIPE'],
  selfVerified: true,
};

export const CONC_EVENT_SOURCING_CONC: KnowledgeNode = {
  id: 'CONC-EVENT-SOURCING-CONC',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'EVENT SOURCING (CONCURRENCY): State derived from an append-only event log — concurrent writers append events atomically, avoiding lock contention.',
  detectionMethod: 'Find lock-based state mutation that could use an append-only event log for conflict-free concurrency.',
  fixTemplate: 'await eventLog.append({ type: "increment", ts: Date.now() }); // no lock — log is append-only',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-EVENT-SOURCING-CONC: Lock contention on state. Use append-only event log.',
  warheadTemplate: 'Event sourcing eliminates write locks — appends are atomic and non-conflicting.',
  evidenceSpec: { id: 'conc-event-src', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'guide',
  layer: 4,
  links: ['PERSIST-EVENT-SOURCING', 'DOMAIN-ORCH-EVENT-SOURCING-CQRS'],
  selfVerified: true,
};

export const CONC_LOCK_FREE: KnowledgeNode = {
  id: 'CONC-LOCK-FREE',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'LOCK-FREE DATA STRUCTURES: Use CAS (compare-and-swap) operations for lock-free queues, stacks, and counters — no thread blocking.',
  detectionMethod: 'Find mutex/lock usage on high-contention paths that could use lock-free CAS operations.',
  fixTemplate: 'class LockFreeCounter { private val = new Atomic(0); inc() { this.val.update(v => v + 1); } }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-LOCK-FREE: Lock on high-contention path. Use CAS-based lock-free operations.',
  warheadTemplate: 'Lock-free structures avoid blocking, improving throughput under contention.',
  evidenceSpec: { id: 'conc-lock-free', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'guide',
  layer: 4,
  links: ['CONC-WAIT-FREE', 'CONC-DEADLOCK-PREVENTION'],
  selfVerified: true,
};

export const CONC_WAIT_FREE: KnowledgeNode = {
  id: 'CONC-WAIT-FREE',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'WAIT-FREE PROGRESS: Every operation completes in bounded steps regardless of other threads — stronger than lock-free (which only guarantees system-wide progress).',
  detectionMethod: 'Find lock-free structures under real-time constraints that need per-operation progress guarantees.',
  fixTemplate: 'Use wait-free algorithms for real-time paths: each thread completes in O(1) retries.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-WAIT-FREE: Lock-free under real-time constraints. Upgrade to wait-free.',
  warheadTemplate: 'Wait-free progress guarantees every operation finishes in bounded time.',
  evidenceSpec: { id: 'conc-wait-free', verify: 'rge-audit', minQuality: 0.80 },
  severity: 'guide',
  layer: 4,
  links: ['CONC-LOCK-FREE', 'CONC-DEADLOCK-PREVENTION'],
  selfVerified: true,
};

export const CONC_MEMOIZATION_CONC: KnowledgeNode = {
  id: 'CONC-MEMOIZATION-CONC',
  source: 'alg-sys',
  sourceFile: 'KB-03_CONCURRENCY.md',
  category: 'concurrency',
  rule: 'CONCURRENT MEMOIZATION: Cache expensive results with thread-safe in-flight tracking to avoid duplicate computation (the "thundering herd" problem).',
  detectionMethod: 'Find memoization without in-flight promise tracking. Flag caches where concurrent callers recompute the same key.',
  fixTemplate: 'const cache = new Map(); async function memo(key) { if (cache.has(key)) return cache.get(key); const p = compute(key); cache.set(key, p); return p; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CONC-MEMOIZATION-CONC: Memo without in-flight tracking. Cache promises to prevent recomputation.',
  warheadTemplate: 'Concurrent memoization prevents thundering herd by caching in-flight promises.',
  evidenceSpec: { id: 'conc-memo', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'guide',
  layer: 4,
  links: ['DOMAIN-API-CACHING', 'ASYNC-THUNDERING-HERD'],
  selfVerified: true,
};

// EXPORTS
export const concurrencyNodes: KnowledgeNode[] = [
  CONC_ACTOR_MODEL, CONC_MESSAGE_PASSING, CONC_ACTOR_LIFECYCLE,
  CONC_WORKER_POOL, CONC_QUEUE_BACKPRESSURE,
  CONC_PRIORITY_QUEUE,
  CONC_TOKEN_BUCKET,
  CONC_CIRCUIT_BREAKER, CONC_CIRCUIT_STATES,
  CONC_EXP_BACKOFF, CONC_RETRY_BUDGET,
  CONC_NURSERY, CONC_PROMISE_ALL,
  CONC_PROCESS_EXEC,
  CONC_RESOURCE_BUDGET, CONC_DEADLOCK_PREVENTION,
  CONC_ASYNC_ITERATOR,
  CONC_WORKER_THREAD, CONC_BACKPRESSURE_PIPE, CONC_ASYNC_SEMAPHORE,
  // Advanced Concurrency Patterns
  CONC_ACTOR_MODEL_ADVANCED, CONC_STM, CONC_CSP, CONC_DATAFLOW,
  CONC_FUTURES_PROMISES, CONC_REACTIVE_STREAMS, CONC_EVENT_SOURCING_CONC,
  CONC_LOCK_FREE, CONC_WAIT_FREE, CONC_MEMOIZATION_CONC,
];
