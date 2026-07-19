/**
 * EditHistory — File modification tracker.
 *
 * Tracks which files have been modified during a session, by which tools,
 * with timestamps. Used by the context-aware enforcement engine (Phase 3)
 * to detect scope violations and re-edit patterns.
 *
 * Bible Order: 3 (context-aware enforcement)
 * Wired from: tool-after-handler.ts
 */

export interface FileEditRecord {
  filePath: string;
  timestamp: string;
  toolName: string;
  sessionId?: string;
}

export class EditHistory {
  private edits: FileEditRecord[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  record(edit: FileEditRecord): void {
    this.edits.push(edit);
    if (this.edits.length > this.maxSize) this.edits.shift();
  }

  hasBeenModified(filePath: string, sessionId?: string): boolean {
    return this.edits.some((e: FileEditRecord) =>
      e.filePath === filePath && (!sessionId || e.sessionId === sessionId)
    );
  }

  getModifications(filePath: string): FileEditRecord[] {
    return this.edits.filter((e: FileEditRecord) => e.filePath === filePath);
  }

  getRecentFiles(limit: number = 10): string[] {
    return [...new Set(this.edits.slice(-limit).map((e: FileEditRecord) => e.filePath))];
  }

  getCurrentSessionFiles(sessionId: string): string[] {
    return [...new Set(
      this.edits.filter((e: FileEditRecord) => e.sessionId === sessionId).map((e: FileEditRecord) => e.filePath)
    )];
  }

  size(): number {
    return this.edits.length;
  }
}

// ── Singleton ──────────────────────────────────────────────
let editHistorySingleton: EditHistory | null = null;
export function setEditHistory(eh: EditHistory): void { editHistorySingleton = eh; }
export function getEditHistory(): EditHistory | null { return editHistorySingleton; }
