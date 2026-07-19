/**
 * src/eie/progressive-disclosure.ts - Progressive Disclosure Tracker
 *
 * Tracks which knowledge nodes have already been injected into the
 * model context. Prevents repeating the same guidance across tool
 * calls within a session.
 *
 * Exception: 'block' severity nodes are ALWAYS re-injected - they
 * represent active violations that must be surfaced on every match.
 *
 * Supports compaction recovery via serialize/restore.
 *
 * Part of EIE Phase 2 (EIE_DESIGN_SPEC.md section 4).
 */

import type { KnowledgeNode } from './types';

/** Injection record for audit trail and compaction recovery. */
export interface InjectionRecord {
  nodeId: string;
  timestamp: number;
  gate: string;
}

/** Serialized state for persistence across compaction. */
export interface ProgressiveDisclosureState {
  injected: string[];
  history: InjectionRecord[];
}

/**
 * Tracks which knowledge nodes have been injected into the model context.
 * Persists across tool calls within a session.
 */
export class ProgressiveDisclosure {
  private injected: Set<string> = new Set();
  private injectionHistory: InjectionRecord[] = [];

  /**
   * Mark a node as injected.
   */
  markInjected(nodeId: string, gate: string): void {
    if (!this.injected.has(nodeId)) {
      this.injected.add(nodeId);
      this.injectionHistory.push({ nodeId, timestamp: Date.now(), gate });
    }
  }

  /**
   * Filter out already-injected nodes.
   *
   * Exception: 'block' severity nodes are ALWAYS shown (active violation).
   * 'warn' and 'guide' nodes are only shown if not already injected.
   */
  filterNew(nodes: KnowledgeNode[]): KnowledgeNode[] {
    return nodes.filter(n => {
      // Block severity: always show (active violation)
      if (n.severity === 'block') return true;
      // Warn/guide: only show if not already injected
      return !this.injected.has(n.id);
    });
  }

  /**
   * Get what the model has been told so far for a specific gate.
   * Useful for compaction recovery.
   */
  getInjectedForGate(gate: string): string[] {
    return this.injectionHistory
      .filter(h => h.gate === gate)
      .map(h => h.nodeId);
  }

  /**
   * Get all injected node IDs (for compaction recovery).
   */
  getAllInjected(): string[] {
    return Array.from(this.injected);
  }

  /**
   * Restore from compaction - reconstruct injection tracking state.
   */
  restore(injectedIds: string[], history: InjectionRecord[]): void {
    this.injected = new Set(injectedIds);
    this.injectionHistory = history;
  }

  /**
   * Clear for new session.
   */
  reset(): void {
    this.injected.clear();
    this.injectionHistory = [];
  }

  /**
   * Serialize for persistence (e.g. before compaction).
   */
  serialize(): ProgressiveDisclosureState {
    return {
      injected: Array.from(this.injected),
      history: this.injectionHistory,
    };
  }
}

// -- Singleton Management ---------------------------------------

let _disclosure: ProgressiveDisclosure | null = null;

/**
 * Get the singleton ProgressiveDisclosure instance.
 * Lazily initialized on first access.
 */
export function getProgressiveDisclosure(): ProgressiveDisclosure {
  if (!_disclosure) _disclosure = new ProgressiveDisclosure();
  return _disclosure;
}

/**
 * Reset the singleton - clears state and drops the reference.
 * Call this at the start of a new session.
 */
export function resetProgressiveDisclosure(): void {
  if (_disclosure) _disclosure.reset();
  _disclosure = null;
}
