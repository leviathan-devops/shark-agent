/**
 * freshness-checker.ts — T-5: Read-Before-Write Freshness (Order 2, Bible §14)
 *
 * Answers: "Is the file being written freshly read?"
 *
 * Three-layer per-file freshness model:
 *
 *   NEVER_READ — file not read in the last FRESHNESS_WINDOW_MS -> BLOCK
 *                (absolute; Bible §14 is non-negotiable: never write blind)
 *   STALE      — read older than FRESHNESS_HALFLIFE_MS -> WARN (once per file)
 *   FRESH      — read within FRESHNESS_HALFLIFE_MS -> PASS
 *
 * Constants (EXACT):
 *   FRESHNESS_WINDOW_MS   = 300000  (5 minutes)
 *   FRESHNESS_HALFLIFE_MS = 150000  (2.5 minutes)
 *
 * The "once per file" warning rule: a STALE warning fires ONCE per file per
 * read. After warning, subsequent checks for the same file return
 * alreadyWarned=true so the orchestrator can suppress nagging. A new
 * recordRead() resets warnedStale=false.
 */
import * as fs from 'node:fs';
import {
  FRESHNESS_HALFLIFE_MS,
  FRESHNESS_WINDOW_MS,
} from './cme-types.js';
import type { FreshnessEntry, FreshnessVerdict } from './cme-types.js';

export interface SerializedFreshnessEntry {
  readonly filePath: string;
  readonly lastReadTimestamp: string;
  readonly lastReadSequence: number;
  readonly warnedStale: boolean;
}

export class FreshnessChecker {
  /** Map<normalizedFilePath, FreshnessEntry> */
  private readonly reads = new Map<string, FreshnessEntry>();

  /**
   * Record that a file was read at the given sequence number.
   * Resets the warnedStale flag (a new read clears any prior warning).
   */
  recordRead(filePath: string, sequence: number): void {
    const norm = this.normalize(filePath);
    this.reads.set(norm, {
      filePath: norm,
      lastReadTimestamp: new Date().toISOString(),
      lastReadSequence: sequence,
      warnedStale: false,
    });
  }

  /**
   * Record a read with an explicit timestamp (used by tests and restore).
   * Resets warnedStale to false for the new read.
   */
  recordReadAt(filePath: string, sequence: number, timestampMs: number): void {
    const norm = this.normalize(filePath);
    this.reads.set(norm, {
      filePath: norm,
      lastReadTimestamp: new Date(timestampMs).toISOString(),
      lastReadSequence: sequence,
      warnedStale: false,
    });
  }

  /**
   * Check freshness of a file about to be written.
   * Returns a FreshnessVerdict with BLOCK / WARN / PASS.
   *
   * FIXED (v5.1): New files that don't exist on disk yet are legitimate
   * creations, not blind writes. Skip freshness check for files that
   * don't exist — you can't "read" a file before it's created.
   */
  check(filePath: string): FreshnessVerdict {
    const norm = this.normalize(filePath);
    const entry = this.reads.get(norm);
    const now = Date.now();

    // NEVER_READ: if the file doesn't exist on disk yet, it's a new file
    // creation — not a blind write. Allow it unconditionally.
    if (!entry) {
      try {
        if (!fs.existsSync(norm)) {
          return {
            state: 'FRESH',
            action: 'PASS',
            filePath: norm,
            lastReadTimestamp: undefined,
            ageMs: 0,
            reason: 'new file — allowed creation, no prior read required',
            alreadyWarned: false,
          };
        }
      } catch {
        // fs.existsSync failed (permissions, broken symlink, etc.)
        // Fall through to standard check — don't silently pass.
      }
    }

    // NEVER_READ (truly): no read entry in this session -> hard BLOCK.
    if (!entry) {
      return {
        state: 'NEVER_READ',
        action: 'BLOCK',
        filePath: norm,
        lastReadTimestamp: undefined,
        ageMs: Infinity,
        reason: 'file never read in this session; cannot write blind',
        alreadyWarned: false,
      };
    }

    const readTime = new Date(entry.lastReadTimestamp).getTime();
    const ageMs = now - readTime;

    // NEVER_READ (effectively): read older than the freshness window -> BLOCK.
    if (ageMs > FRESHNESS_WINDOW_MS) {
      return {
        state: 'NEVER_READ',
        action: 'BLOCK',
        filePath: norm,
        lastReadTimestamp: entry.lastReadTimestamp,
        ageMs,
        reason: `last read ${Math.round(ageMs / 1000)}s ago exceeds freshness window ${FRESHNESS_WINDOW_MS / 1000}s`,
        alreadyWarned: entry.warnedStale,
      };
    }

    // STALE: read between half-life and window -> WARN (once per file).
    if (ageMs > FRESHNESS_HALFLIFE_MS) {
      const alreadyWarned = entry.warnedStale;
      entry.warnedStale = true; // mark warned; subsequent checks suppress
      return {
        state: 'STALE',
        action: 'WARN',
        filePath: norm,
        lastReadTimestamp: entry.lastReadTimestamp,
        ageMs,
        reason: `read ${Math.round(ageMs / 1000)}s ago is stale (half-life ${FRESHNESS_HALFLIFE_MS / 1000}s)`,
        alreadyWarned,
      };
    }

    // FRESH: read within half-life -> PASS.
    return {
      state: 'FRESH',
      action: 'PASS',
      filePath: norm,
      lastReadTimestamp: entry.lastReadTimestamp,
      ageMs,
      reason: `read ${Math.round(ageMs / 1000)}s ago is fresh`,
      alreadyWarned: false,
    };
  }

  /** Forget a file's read history (e.g., file deleted). */
  forget(filePath: string): void {
    this.reads.delete(this.normalize(filePath));
  }

  /** Clear all warnedStale flags (e.g., on gate transition). */
  clearWarnings(): void {
    for (const entry of this.reads.values()) entry.warnedStale = false;
  }

  /** Number of tracked files (for diagnostics/tests). */
  size(): number {
    return this.reads.size;
  }

  serialize(): SerializedFreshnessEntry[] {
    return Array.from(this.reads.values()).map((e: FreshnessEntry) => ({
      filePath: e.filePath,
      lastReadTimestamp: e.lastReadTimestamp,
      lastReadSequence: e.lastReadSequence,
      warnedStale: e.warnedStale,
    }));
  }

  restore(data: SerializedFreshnessEntry[]): void {
    this.reads.clear();
    if (!Array.isArray(data)) return;
    for (const e of data) {
      this.reads.set(e.filePath, {
        filePath: e.filePath,
        lastReadTimestamp: e.lastReadTimestamp,
        lastReadSequence: e.lastReadSequence,
        warnedStale: !!e.warnedStale,
      });
    }
  }

  private normalize(p: string): string {
    return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  }
}

export { FRESHNESS_WINDOW_MS, FRESHNESS_HALFLIFE_MS };
