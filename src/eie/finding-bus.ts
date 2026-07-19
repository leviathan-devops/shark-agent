/**
 * src/eie/finding-bus.ts — The FindingBus
 *
 * The distribution backbone of Shark Agent's Central Nervous System.
 * Routes ALL engine findings from 7 interception points to 4 consumers:
 *   1. Brain       (IntelligenceOrchestrator decisions)
 *   2. Gate        (evidence enforcement)
 *   3. KnowledgeGraph (pattern learning)
 *   4. SystemPrompt   (agent awareness)
 *
 * Design contract (per 06_BRAIN_COORDINATION.md §4):
 *   - Synchronous pub/sub event emitter (runs in the same event loop as hooks)
 *   - SHA-256 dedup keys (zero duplicates, no simple string hash)
 *   - Severity promotion on repeat (escalates minor issues naturally)
 *   - 5000-finding capacity with graceful eviction
 *   - Consumer Error Isolation — one crashing consumer never affects others
 *   - NEVER evicts unresolved or critical/high findings
 *
 * Part of EIE Phase 9 — Brain Coordination Component 6.
 */

import crypto from 'crypto';

// ── Finding Severity ────────────────────────────────────────────

/** Five-level urgency classification. */
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Numeric rank for severity comparison & promotion. */
export const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

/** Reverse lookup: numeric rank -> severity label (precomputed, immutable). */
const SEVERITY_BY_RANK: Record<number, FindingSeverity> = {
  5: 'critical',
  4: 'high',
  3: 'medium',
  2: 'low',
  1: 'info',
};

// ── Finding Engine ──────────────────────────────────────────────

/** Which brain (or subsystem) produced this finding (8 values). */
export type FindingEngine = 'SRE' | 'ICE' | 'RGE' | 'CSE' | 'CME' | 'PSE' | 'EIE' | 'NLP';

// ── Finding Source (15 values) ──────────────────────────────────

/** Identifies which interception point produced the finding. */
export type FindingSource =
  | 'context-matcher'
  | 'messages-transform'
  | 'ice'
  | 'write-time-gate'
  | 'enforcement-brain'
  | 'planning-brain'
  | 'execution-brain'
  | 'guardian'
  | 'warhead-registry'
  | 'rge'
  | 'sre'
  | 'post-write-audit'
  | 'evidence-auto'
  | 'gate-transition'
  | 'derailment-detector';

// ── Finding Category (20 values) ────────────────────────────────

/** Classifies the TYPE of finding. */
export type FindingCategory =
  | 'intent-violation'
  | 'typescript-antipattern'
  | 'theatrical-code'
  | 'evidence-missing'
  | 'evidence-fabricated'
  | 'trajectory-drift'
  | 'trajectory-critical'
  | 'loop-detected'
  | 'loop-escalation'
  | 'gate-violation'
  | 'gate-skip'
  | 'scope-violation'
  | 'derailment'
  | 'knowledge-injection'
  | 'warhead-injection'
  | 'evidence-registered'
  | 'compaction-export'
  | 'compaction-import'
  | 'profile-change'
  | 'system-info';

// ── Finding Evidence ────────────────────────────────────────────

/** Structured proof backing a finding. */
export interface FindingEvidence {
  file?: string;
  line?: number;
  snippet?: string;
  toolName?: string;
  patternId?: string;
  extra?: Record<string, unknown>;
}

// ── Finding (15 fields — the atomic unit of the bus) ────────────

/** A single observation from an engine. */
export interface Finding {
  id: string;                    // UUID v4
  source: FindingSource;         // 15 sources
  engine: FindingEngine;         // 8 engines
  category: FindingCategory;     // 20 categories
  severity: FindingSeverity;     // 5 levels
  message: string;               // <200 chars
  evidence: FindingEvidence;     // structured proof
  timestamp: number;             // Date.now() at emit
  gateContext: string;           // current gate when emitted
  toolContext?: string;          // tool that triggered the finding
  resolved: boolean;             // addressed?
  resolution?: string;           // how it was resolved
  occurrenceCount: number;       // dedup hits for this key
  dedupKey: string;              // SHA-256 hex
}

/**
 * The input shape for emit(). The bus fills in the derived fields:
 * `id`, `timestamp`, `dedupKey`, `occurrenceCount`, `resolved`.
 */
export type EmitInput = Omit<
  Finding,
  'id' | 'timestamp' | 'dedupKey' | 'occurrenceCount' | 'resolved'
>;

// ── Consumer ────────────────────────────────────────────────────

/** A subscriber to the FindingBus. */
export interface FindingConsumer {
  name: string;
  handler: (finding: Finding, event: 'new' | 'update') => void;
  filter?: (finding: Finding) => boolean;
}

// ── State Serialization ─────────────────────────────────────────

/** Serialized FindingBus state for compaction survival. */
export interface FindingBusState {
  findings: Finding[];
  exportedAt: number;
  findingCount: number;
  unresolvedCount: number;
}

// ── Constants ───────────────────────────────────────────────────

/** Maximum number of findings retained in memory. */
export const MAX_FINDINGS = 5000;

/** Maximum findings evicted per capacity event. */
const EVICT_BATCH = 100;

/** Hard cap on message length (field invariant). */
const MAX_MESSAGE_LEN = 200;

/** Slice length of evidence snippet used in dedup key. */
const DEDUP_SNIPPET_LEN = 100;

/** Ring buffer capacity for recent consumer errors (diagnostics). */
const MAX_CONSUMER_ERRORS = 50;

/** The result of isolating a thrown consumer error. */
export interface ConsumerErrorRecord {
  consumer: string;
  message: string;
  timestamp: number;
}

/**
 * Test whether a finding is an eviction candidate.
 * Candidates must be BOTH resolved AND (low | info).
 * NEVER evict unresolved findings. NEVER evict critical/high.
 */
function isEvictable(f: Finding): boolean {
  return f.resolved && (f.severity === 'low' || f.severity === 'info');
}

// ── FindingBus ──────────────────────────────────────────────────

/**
 * FindingBus — synchronous pub/sub event emitter for engine findings.
 *
 * Single instance per process (singleton). Deduplicates via SHA-256,
 * promotes severity on repeats, evicts resolved low/info findings at
 * capacity, and isolates every consumer behind its own try-catch.
 */
export class FindingBus {
  /** Findings keyed by their SHA-256 dedupKey. */
  private _findings: Map<string, Finding> = new Map();
  /** Registered consumers. */
  private _consumers: FindingConsumer[] = [];
  /** Ring buffer of recent consumer errors — diagnostics only, never thrown. */
  private _consumerErrors: ConsumerErrorRecord[] = [];

  /**
   * Emit a finding to all consumers.
   *
   * Deduplicates via SHA-256. Promotes severity on duplicate. Evicts
   * resolved low/info findings when at capacity. All operations are
   * synchronous.
   *
   * @returns the stored (new or updated) finding, or null if input was invalid.
   */
  emit(raw: EmitInput): Finding | null {
    if (!raw) return null;

    // 1. Compute dedup key
    const dedupKey = this.computeDedupKey(raw);

    // 2. Duplicate? promote severity + bump occurrence, notify 'update'
    const existing = this._findings.get(dedupKey);
    if (existing) {
      existing.severity = this.promoteSeverity(existing.severity);
      existing.occurrenceCount += 1;
      this.notifyConsumers(existing, 'update');
      return existing;
    }

    // 3. Build the new finding (derived fields filled in)
    const finding: Finding = {
      ...raw,
      message: this.truncateMessage(raw.message),
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      dedupKey,
      occurrenceCount: 1,
      resolved: false,
    };

    // 4. Capacity check — evict before storing so a seat opens up
    if (this._findings.size >= MAX_FINDINGS) {
      this.evictFindings();
    }

    // 5. Store keyed by dedupKey
    this._findings.set(dedupKey, finding);

    // 6. Notify consumers of a brand-new finding
    this.notifyConsumers(finding, 'new');

    return finding;
  }

  /**
   * Subscribe a consumer. Returns an unsubscribe function.
   * Removal is identity-based (exact object match) so two consumers
   * sharing a name do not interfere.
   */
  subscribe(consumer: FindingConsumer): () => void {
    this._consumers.push(consumer);
    return () => {
      const idx = this._consumers.indexOf(consumer);
      if (idx !== -1) {
        this._consumers.splice(idx, 1);
      }
    };
  }

  /**
   * Resolve a finding by dedupKey. Marks it resolved, stores the
   * resolution text, and notifies consumers with an 'update' event.
   */
  resolve(dedupKey: string, resolution: string): void {
    const finding = this._findings.get(dedupKey);
    if (!finding) return;
    finding.resolved = true;
    finding.resolution = resolution;
    this.notifyConsumers(finding, 'update');
  }

  /** Clear all findings. Does not remove consumers. */
  clear(): void {
    this._findings.clear();
  }

  /** Return all stored findings (snapshot array). */
  getAllFindings(): Finding[] {
    return [...this._findings.values()];
  }

  /** Return only unresolved findings. */
  getUnresolved(): Finding[] {
    return [...this._findings.values()].filter((f) => !f.resolved);
  }

  /** Filter findings by severity. */
  getBySeverity(severity: FindingSeverity): Finding[] {
    return [...this._findings.values()].filter((f) => f.severity === severity);
  }

  /** Filter findings by category. */
  getByCategory(category: FindingCategory): Finding[] {
    return [...this._findings.values()].filter((f) => f.category === category);
  }

  /** Filter findings by engine. */
  getByEngine(engine: FindingEngine): Finding[] {
    return [...this._findings.values()].filter((f) => f.engine === engine);
  }

  /** Return the recent consumer error records (diagnostics only). */
  getConsumerErrors(): ConsumerErrorRecord[] {
    return [...this._consumerErrors];
  }

  /**
   * Serialize the bus state for compaction survival.
   * Produces a plain object safe to JSON-stringify or stash on globalThis.
   */
  exportState(): FindingBusState {
    const findings = this.getAllFindings();
    return {
      findings,
      exportedAt: Date.now(),
      findingCount: findings.length,
      unresolvedCount: findings.filter((f) => !f.resolved).length,
    };
  }

  /**
   * Restore the bus from a serialized state (post-compaction).
   * Findings are re-keyed by their dedupKey. Returns true on success.
   */
  importState(state: FindingBusState): boolean {
    if (!state || !Array.isArray(state.findings)) return false;
    try {
      this._findings.clear();
      for (const finding of state.findings) {
        if (finding && typeof finding.dedupKey === 'string') {
          this._findings.set(finding.dedupKey, finding);
        }
      }
      return true;
    } catch {
      // Import is best-effort; a malformed state must not crash the bus.
      return false;
    }
  }

  // ── Private Methods ───────────────────────────────────────────

  /**
   * Compute the SHA-256 dedup key.
   * Format: `source|category|evidence.file|evidence.line|evidence.snippet[:100]`
   */
  private computeDedupKey(raw: EmitInput): string {
    const parts = [
      raw.source ?? '',
      raw.category ?? '',
      raw.evidence?.file ?? '',
      String(raw.evidence?.line ?? ''),
      (raw.evidence?.snippet ?? '').slice(0, DEDUP_SNIPPET_LEN),
    ];
    const key = parts.join('|');
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Promote severity by exactly one level, flooring at 'critical'.
   * Repeated minor issues escalate naturally toward a block.
   */
  private promoteSeverity(current: FindingSeverity): FindingSeverity {
    const rank = SEVERITY_RANK[current];
    if (rank >= SEVERITY_RANK.critical) return 'critical';
    return SEVERITY_BY_RANK[rank + 1] ?? 'critical';
  }

  /**
   * Evict resolved low/info findings when at capacity (up to EVICT_BATCH).
   * Oldest evicted first. NEVER removes unresolved or critical/high findings.
   */
  private evictFindings(): void {
    let evicted = 0;
    for (const [key, finding] of this._findings) {
      if (evicted >= EVICT_BATCH) break;
      if (isEvictable(finding)) {
        this._findings.delete(key);
        evicted += 1;
      }
    }
  }

  /**
   * Notify every consumer. Each handler runs inside its own try-catch
   * (Consumer Error Isolation) so one crashing consumer cannot affect
   * the others. Filters are applied per-consumer before invocation.
   *
   * Thrown errors are captured into a bounded ring buffer (_consumerErrors)
   * for diagnostics rather than propagated — propagating would break the
   * bus for every downstream consumer.
   */
  private notifyConsumers(finding: Finding, event: 'new' | 'update'): void {
    for (const consumer of this._consumers) {
      try {
        if (consumer.filter && !consumer.filter(finding)) continue;
        consumer.handler(finding, event);
      } catch (err) {
        // ── CONSUMER ERROR ISOLATION (non-negotiable, per §4.9) ──
        // Record for diagnostics, then keep going. Never rethrow.
        this.recordConsumerError(consumer.name, err);
      }
    }
  }

  /** Append a consumer error to the bounded diagnostic ring buffer. */
  private recordConsumerError(name: string, err: unknown): void {
    this._consumerErrors.push({
      consumer: name,
      message: err instanceof Error ? err.message : String(err),
      timestamp: Date.now(),
    });
    if (this._consumerErrors.length > MAX_CONSUMER_ERRORS) {
      this._consumerErrors.splice(0, this._consumerErrors.length - MAX_CONSUMER_ERRORS);
    }
  }

  /** Enforce the <200 char message invariant. */
  private truncateMessage(message: string): string {
    if (typeof message !== 'string') return '';
    if (message.length <= MAX_MESSAGE_LEN) return message;
    return message.slice(0, MAX_MESSAGE_LEN);
  }
}

// ── Singleton Management ────────────────────────────────────────

let _bus: FindingBus | null = null;

/**
 * Get the singleton FindingBus instance.
 * Lazily initialized on first access.
 */
export function getFindingBus(): FindingBus {
  if (!_bus) _bus = new FindingBus();
  return _bus;
}

/**
 * Reset the singleton — drops the reference so the next getFindingBus()
 * returns a fresh bus. Intended for testing and full session resets.
 */
export function resetFindingBus(): void {
  _bus = null;
}
