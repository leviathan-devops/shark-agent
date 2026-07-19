/**
 * src/eie/claim-reality.ts — Claim-Reality Verification (EIE §14)
 *
 * The 3-component claim-reality verifier. Compares agent prose claims
 * against mechanical execution reality. This is the antidote to
 * theatrical code and evidence fabrication (IL01-OUTPUT-IS-REALITY).
 *
 * Three components must all hold for a mutation claim:
 *   1. FILESYSTEM DIFF  — Merkle before/after roots MUST differ
 *   2. TEST EXECUTION   — exit code MUST be zero after the operation
 *   3. RGE SCORING      — violations MUST NOT increase
 *
 * A claim that says "built/fixed/created/implemented" but leaves the
 * filesystem unchanged is theatrical — the verdict is CONTRADICTED.
 *
 * Part of EIE Phase 10 (Dynamic Guardrails + Claim-Reality + Derailment).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ── Types ───────────────────────────────────────────────────────

/** A filesystem snapshot anchored by a Merkle root over file hashes. */
export interface ClaimRealitySnapshot {
  /** SHA-256 Merkle root computed over all file content hashes. */
  merkleRoot: string;
  /** Number of files included in the snapshot. */
  fileCount: number;
  /** Epoch milliseconds when the snapshot was taken. */
  timestamp: number;
  /** Directory that was snapshotted. */
  root: string;
}

/** Verdict for a single claim checked against reality. */
export type ClaimVerdict = 'VERIFIED' | 'CONTRADICTED' | 'INSUFFICIENT_EVIDENCE';

/** Per-component outcome of the 3-component check. */
export interface ClaimComponents {
  /** Component 1: did the filesystem Merkle root change? */
  filesystemChanged: boolean;
  /** Component 2: did the test suite exit zero? null = not checked. */
  testsPassed: boolean | null;
  /** Component 3: did RGE violations stay flat or decrease? null = not checked. */
  rgeStable: boolean | null;
}

/**
 * Result of verifying a single agent claim against filesystem reality.
 *
 * Note: this is the EIE-level (EIE §14) claim-reality result. The CSE
 * planning brain has its own richer ClaimVerification type in
 * cse-types.ts; this is the lighter-weight engine-level variant.
 */
export interface ClaimVerification {
  /** The prose claim that was checked (e.g. "I built the module"). */
  claim: string;
  /** VERIFIED: reality matches. CONTRADICTED: reality refutes. INSUFFICIENT_EVIDENCE: cannot tell. */
  verdict: ClaimVerdict;
  /** Confidence in the verdict (0.0 – 1.0). */
  confidence: number;
  /** Per-component outcomes. */
  components: ClaimComponents;
  /** Human-readable explanation of the verdict. */
  explanation: string;
}

// ── Snapshot ────────────────────────────────────────────────────

/** Directories excluded from Merkle snapshots (noise / build artifacts). */
const SNAPSHOT_EXCLUDE = new Set([
  'node_modules', 'dist', '.git', '.shark', 'Checkpoints', '.turbo',
]);

/** Compute a SHA-256 Merkle root over an array of file content hashes. */
function computeMerkleRoot(fileHashes: string[]): string {
  if (fileHashes.length === 0) {
    return crypto.createHash('sha256').update('').digest('hex');
  }
  // Sort for determinism — order of readdir is not guaranteed.
  const joined = fileHashes.slice().sort().join('\n');
  return crypto.createHash('sha256').update(joined).digest('hex');
}

/**
 * Snapshot a directory tree into a Merkle-anchored snapshot.
 *
 * Walks the tree (excluding noise directories), hashes every regular
 * file's content, and reduces the hashes to a single Merkle root. Two
 * snapshots with the same root are byte-identical; different roots mean
 * the tree changed. Unreadable files are recorded in a skipped list.
 *
 * @param dirPath - absolute or relative directory to snapshot
 * @returns a ClaimRealitySnapshot with the Merkle root and file count
 */
export function snapshotDirectory(dirPath: string): ClaimRealitySnapshot {
  const hashes: string[] = [];
  const skipped: string[] = [];

  const walk = (current: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (readErr) {
      skipped.push('dir:' + current + ':' + (readErr instanceof Error ? readErr.message : String(readErr)));
      return;
    }
    for (const entry of entries) {
      if (SNAPSHOT_EXCLUDE.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        try {
          const buf = fs.readFileSync(full);
          hashes.push(crypto.createHash('sha256').update(buf).digest('hex'));
        } catch (fileErr) {
          skipped.push('file:' + full + ':' + (fileErr instanceof Error ? fileErr.message : String(fileErr)));
        }
      }
    }
  };

  walk(dirPath);

  return {
    merkleRoot: computeMerkleRoot(hashes),
    fileCount: hashes.length,
    timestamp: Date.now(),
    root: path.resolve(dirPath),
  };
}

// ── Verification ────────────────────────────────────────────────

/** Verbs that indicate a mutation claim (something was changed). */
const MUTATION_VERBS = /\b(built|created|wrote|implemented|fixed|generated|added|refactored|moved|renamed|deleted|updated|modified)\b/i;

/**
 * Verify an agent claim against mechanical reality using the 3-component
 * check (EIE §14).
 *
 * @param claim       - the agent's prose claim
 * @param before      - filesystem snapshot taken BEFORE the operation
 * @param after       - filesystem snapshot taken AFTER the operation
 * @param testResult  - optional test execution result (exit code zero = success)
 * @param rgeResult   - optional RGE delta: { before, after } violation counts
 * @returns a ClaimVerification with the verdict and per-component outcomes
 */
export function verifyClaimReality(
  claim: string,
  before: ClaimRealitySnapshot,
  after: ClaimRealitySnapshot,
  testResult?: { exitCode: number },
  rgeResult?: { before: number; after: number },
): ClaimVerification {
  const isMutation = MUTATION_VERBS.test(claim);

  const filesystemChanged = before.merkleRoot !== after.merkleRoot;
  const testsPassed =
    testResult !== undefined ? testResult.exitCode === 0 : null;
  const rgeStable =
    rgeResult !== undefined ? rgeResult.after <= rgeResult.before : null;

  const components: ClaimComponents = { filesystemChanged, testsPassed, rgeStable };

  // ── Mutation claim: all 3 components are binding ──
  if (isMutation) {
    // Hard contradiction: claim says something changed, FS did not.
    if (!filesystemChanged) {
      return {
        claim,
        verdict: 'CONTRADICTED',
        confidence: 0.99,
        components,
        explanation:
          'Claim asserts a mutation ("built/fixed/created/…") but the filesystem ' +
          'Merkle root is identical before and after — no file changed. This is ' +
          'theatrical output (IL01-OUTPUT-IS-REALITY violation).',
      };
    }

    // Check optional components — any failure is a contradiction.
    const failures: string[] = [];
    if (testsPassed === false) {
      failures.push('test suite did not exit zero');
    }
    if (rgeStable === false) {
      failures.push(
        'RGE violations increased (' + rgeResult!.before + ' -> ' + rgeResult!.after + ')',
      );
    }

    if (failures.length > 0) {
      return {
        claim,
        verdict: 'CONTRADICTED',
        confidence: 0.9,
        components,
        explanation:
          'Filesystem changed (consistent with claim) but: ' +
          failures.join('; ') + '.',
      };
    }

    // All checked components hold.
    const checkedCount = [filesystemChanged, testsPassed, rgeStable].filter(
      (v) => v !== null,
    ).length;
    return {
      claim,
      verdict: 'VERIFIED',
      confidence: checkedCount === 3 ? 0.99 : 0.7 + checkedCount * 0.1,
      components,
      explanation:
        'Filesystem Merkle root changed (' + checkedCount + ' component(s) verified). ' +
        'Claim is consistent with mechanical reality.',
    };
  }

  // ── Non-mutation claim (e.g. "I analyzed", "I read the spec") ──
  // No filesystem change is expected. We cannot hard-verify, but if the
  // filesystem unexpectedly changed that is a signal of scope creep.
  if (filesystemChanged) {
    return {
      claim,
      verdict: 'INSUFFICIENT_EVIDENCE',
      confidence: 0.4,
      components,
      explanation:
        'Claim does not assert a mutation, yet the filesystem changed. ' +
        'Cannot verify a read-only claim against a mutated tree.',
    };
  }

  return {
    claim,
    verdict: 'INSUFFICIENT_EVIDENCE',
    confidence: 0.5,
    components,
    explanation:
      'Read-only claim with no filesystem change. Nothing to contradict, ' +
      'but nothing to mechanically confirm either.',
  };
}
