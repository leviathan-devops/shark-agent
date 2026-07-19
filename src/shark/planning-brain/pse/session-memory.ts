/**
 * Session Pattern Memory — B-3: Session Pattern Memory
 *
 * Spec: PSE_PROBLEM_SOLVING_ENGINE_SPEC.md §8 (B-3), §12
 *
 * Persists per-session behavioral statistics:
 *   - Per-loop-type occurrence tracking and resolution rates
 *   - Total loops detected and interventions applied
 *   - Dominant loop type identification
 *   - Exhausted (already-applied) interventions set
 *   - Serialization for compaction survival
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

import type {
  LoopType,
  SessionPatternMemory,
  LoopTracker,
  SerializedSessionMemory,
  Intervention,
  InterventionRecord,
} from './pse-types.js';

// ─── Session Memory Factory ───────────────────────────────────────────────────

/**
 * Create a fresh SessionPatternMemory for a new session.
 */
export function createSessionMemory(sessionId: string): SessionPatternMemory {
  return {
    sessionId,
    sessionStart: Date.now(),
    loopTrackers: new Map<LoopType, LoopTracker>(),
    totalLoopsDetected: 0,
    totalInterventionsApplied: 0,
    resolutionRate: 0,
    dominantLoopType: null,
    exhaustedInterventions: new Set<string>(),
    lastUpdated: Date.now(),
  };
}

/**
 * Create a fresh LoopTracker for a loop type.
 */
function createLoopTracker(): LoopTracker {
  return {
    count: 0,
    lastOccurrence: 0,
    resolutionRate: 0,
    totalOccurrences: 0,
    resolved: false,
    resolvedBy: null,
    callsSinceLastOccurrence: 0,
    interventions: [],
  };
}

// ─── Occurrence Tracking ──────────────────────────────────────────────────────

/**
 * Record a loop occurrence in session memory.
 *
 * This is called by the engine every time a loop is detected.
 * It updates:
 *   - The per-type loop tracker
 *   - Total loops detected
 *   - Dominant loop type
 *   - Resolution tracking (resets callsSinceLastOccurrence)
 */
export function trackOccurrence(
  memory: SessionPatternMemory,
  loopType: LoopType
): void {
  // Get or create tracker
  let tracker = memory.loopTrackers.get(loopType);
  if (!tracker) {
    tracker = createLoopTracker();
    memory.loopTrackers.set(loopType, tracker);
  }

  tracker.count++;
  tracker.totalOccurrences++;
  tracker.lastOccurrence = Date.now();
  tracker.callsSinceLastOccurrence = 0;
  tracker.resolved = false; // New occurrence un-resolves

  // Update totals
  memory.totalLoopsDetected++;

  // Update dominant loop type (most occurrences)
  updateDominantLoopType(memory);

  memory.lastUpdated = Date.now();
}

/**
 * Update the dominant loop type based on occurrence counts.
 */
function updateDominantLoopType(memory: SessionPatternMemory): void {
  let maxType: LoopType | null = null;
  let maxCount = 0;

  for (const [type, tracker] of memory.loopTrackers) {
    if (tracker.count > maxCount) {
      maxCount = tracker.count;
      maxType = type;
    }
  }

  memory.dominantLoopType = maxType;
}

// ─── Intervention Tracking ────────────────────────────────────────────────────

/**
 * Record an applied intervention in session memory.
 *
 * Called by the engine after an intervention is applied.
 * Updates:
 *   - The per-type intervention history
 *   - Total interventions applied
 *   - Exhausted interventions set
 */
export function trackIntervention(
  memory: SessionPatternMemory,
  loopType: LoopType,
  intervention: Intervention
): void {
  // Get or create tracker
  let tracker = memory.loopTrackers.get(loopType);
  if (!tracker) {
    tracker = createLoopTracker();
    memory.loopTrackers.set(loopType, tracker);
  }

  // Record the intervention
  const record: InterventionRecord = {
    timestamp: Date.now(),
    action: intervention.action,
    escalation: intervention.escalation,
    message: intervention.message,
    effective: false, // Marked effective later when loop is resolved
  };
  tracker.interventions.push(record);

  // Add to exhausted interventions (dedup)
  if (intervention.action !== 'pass') {
    const dedupKey = `${loopType}:${intervention.escalation}:${intervention.detectedPattern}`;
    memory.exhaustedInterventions.add(dedupKey);
  }

  memory.totalInterventionsApplied++;
  memory.lastUpdated = Date.now();
}

/**
 * Mark an intervention as effective (the loop was resolved after it).
 */
export function markInterventionEffective(
  memory: SessionPatternMemory,
  loopType: LoopType,
  escalation: number
): void {
  const tracker = memory.loopTrackers.get(loopType);
  if (!tracker) return;

  // Find the last intervention at this escalation level
  for (let i = tracker.interventions.length - 1; i >= 0; i--) {
    if (tracker.interventions[i].escalation === escalation) {
      tracker.interventions[i].effective = true;
      break;
    }
  }
}

// ─── Resolution Tracking ──────────────────────────────────────────────────────

/**
 * Check if a loop type has been resolved (10+ non-looping calls since last occurrence).
 *
 * Called by the engine on every call. If enough calls have passed without
 * re-occurrence, the loop is marked resolved.
 */
export function checkResolution(
  memory: SessionPatternMemory,
  loopType: LoopType,
  resolutionThreshold: number = 10
): boolean {
  const tracker = memory.loopTrackers.get(loopType);
  if (!tracker) return false;

  // Already resolved
  if (tracker.resolved) return true;

  // Increment calls since last occurrence
  tracker.callsSinceLastOccurrence++;

  // Check resolution threshold
  if (tracker.callsSinceLastOccurrence >= resolutionThreshold) {
    tracker.resolved = true;

    // Find the last intervention that was applied and mark it as the resolver
    if (tracker.interventions.length > 0) {
      const lastIntervention = tracker.interventions[tracker.interventions.length - 1];
      tracker.resolvedBy = `${lastIntervention.action} (level ${lastIntervention.escalation})`;
      lastIntervention.effective = true;
      markInterventionEffective(memory, loopType, lastIntervention.escalation);
    } else {
      tracker.resolvedBy = 'self-resolved';
    }

    // Update resolution rate
    updateResolutionRate(memory);

    memory.lastUpdated = Date.now();
    return true;
  }

  return false;
}

/**
 * Update the overall resolution rate.
 */
function updateResolutionRate(memory: SessionPatternMemory): void {
  if (memory.totalLoopsDetected === 0) {
    memory.resolutionRate = 0;
    return;
  }

  let resolvedCount = 0;
  for (const tracker of memory.loopTrackers.values()) {
    if (tracker.resolved) {
      resolvedCount += tracker.totalOccurrences;
    }
  }

  memory.resolutionRate = resolvedCount / memory.totalLoopsDetected;
}

// ─── Query API ─────────────────────────────────────────────────────────────────

/**
 * Get loop counts per type.
 */
export function getLoopCounts(memory: SessionPatternMemory): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [type, tracker] of memory.loopTrackers) {
    result[type] = tracker.count;
  }
  return result;
}

/**
 * Get intervention history for a specific loop type.
 */
export function getInterventionHistory(
  memory: SessionPatternMemory,
  loopType: LoopType
): InterventionRecord[] {
  const tracker = memory.loopTrackers.get(loopType);
  return tracker ? [...tracker.interventions] : [];
}

/**
 * Check if a specific intervention was effective for a loop type.
 */
export function wasEffective(
  memory: SessionPatternMemory,
  loopType: LoopType,
  escalation: number
): boolean {
  const tracker = memory.loopTrackers.get(loopType);
  if (!tracker) return false;

  return tracker.interventions.some(
    (i: InterventionRecord) => i.escalation === escalation && i.effective
  );
}

/**
 * Get intervention effectiveness statistics.
 */
export function getInterventionEffectiveness(
  memory: SessionPatternMemory
): Record<string, { applied: number; effective: number; rate: number }> {
  const stats: Record<string, { applied: number; effective: number }> = {};

  for (const tracker of memory.loopTrackers.values()) {
    for (const intervention of tracker.interventions) {
      const key = intervention.action;
      if (!stats[key]) stats[key] = { applied: 0, effective: 0 };
      stats[key].applied++;
      if (intervention.effective) stats[key].effective++;
    }
  }

  const result: Record<string, { applied: number; effective: number; rate: number }> = {};
  for (const [action, s] of Object.entries(stats)) {
    result[action] = {
      applied: s.applied,
      effective: s.effective,
      rate: s.applied > 0 ? s.effective / s.applied : 0,
    };
  }

  return result;
}

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Serialize SessionPatternMemory for compaction survival.
 * Converts Maps/Sets to plain objects/arrays.
 */
export function serializeSessionMemory(memory: SessionPatternMemory): SerializedSessionMemory {
  const loopTrackersObj: SerializedSessionMemory['loopTrackers'] = {};

  for (const [type, tracker] of memory.loopTrackers) {
    loopTrackersObj[type] = {
      count: tracker.count,
      lastOccurrence: tracker.lastOccurrence,
      resolutionRate: tracker.resolutionRate,
      totalOccurrences: tracker.totalOccurrences,
      resolved: tracker.resolved,
      resolvedBy: tracker.resolvedBy,
      callsSinceLastOccurrence: tracker.callsSinceLastOccurrence,
      interventions: tracker.interventions,
    };
  }

  return {
    sessionId: memory.sessionId,
    sessionStart: memory.sessionStart,
    loopTrackers: loopTrackersObj,
    totalLoopsDetected: memory.totalLoopsDetected,
    totalInterventionsApplied: memory.totalInterventionsApplied,
    resolutionRate: memory.resolutionRate,
    dominantLoopType: memory.dominantLoopType,
    exhaustedInterventions: [...memory.exhaustedInterventions],
    lastUpdated: memory.lastUpdated,
  };
}

/**
 * Deserialize SerializedSessionMemory back to SessionPatternMemory.
 * Converts plain objects/arrays back to Maps/Sets.
 */
export function deserializeSessionMemory(data: SerializedSessionMemory): SessionPatternMemory {
  const loopTrackers = new Map<LoopType, LoopTracker>();

  for (const [typeStr, trackerData] of Object.entries(data.loopTrackers)) {
    const loopType = typeStr as LoopType;
    loopTrackers.set(loopType, {
      count: trackerData.count,
      lastOccurrence: trackerData.lastOccurrence,
      resolutionRate: trackerData.resolutionRate,
      totalOccurrences: trackerData.totalOccurrences,
      resolved: trackerData.resolved,
      resolvedBy: trackerData.resolvedBy,
      callsSinceLastOccurrence: trackerData.callsSinceLastOccurrence,
      interventions: trackerData.interventions,
    });
  }

  return {
    sessionId: data.sessionId,
    sessionStart: data.sessionStart,
    loopTrackers,
    totalLoopsDetected: data.totalLoopsDetected,
    totalInterventionsApplied: data.totalInterventionsApplied,
    resolutionRate: data.resolutionRate,
    dominantLoopType: data.dominantLoopType,
    exhaustedInterventions: new Set(data.exhaustedInterventions),
    lastUpdated: data.lastUpdated,
  };
}

// ─── Disk Persistence (Compaction Survival) ──────────────────────────────────

/**
 * Replay session memory from disk after compaction.
 * Restores progress tracking state from `.shark/evidence/pse/session-memory.json`.
 * Returns null if the file doesn't exist or is corrupt.
 */
export function replaySessionMemory(basePath: string): SessionPatternMemory | null {
  const memPath = path.join(basePath, '.shark', 'evidence', 'pse', 'session-memory.json');
  try {
    if (!fs.existsSync(memPath)) return null;
    const data = fs.readFileSync(memPath, 'utf-8');
    const serialized: SerializedSessionMemory = JSON.parse(data);
    return deserializeSessionMemory(serialized);
  } catch {
    return null;
  }
}

/**
 * Persist session memory to disk for compaction survival.
 * Writes to `.shark/evidence/pse/session-memory.json`.
 */
export function persistSessionMemory(basePath: string, memory: SessionPatternMemory): void {
  const dir = path.join(basePath, '.shark', 'evidence', 'pse');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const memPath = path.join(dir, 'session-memory.json');
  const serialized = serializeSessionMemory(memory);
  fs.writeFileSync(memPath, JSON.stringify(serialized, null, 2));
}
