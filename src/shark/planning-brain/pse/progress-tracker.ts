/**
 * Progress Tracker — B-5: Progress Measurement
 *
 * Spec: PSE_PROBLEM_SOLVING_ENGINE_SPEC.md §13
 *
 * Walks the workspace filesystem and compares snapshots to detect
 * MEANINGFUL_PROGRESS, NO_PROGRESS, or REGRESSION.
 *
 * Multi-signal progress definition:
 *   - Filesystem: files created or modified
 *   - Pass rate: increased
 *   - Tasks: todo items completed
 *   - Gates: gate transitions
 *
 * Hybrid scanning strategy:
 *   - FULL SCAN every config.fs_scanIntervalCalls (default 10)
 *   - INCREMENTAL UPDATE every call (only files touched)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ProgressSnapshot,
  ProgressDelta,
  ProblemSolvingEngineConfig,
} from './pse-types.js';

// ─── Ignore Pattern Matching ──────────────────────────────────────────────────

/**
 * Compile ignore patterns into a matcher function.
 * Supports directory names and glob-like patterns.
 */
function compileIgnorePatterns(patterns: string[]): Set<string> {
  const set = new Set<string>();
  for (const p of patterns) {
    // Normalize: remove leading/trailing slashes
    set.add(p.replace(/^\/+|\/+$/g, ''));
  }
  return set;
}

/**
 * Check if a path segment matches an ignore pattern.
 */
function isIgnored(relPath: string, ignoreSet: Set<string>): boolean {
  const parts = relPath.split(path.sep);

  // Check each directory component against ignore patterns
  for (const part of parts) {
    for (const pattern of ignoreSet) {
      // Exact match
      if (part === pattern) return true;
      // Glob match (*.lock, package-lock.json, etc.)
      if (pattern.includes('*')) {
        const regex = new RegExp(
          '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
        );
        if (regex.test(part)) return true;
      }
    }
  }

  return false;
}

// ─── Progress Tracker Class ───────────────────────────────────────────────────

/**
 * Tracks workspace progress by taking filesystem snapshots and computing deltas.
 *
 * The tracker maintains a `lastSnapshot` and computes a delta against the current
 * state on each call. The delta tells the loop classifier whether the agent is
 * making progress.
 */
export class ProgressTracker {
  private basePath: string;
  private config: ProblemSolvingEngineConfig;
  private lastSnapshot: ProgressSnapshot | null = null;
  private callsSinceScan: number = 0;
  private callsSinceProgress: number = 0;
  private callIndex: number = 0;
  private ignoreSet: Set<string>;
  private lastTestPassRate: number | null = null;
  private lastTodoCompleted: number = 0;
  private lastGateTransitions: number = 0;

  constructor(config: ProblemSolvingEngineConfig) {
    this.config = config;
    this.basePath = config.basePath;
    this.ignoreSet = compileIgnorePatterns(config.fs_ignorePatterns);
  }

  // ─── Full Filesystem Scan ───────────────────────────────────────────────

  /**
   * Walk the workspace directory recursively and record all files.
   * This is the FULL SCAN strategy (Spec §13.2).
   */
  private walkDir(
    relPath: string,
    fileSet: Set<string>,
    fileMtimes: Map<string, number>,
    fileSizes: Map<string, number>,
    state: { totalBytes: number }
  ): void {
    const fullDir = path.join(this.basePath, relPath);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(fullDir, { withFileTypes: true });
    } catch {
      return; // Directory doesn't exist or not accessible
    }

    for (const entry of entries) {
      const entryRel = relPath ? path.join(relPath, entry.name) : entry.name;

      // Check ignore patterns
      if (isIgnored(entryRel, this.ignoreSet)) continue;

      // Limit number of tracked files
      if (fileSet.size >= this.config.fs_maxFilesToTrack) return;

      if (entry.isDirectory()) {
        this.walkDir(entryRel, fileSet, fileMtimes, fileSizes, state);
      } else if (entry.isFile()) {
        try {
          const fullPath = path.join(fullDir, entry.name);
          const stat = fs.statSync(fullPath);
          fileSet.add(entryRel);
          fileMtimes.set(entryRel, stat.mtimeMs);
          fileSizes.set(entryRel, stat.size);
          state.totalBytes += stat.size;
        } catch {
          // File may have been deleted between readdir and stat
        }
      }
    }
  }

  /**
   * Take a full filesystem snapshot.
   */
  private fullScan(): ProgressSnapshot {
    const fileSet = new Set<string>();
    const fileMtimes = new Map<string, number>();
    const fileSizes = new Map<string, number>();
    const state = { totalBytes: 0 };

    this.walkDir('', fileSet, fileMtimes, fileSizes, state);

    this.callsSinceScan = 0;

    return {
      fileSet,
      fileMtimes,
      fileSizes,
      totalBytes: state.totalBytes,
      testPassRate: this.lastTestPassRate,
      todoCompleted: this.lastTodoCompleted,
      gateTransitions: this.lastGateTransitions,
      currentGate: null,
      callIndex: this.callIndex,
    };
  }

  /**
   * Incremental update: only check files that were touched in this call.
   */
  private incrementalUpdate(
    filesTouched: string[],
    snapshot: ProgressSnapshot
  ): ProgressSnapshot {
    for (const relPath of filesTouched) {
      const fullPath = path.isAbsolute(relPath)
        ? relPath
        : path.join(this.basePath, relPath);

      try {
        const stat = fs.statSync(fullPath);

        // Normalize to relative path
        const normalized = path.isAbsolute(relPath)
          ? path.relative(this.basePath, relPath)
          : relPath;

        snapshot.fileSet.add(normalized);
        snapshot.fileMtimes.set(normalized, stat.mtimeMs);
        snapshot.fileSizes.set(normalized, stat.size);
      } catch {
        // File was deleted — remove from tracking
        const normalized = path.isAbsolute(relPath)
          ? path.relative(this.basePath, relPath)
          : relPath;
        snapshot.fileSet.delete(normalized);
        snapshot.fileMtimes.delete(normalized);
        snapshot.fileSizes.delete(normalized);
      }
    }

    // Recompute totalBytes
    snapshot.totalBytes = 0;
    for (const size of snapshot.fileSizes.values()) {
      snapshot.totalBytes += size;
    }

    snapshot.callIndex = this.callIndex;
    return snapshot;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Take a snapshot of the current workspace state.
   * Uses full scan or incremental update based on call count.
   */
  snapshot(filesTouched: string[] = []): ProgressSnapshot {
    this.callIndex++;
    this.callsSinceScan++;

    let snapshot: ProgressSnapshot;

    // Full scan on first call, or every fs_scanIntervalCalls
    if (this.lastSnapshot === null || this.callsSinceScan >= this.config.fs_scanIntervalCalls) {
      snapshot = this.fullScan();
    } else if (filesTouched.length > 0) {
      // Incremental: clone last snapshot and update touched files
      snapshot = this.cloneSnapshot(this.lastSnapshot);
      snapshot = this.incrementalUpdate(filesTouched, snapshot);
    } else {
      // No files touched — reuse last snapshot
      snapshot = this.cloneSnapshot(this.lastSnapshot);
      snapshot.callIndex = this.callIndex;
    }

    return snapshot;
  }

  /**
   * Clone a snapshot (deep copy Maps/Sets).
   */
  private cloneSnapshot(snap: ProgressSnapshot): ProgressSnapshot {
    return {
      fileSet: new Set(snap.fileSet),
      fileMtimes: new Map(snap.fileMtimes),
      fileSizes: new Map(snap.fileSizes),
      totalBytes: snap.totalBytes,
      testPassRate: snap.testPassRate,
      todoCompleted: snap.todoCompleted,
      gateTransitions: snap.gateTransitions,
      currentGate: snap.currentGate,
      callIndex: snap.callIndex,
    };
  }

  /**
   * Compute the delta between the last snapshot and the current snapshot.
   *
   * Status logic:
   *   REGRESSION overrides everything (byteDelta < threshold or testDelta < -0.1)
   *   MEANINGFUL_PROGRESS if ANY signal is positive
   *   NO_PROGRESS if ALL signals are zero/neutral
   */
  computeDelta(current: ProgressSnapshot): ProgressDelta {
    const filesCreated: string[] = [];
    const filesModified: string[] = [];

    if (this.lastSnapshot) {
      const last = this.lastSnapshot;

      // Files created: in current but not in last
      for (const file of current.fileSet) {
        if (!last.fileSet.has(file)) {
          filesCreated.push(file);
        }
      }

      // Files modified: in both but mtime changed
      for (const file of current.fileSet) {
        if (last.fileSet.has(file)) {
          const lastMtime = last.fileMtimes.get(file) ?? 0;
          const currMtime = current.fileMtimes.get(file) ?? 0;
          if (currMtime > lastMtime) {
            filesModified.push(file);
          }
        }
      }
    }

    const byteDelta = this.lastSnapshot
      ? current.totalBytes - this.lastSnapshot.totalBytes
      : current.totalBytes;

    const testPassRateDelta = (this.lastSnapshot?.testPassRate ?? null) !== null && current.testPassRate !== null
      ? (current.testPassRate! - this.lastSnapshot!.testPassRate!)
      : 0;

    const todosCompletedDelta = current.todoCompleted - (this.lastSnapshot?.todoCompleted ?? 0);
    const gateTransitionsDelta = current.gateTransitions - (this.lastSnapshot?.gateTransitions ?? 0);

    // ─── Determine Status ───────────────────────────────────────────────

    let status: ProgressDelta['status'];

    // REGRESSION: byte delta below threshold or test pass rate dropped significantly
    if (byteDelta < this.config.progress_regressionThreshold || testPassRateDelta < -0.1) {
      status = 'REGRESSION';
      this.callsSinceProgress = 0; // Reset on regression (agent is doing something)
    }
    // MEANINGFUL_PROGRESS: some positive signal
    else if (
      filesCreated.length > 0 ||
      filesModified.length > 0 ||
      testPassRateDelta > 0 ||
      todosCompletedDelta > 0 ||
      gateTransitionsDelta > 0 ||
      byteDelta > 0
    ) {
      status = 'MEANINGFUL_PROGRESS';
      this.callsSinceProgress = 0;
    }
    // NO_PROGRESS: all signals neutral for too many calls
    else if (this.callsSinceProgress >= this.config.progress_maxCallsWithoutProgress) {
      status = 'NO_PROGRESS';
    } else {
      status = 'NO_PROGRESS';
      this.callsSinceProgress++;
    }

    // If meaningful progress, reset counter
    if (status === 'MEANINGFUL_PROGRESS') {
      this.callsSinceProgress = 0;
    } else {
      this.callsSinceProgress++;
    }

    return {
      filesCreated,
      filesModified,
      byteDelta,
      testPassRateDelta,
      todosCompletedDelta,
      gateTransitionsDelta,
      status,
      callsSinceProgress: this.callsSinceProgress,
    };
  }

  /**
   * Update the last snapshot (call after computing delta).
   */
  advance(current: ProgressSnapshot): void {
    this.lastSnapshot = this.cloneSnapshot(current);
  }

  /**
   * Update progress signals from tool output (pass rate, todos, gates).
   */
  updateSignals(
    testPassRate: number | null,
    todoCompleted: number | null,
    gateTransition: string | null
  ): void {
    if (testPassRate !== null) {
      this.lastTestPassRate = testPassRate;
    }
    if (todoCompleted !== null) {
      this.lastTodoCompleted = todoCompleted;
    }
    if (gateTransition !== null) {
      this.lastGateTransitions++;
    }
  }

  /**
   * Get the current callsSinceProgress counter.
   */
  getCallsSinceProgress(): number {
    return this.callsSinceProgress;
  }

  /**
   * Reset the callsSinceProgress counter.
   */
  resetProgressCounter(): void {
    this.callsSinceProgress = 0;
  }

  /**
   * Get the last snapshot.
   */
  getLastSnapshot(): ProgressSnapshot | null {
    return this.lastSnapshot;
  }
}

// ─── Signal Extractors (Spec §13.3-§13.5) ─────────────────────────────────────

/**
 * Extract test pass rate from tool output.
 * Handles various output formats from test runners.
 */
export function extractTestPassRate(output: unknown): number | null {
  if (!output) return null;
  const out = output as Record<string, unknown>;

  // Format 1: { overallPassed: bool, totalTests: n, passedTests: n }
  if (typeof out.overallPassed === 'boolean' && typeof out.totalTests === 'number') {
    return out.totalTests > 0
      ? ((out.passedTests as number) ?? 0) / (out.totalTests as number)
      : null;
  }

  // Format 2: { passed: bool }
  if (typeof out.passed === 'boolean') {
    return out.passed ? 1.0 : 0.0;
  }

  // Format 3: { results: [{ passed: bool }] }
  if (Array.isArray(out.results)) {
    const results = out.results as Array<Record<string, unknown>>;
    const passed = results.filter((r: Record<string, unknown>) => r.passed === true).length;
    return results.length > 0 ? passed / results.length : null;
  }

  // Format 4: { passed: n, total: n }
  if (typeof out.passed === 'number' && typeof out.total === 'number') {
    return out.total > 0 ? (out.passed as number) / (out.total as number) : null;
  }

  return null;
}

/**
 * Extract completed TODO count from tool args.
 */
export function extractTodoCompleted(args: unknown): number | null {
  if (!args || typeof args !== 'object') return null;
  const a = args as Record<string, unknown>;
  if (!Array.isArray(a.todos)) return null;
  return (a.todos as Array<Record<string, unknown>>).filter(
    (todo: Record<string, unknown>) => todo?.status === 'completed'
  ).length;
}

/**
 * Extract gate transition from tool call.
 */
export function extractGateTransition(toolName: string, args: unknown): string | null {
  if (toolName !== 'shark-gate' && toolName !== 'manta-gate') return null;
  if (!args || typeof args !== 'object') return null;
  const a = args as Record<string, unknown>;
  if (a.action === 'advance') return (a.gate as string) ?? 'unknown';
  return null;
}
