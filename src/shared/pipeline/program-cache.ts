import { createHash } from 'node:crypto';

interface CacheEntry<T> {
  result: T;
  timestamp: number;
  hits: number;
}

/**
 * Per-engine ProgramCache.
 *
 * Key = SHA-256 of analyzed content (truncated to 16 hex chars).
 * Value = immutable analysis result.
 * Config: maxSize=64, TTL=5 minutes (300000ms).
 * LRU eviction when full.
 *
 * Each Execution Brain engine (RGE, SRE, ICE) and the Semantic Firewall
 * instantiate their own ProgramCache<T> to memoize write-time / in-memory
 * audit results, avoiding redundant TS Program creation and AST walks
 * when the same content+fileName is analyzed repeatedly within the TTL
 * window.
 */
export class ProgramCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private _misses = 0;

  constructor(maxSize = 64, ttlMs = 300000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }

    // TTL check
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this._misses++;
      return null;
    }

    entry.hits++;
    return entry.result;
  }

  set(key: string, result: T): void {
    // LRU eviction
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.cache) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { result, timestamp: Date.now(), hits: 0 });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  get stats(): { size: number; hits: number; misses: number } {
    let hits = 0;
    for (const entry of this.cache.values()) hits += entry.hits;
    return { size: this.cache.size, hits, misses: this._misses };
  }

  /**
   * Compute SHA-256 cache key from content.
   * Truncated to 16 hex chars for compact Map keys.
   */
  static contentKey(...contents: string[]): string {
    const combined = contents.join('||');
    return createHash('sha256').update(combined).digest('hex').substring(0, 16);
  }

  /**
   * Serialize for compaction survival.
   */
  serialize(): string {
    const entries: Array<[string, CacheEntry<T>]> = [];
    for (const [key, entry] of this.cache) {
      entries.push([key, entry]);
    }
    return JSON.stringify({ entries, maxSize: this.maxSize, ttlMs: this.ttlMs });
  }

  /**
   * Restore from serialized state.
   * Note: T must be serializable for this to work.
   */
  static deserialize<T>(data: string): ProgramCache<T> {
    try {
      const parsed = JSON.parse(data);
      const cache = new ProgramCache<T>(parsed.maxSize || 64, parsed.ttlMs || 300000);
      for (const [key, entry] of parsed.entries || []) {
        // Only restore non-expired entries
        if (Date.now() - entry.timestamp < cache.ttlMs) {
          cache.cache.set(key, entry);
        }
      }
      return cache;
    } catch {
      return new ProgramCache<T>();
    }
  }
}
