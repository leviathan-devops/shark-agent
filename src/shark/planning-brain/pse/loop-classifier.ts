/**
 * Loop Classifier — B-1: Loop Type Classification (6 classifiers)
 *
 * Spec: PSE_PROBLEM_SOLVING_ENGINE_SPEC.md §6 (B-1)
 *
 * Six behavioral loop classifiers that analyze the sliding window of
 * ToolCallRecords to detect agent stuck patterns:
 *
 *   TYPE_1_EXACT_REPEAT           — Same tool + same args + same output, consecutively
 *   TYPE_2_SEMANTIC_REPEAT        — Passive exploration without progression
 *   TYPE_3_FAILED_APPROACH_CYCLE  — CREATE → EXECUTE → READ(error) repeating
 *   TYPE_4_SCOPE_EXPANSION        — Creating many files without finishing any
 *   TYPE_5_CLAIM_WITHOUT_PROGRESS — Completion claims with no filesystem change
 *   TYPE_6_CONTEXT_LOSS           — Re-reading recently-read files
 *
 * Priority: TYPE_5 > TYPE_3 > TYPE_1 > TYPE_4 > TYPE_2 > TYPE_6
 * On ties: highest priority wins. On priority ties: highest confidence wins.
 */

import type {
  ToolCallRecord,
  LoopType,
  LoopClassificationResult,
  ProblemSolvingEngineConfig,
  ProgressDelta,
  ToolCategory,
} from './pse-types.js';
import { LOOP_TYPE_PRIORITY } from './pse-types.js';

// ─── No-Loop Result Helper ──────────────────────────────────────────────────

function noLoop(windowState: ToolCallRecord[]): LoopClassificationResult {
  return {
    loopDetected: false,
    loopType: null,
    confidence: 0,
    patternDescription: null,
    triggeringRecords: null,
    cycleCount: null,
    windowState,
  };
}

// ─── TYPE_1: Exact Repeat Classifier ─────────────────────────────────────────
/**
 * Detects the same tool called with identical argsHash AND identical outputHash
 * consecutively.
 *
 * Trigger: N consecutive calls where toolName, argsHash, AND outputHash all match.
 *   - Min count: config.type1_exactRepeatMinCount (default 3)
 *   - Confidence: min(count / 5, 1.0)
 *
 * FALSE POSITIVE AVOIDANCE:
 *   - Reading same file with different offset → different argsHash → no detection
 *   - Different output → different outputHash → no detection
 */
export function classifyExactRepeat(
  window: ToolCallRecord[],
  config: ProblemSolvingEngineConfig
): LoopClassificationResult | null {
  if (window.length < config.type1_exactRepeatMinCount) return null;

  // Walk backwards from the end to find the longest consecutive run
  const last = window[window.length - 1];
  let consecutiveCount = 1;
  const triggeringIds: number[] = [last.id];

  for (let i = window.length - 2; i >= 0; i--) {
    const rec = window[i];
    if (
      rec.toolName === last.toolName &&
      rec.argsHash === last.argsHash &&
      rec.outputHash === last.outputHash
    ) {
      consecutiveCount++;
      triggeringIds.unshift(rec.id);
    } else {
      break; // Consecutive streak broken
    }
  }

  if (consecutiveCount < config.type1_exactRepeatMinCount) {
    return null;
  }

  const confidence = Math.min(consecutiveCount / 5, 1.0);

  return {
    loopDetected: true,
    loopType: 'TYPE_1_EXACT_REPEAT',
    confidence,
    patternDescription: `"${last.toolName}" called ${consecutiveCount} times with identical arguments and output`,
    triggeringRecords: triggeringIds,
    cycleCount: consecutiveCount,
    windowState: window,
  };
}

// ─── TYPE_2: Semantic Repeat Classifier ──────────────────────────────────────
/**
 * Detects two sub-patterns of semantic repetition:
 *
 * (A) Same-category passive run: 5+ consecutive calls all in the same passive
 *     category (EXPLORE/ANALYZE/VERIFY) without any CREATE/MODIFY/EXECUTE.
 *
 * (B) Category oscillation: cycling between <=2 categories without any
 *     CREATE/MODIFY/EXECUTE progression.
 *
 * Trigger for (A): config.type2_sameCategoryRunLength (default 5)
 * Trigger for (B): 4+ oscillations between 2 categories
 * Confidence: min(passiveRun / 10, 1.0)
 */
const PASSIVE_CATEGORIES = new Set<ToolCategory>(['EXPLORE', 'ANALYZE', 'VERIFY']);
const ACTIVE_CATEGORIES = new Set<ToolCategory>(['CREATE', 'MODIFY', 'EXECUTE']);

export function classifySemanticRepeat(
  window: ToolCallRecord[],
  config: ProblemSolvingEngineConfig
): LoopClassificationResult | null {
  if (window.length < config.type2_sameCategoryRunLength) return null;

  // ── Sub-pattern (A): Same passive category run ──
  // Check if the last N calls are ALL in passive categories (no CREATE/MODIFY/EXECUTE)
  const recentSlice = window.slice(-config.type2_exploreStuckMin);
  const hasActive = recentSlice.some((r: ToolCallRecord) => ACTIVE_CATEGORIES.has(r.category));

  if (!hasActive) {
    // All passive — check if they're the same category
    const lastCategory = window[window.length - 1].category;
    if (PASSIVE_CATEGORIES.has(lastCategory)) {
      // Count the consecutive passive run from the end
      let passiveRun = 0;
      for (let i = window.length - 1; i >= 0; i--) {
        if (PASSIVE_CATEGORIES.has(window[i].category)) {
          passiveRun++;
        } else {
          break;
        }
      }

      if (passiveRun >= config.type2_sameCategoryRunLength) {
        const confidence = Math.min(passiveRun / 10, 1.0);
        const triggeringIds = window
          .slice(-passiveRun)
          .map((r: ToolCallRecord) => r.id);

        return {
          loopDetected: true,
          loopType: 'TYPE_2_SEMANTIC_REPEAT',
          confidence,
          patternDescription: `${passiveRun} consecutive ${lastCategory} calls without creating, modifying, or executing anything`,
          triggeringRecords: triggeringIds,
          cycleCount: passiveRun,
          windowState: window,
        };
      }
    }
  }

  // ── Sub-pattern (B): Category oscillation ──
  // Detect cycling between ≤2 passive categories without progression
  const scanLength = Math.min(window.length, 10);
  const recentOsc = window.slice(-scanLength);

  // Check if all recent calls are passive
  const allPassive = recentOsc.every((r: ToolCallRecord) => PASSIVE_CATEGORIES.has(r.category));
  if (!allPassive) return null;

  // Count distinct categories
  const categories = new Set(recentOsc.map((r: ToolCallRecord) => r.category));
  if (categories.size <= 2) {
    // Check for oscillation pattern (alternating between the categories)
    let transitions = 0;
    for (let i = 1; i < recentOsc.length; i++) {
      if (recentOsc[i].category !== recentOsc[i - 1].category) {
        transitions++;
      }
    }
    // Oscillation requires multiple transitions
    if (transitions >= 3 && scanLength >= config.type2_sameCategoryRunLength) {
      const catList = [...categories].join('/');
      const confidence = Math.min(transitions / 6, 1.0);
      return {
        loopDetected: true,
        loopType: 'TYPE_2_SEMANTIC_REPEAT',
        confidence,
        patternDescription: `Oscillating between ${catList} categories (${transitions} transitions) without progression`,
        triggeringRecords: recentOsc.map((r: ToolCallRecord) => r.id),
        cycleCount: transitions,
        windowState: window,
      };
    }
  }

  return null;
}

// ─── TYPE_3: Failed Approach Cycle Classifier ────────────────────────────────
/**
 * Detects a repeating CREATE → EXECUTE → READ(error) pattern.
 *
 * The agent writes code, runs a build/test, encounters an error, reads the
 * error, then repeats the same cycle without changing approach.
 *
 * Trigger: config.type3_cycleMinRepetitions (default 2) cycles within
 *          config.type3_cycleWindowScan (default 15) calls.
 *
 * Also detects: same file modified repeatedly with the same error signature.
 */
export function classifyFailedApproachCycle(
  window: ToolCallRecord[],
  config: ProblemSolvingEngineConfig
): LoopClassificationResult | null {
  if (window.length < 4) return null; // Need at least CREATE+EXEC+READ twice

  // Scan the recent window
  const scanLength = Math.min(window.length, config.type3_cycleWindowScan);
  const scanWindow = window.slice(-scanLength);

  // Pattern: CREATE → EXECUTE(error) → [EXPLORE(error)] repeating
  // We look for: CREATE followed by EXECUTE with error, at least N times
  let cycleCount = 0;
  const triggeringIds: number[] = [];
  const errorSignatures: string[] = [];

  let i = 0;
  while (i < scanWindow.length) {
    const rec = scanWindow[i];

    // Look for CREATE call
    if (rec.category === 'CREATE' || rec.category === 'MODIFY') {
      const createId = rec.id;
      triggeringIds.push(createId);

      // Look ahead for EXECUTE with error
      if (i + 1 < scanWindow.length) {
        const execRec = scanWindow[i + 1];
        if (execRec.category === 'EXECUTE' && execRec.outputHadError) {
          cycleCount++;
          triggeringIds.push(execRec.id);

          // Capture error signature
          if (execRec.errorSignature) {
            errorSignatures.push(execRec.errorSignature);
          }

          // Skip past the CREATE+EXECUTE pair (and optional READ)
          i += 2;

          // Optionally skip an EXPLORE (reading the error)
          if (i < scanWindow.length && scanWindow[i].category === 'EXPLORE') {
            triggeringIds.push(scanWindow[i].id);
            i++;
          }
          continue;
        }
      }
    }
    i++;
  }

  if (cycleCount < config.type3_cycleMinRepetitions) {
    // Fall back to same-file-repeat detection
    return detectSameFileRepeat(window, scanWindow);
  }

  // Check if the same error signature repeats (stronger signal)
  const sameError = errorSignatures.length >= 2 &&
    errorSignatures.every((sig: string) => sig === errorSignatures[0]);

  let patternDescription: string;
  let confidence: number;

  if (sameError && errorSignatures[0]) {
    patternDescription = `BUILD CYCLE x${cycleCount}: Same error: ${errorSignatures[0]}`;
    confidence = Math.min(0.6 + cycleCount * 0.15, 1.0);
  } else {
    patternDescription = `EDIT-RUN-ERROR cycle x${cycleCount}: Create/Modify → Execute(error) repeating`;
    confidence = Math.min(0.5 + cycleCount * 0.15, 1.0);
  }

  return {
    loopDetected: true,
    loopType: 'TYPE_3_FAILED_APPROACH_CYCLE',
    confidence,
    patternDescription,
    triggeringRecords: triggeringIds,
    cycleCount,
    windowState: window,
  };
}

/**
 * Sub-detector: same file modified repeatedly.
 */
function detectSameFileRepeat(
  fullWindow: ToolCallRecord[],
  scanWindow: ToolCallRecord[]
): LoopClassificationResult | null {
  // Find MODIFY/CREATE calls to the same primaryFilePath
  const modifyCalls = scanWindow.filter(
    (r: ToolCallRecord) => (r.category === 'CREATE' || r.category === 'MODIFY') && r.primaryFilePath
  );

  if (modifyCalls.length < 3) return null;

  // Group by file
  const fileCounts = new Map<string, number>();
  for (const r of modifyCalls) {
    const fp = r.primaryFilePath!;
    fileCounts.set(fp, (fileCounts.get(fp) || 0) + 1);
  }

  // Find the most-repeated file
  let maxFile = '';
  let maxCount = 0;
  for (const [file, count] of fileCounts) {
    if (count > maxCount) {
      maxCount = count;
      maxFile = file;
    }
  }

  if (maxCount >= 3) {
    // Check if there were errors between the modifications
    const errorCalls = scanWindow.filter((r: ToolCallRecord) => r.outputHadError);
    const hasErrors = errorCalls.length >= 2;

    if (hasErrors) {
      const triggeringIds = modifyCalls
        .filter((r: ToolCallRecord) => r.primaryFilePath === maxFile)
        .map((r: ToolCallRecord) => r.id);

      return {
        loopDetected: true,
        loopType: 'TYPE_3_FAILED_APPROACH_CYCLE',
        confidence: Math.min(0.5 + maxCount * 0.1, 0.9),
        patternDescription: `Repeatedly modified ${maxFile} (${maxCount}x) with errors — stuck on same file`,
        triggeringRecords: triggeringIds,
        cycleCount: maxCount,
        windowState: fullWindow,
      };
    }
  }

  return null;
}

// ─── TYPE_4: Scope Expansion Classifier ───────────────────────────────────────
/**
 * Detects the agent creating many distinct files without finishing/testing any.
 *
 * The agent opens new files in rapid succession instead of completing one task
 * at a time, leading to half-finished work.
 *
 * Trigger: config.type4_distinctFilesMin (default 4) distinct files in
 *          config.type4_consecutiveCreatesMin (default 3) consecutive CREATE calls,
 *          with no VERIFY/EXECUTE in between.
 */
export function classifyScopeExpansion(
  window: ToolCallRecord[],
  config: ProblemSolvingEngineConfig
): LoopClassificationResult | null {
  if (window.length < config.type4_consecutiveCreatesMin) return null;

  // Scan backwards for a CREATE-only streak
  let createStreak: ToolCallRecord[] = [];
  for (let i = window.length - 1; i >= 0; i--) {
    const rec = window[i];
    if (rec.category === 'CREATE' || rec.category === 'MODIFY') {
      createStreak.unshift(rec);
    } else {
      break; // Streak broken
    }
  }

  if (createStreak.length < config.type4_consecutiveCreatesMin) {
    return null;
  }

  // Count distinct files in the streak
  const distinctFiles = new Set<string>();
  for (const rec of createStreak) {
    if (rec.primaryFilePath) {
      distinctFiles.add(rec.primaryFilePath);
    } else if (rec.filesTouched.length > 0) {
      distinctFiles.add(rec.filesTouched[0]);
    }
  }

  if (distinctFiles.size >= config.type4_distinctFilesMin) {
    const confidence = Math.min(distinctFiles.size / 8, 1.0);
    const fileList = [...distinctFiles];

    return {
      loopDetected: true,
      loopType: 'TYPE_4_SCOPE_EXPANSION',
      confidence,
      patternDescription: `Created ${distinctFiles.size} distinct files without testing: ${fileList.slice(0, 5).join(', ')}`,
      triggeringRecords: createStreak.map((r: ToolCallRecord) => r.id),
      cycleCount: distinctFiles.size,
      windowState: window,
    };
  }

  return null;
}

// ─── TYPE_5: Claim Without Progress Classifier (HIGHEST PRIORITY) ─────────────
/**
 * Detects the agent claiming completion ("done", "verified", "fixed") without
 * any actual filesystem changes.
 *
 * This is the HIGHEST PRIORITY loop type. It catches theatrical behavior where
 * the agent claims success without evidence.
 *
 * Trigger: config.type5_maxClaimsWithoutChange (default 10) completion claims
 *          within config.type5_callsSinceFSCheck (default 15) calls, with
 *          byteDelta === 0 and no files created/modified.
 *
 * CALIBRATION FIX: Only triggers if the agent is ACTUALLY stuck — no file
 * writes in the last 5 calls. Productive iteration (read→read→read→write)
 * should NOT trigger TYPE_5 because there ARE file writes happening.
 *
 * Cross-validation: if ProgressDelta shows MEANINGFUL_PROGRESS, suppress.
 */
export function classifyClaimWithoutProgress(
  window: ToolCallRecord[],
  config: ProblemSolvingEngineConfig,
  progressDelta: ProgressDelta,
  enforcementStats?: { enforcementBlocks: number; agentAttempts: number }
): LoopClassificationResult | null {
  // SUPPRESSION: If there IS meaningful progress, no claim-without-progress
  if (progressDelta.status === 'MEANINGFUL_PROGRESS') {
    return null;
  }

  // CALIBRATION FIX: Only trigger if agent is ACTUALLY stuck.
  // Check last 5 calls — if ANY of them wrote files, the agent is iterating,
  // not stuck. Skip TYPE_5 detection entirely.
  const last5 = window.slice(-5);
  const hasRecentWrites = last5.some(
    (r: ToolCallRecord) => r.filesTouched.length > 0 || r.bytesWritten > 0
  );
  if (hasRecentWrites) {
    return null; // Agent IS making filesystem changes — not stuck
  }

  // ── Phase 3: Enforcement-causality detection ──
  // TYPE_5 ALWAYS detects when completion claims exceed the threshold.
  // But we compute whether enforcement (not the agent) caused the missing
  // progress so the intervention layer can adjust messaging accordingly.
  //
  // enforcementCaused = true → lower confidence, enforcement-aware messaging
  // enforcementCaused = false → high confidence, agent-loop messaging
  let enforcementCaused = false;

  if (enforcementStats) {
    const { enforcementBlocks, agentAttempts } = enforcementStats;
    if (enforcementBlocks > 0 && enforcementBlocks >= agentAttempts * 0.5) {
      enforcementCaused = true;
    }
  }

  // Cross-check the recent window — even if cumulative hasn't crossed
  // threshold, if the majority of recent claims were enforcement-blocked,
  // mark as enforcement-caused.
  const recentScan = window.slice(-Math.min(window.length, config.type5_callsSinceFSCheck));
  const blockedRecent = recentScan.filter((r: ToolCallRecord) => r.enforcementBlocked === true);
  if (!enforcementCaused && blockedRecent.length > 0 && blockedRecent.length >= recentScan.length * 0.5) {
    enforcementCaused = true;
  }

  // Count completion claims in recent window
  const scanLength = Math.min(window.length, config.type5_callsSinceFSCheck);
  const recent = window.slice(-scanLength);

  // Find calls with completion claims but no files touched
  const claimsWithoutChange: ToolCallRecord[] = [];
  for (const rec of recent) {
    if (rec.outputHadCompletionClaim && rec.filesTouched.length === 0 && rec.bytesWritten === 0) {
      claimsWithoutChange.push(rec);
    }
  }

  if (claimsWithoutChange.length < config.type5_maxClaimsWithoutChange) {
    return null;
  }

  // Double-check: no files created/modified in the recent window
  const hasFileChanges = recent.some(
    (r: ToolCallRecord) => r.filesTouched.length > 0 || r.bytesWritten > 0
  );

  if (hasFileChanges && progressDelta.byteDelta > 0) {
    return null; // There IS progress — false positive
  }

  const claimCount = claimsWithoutChange.length;
  // Lower confidence if enforcement-caused (agent isn't theatrical, just blocked)
  const confidence = enforcementCaused
    ? Math.min(0.3 + claimCount * 0.1, 0.5)   // Enforcement-caused: 0.3-0.5
    : Math.min(0.7 + claimCount * 0.15, 1.0);  // Agent-caused: starts high

  return {
    loopDetected: true,  // ALWAYS detect — TYPE_5 is never suppressed
    loopType: 'TYPE_5_CLAIM_WITHOUT_PROGRESS',
    confidence,
    patternDescription: enforcementCaused
      ? `enforcement-blocked-claims: ${claimCount} completion claims blocked by enforcement (byteDelta: ${progressDelta.byteDelta})`
      : `claim-without-filesystem-change: ${claimCount} completion claims without filesystem changes (byteDelta: ${progressDelta.byteDelta})`,
    triggeringRecords: claimsWithoutChange.map((r: ToolCallRecord) => r.id),
    cycleCount: claimCount,
    windowState: window,
    enforcementCaused,  // Metadata for intervention layer
  };
}

// ─── TYPE_6: Context Loss Classifier ──────────────────────────────────────────
/**
 * Detects the agent re-reading files it recently read, suggesting context loss.
 *
 * The agent's context window may have been compacted, causing it to re-read
 * files it already knows about, wasting tool calls.
 *
 * Trigger: config.type6_minRereadCount (default 2) re-reads of the same
 *          primaryFilePath within config.type6_recentReadWindow (default 10) calls.
 */
export function classifyContextLoss(
  window: ToolCallRecord[],
  config: ProblemSolvingEngineConfig
): LoopClassificationResult | null {
  if (window.length < 3) return null;

  // Get the recent read window
  const scanLength = Math.min(window.length, config.type6_recentReadWindow);
  const recent = window.slice(-scanLength);

  // Count reads by primaryFilePath
  const readCounts = new Map<string, { count: number; ids: number[] }>();

  for (const rec of recent) {
    if (rec.category !== 'EXPLORE') continue;
    const fp = rec.primaryFilePath;
    if (!fp) continue;

    const existing = readCounts.get(fp);
    if (existing) {
      existing.count++;
      existing.ids.push(rec.id);
    } else {
      readCounts.set(fp, { count: 1, ids: [rec.id] });
    }
  }

  // Find the most-re-read file
  let maxFile = '';
  let maxCount = 0;
  let maxIds: number[] = [];

  for (const [file, info] of readCounts) {
    if (info.count > maxCount) {
      maxCount = info.count;
      maxFile = file;
      maxIds = info.ids;
    }
  }

  if (maxCount >= config.type6_minRereadCount) {
    const confidence = Math.min(maxCount * 0.3, 0.9); // Lower confidence — may be intentional

    return {
      loopDetected: true,
      loopType: 'TYPE_6_CONTEXT_LOSS',
      confidence,
      patternDescription: `Re-reading ${maxFile} ${maxCount} times within recent window — possible context loss`,
      triggeringRecords: maxIds,
      cycleCount: maxCount,
      windowState: window,
    };
  }

  return null;
}

// ─── Orchestrator: Run All 6 Classifiers ──────────────────────────────────────

/**
 * Run all 6 classifiers and return the highest-priority, highest-confidence result.
 *
 * Priority order: TYPE_5 > TYPE_3 > TYPE_1 > TYPE_4 > TYPE_2 > TYPE_6
 *
 * Selection logic:
 *   1. Run all classifiers
 *   2. Filter to only detected loops
 *   3. Sort by: priority (ascending — lower = higher priority), then confidence (descending)
 *   4. Return the top result
 */
export function classifyAll(
  window: ToolCallRecord[],
  config: ProblemSolvingEngineConfig,
  progressDelta: ProgressDelta,
  enforcementStats?: { enforcementBlocks: number; agentAttempts: number }
): LoopClassificationResult {
  if (window.length === 0) {
    return noLoop(window);
  }

  const results: LoopClassificationResult[] = [];

  // TYPE_5 (highest priority) — requires progress delta + enforcement causality
  const type5 = classifyClaimWithoutProgress(window, config, progressDelta, enforcementStats);
  if (type5) results.push(type5);

  // TYPE_3
  const type3 = classifyFailedApproachCycle(window, config);
  if (type3) results.push(type3);

  // TYPE_1
  const type1 = classifyExactRepeat(window, config);
  if (type1) results.push(type1);

  // TYPE_4
  const type4 = classifyScopeExpansion(window, config);
  if (type4) results.push(type4);

  // TYPE_2
  const type2 = classifySemanticRepeat(window, config);
  if (type2) results.push(type2);

  // TYPE_6 (lowest priority)
  const type6 = classifyContextLoss(window, config);
  if (type6) results.push(type6);

  if (results.length === 0) {
    return noLoop(window);
  }

  // Sort: primary by priority (lower = higher priority), secondary by confidence (higher = better)
  results.sort((a: LoopClassificationResult, b: LoopClassificationResult) => {
    const prioA = a.loopType ? LOOP_TYPE_PRIORITY[a.loopType] : 99;
    const prioB = b.loopType ? LOOP_TYPE_PRIORITY[b.loopType] : 99;
    if (prioA !== prioB) return prioA - prioB;
    return b.confidence - a.confidence;
  });

  return results[0];
}
