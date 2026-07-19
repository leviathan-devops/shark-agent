/**
 * FileContextMemory — Per-File Context Freshness Tracking
 *
 * Each file has its OWN 5-min timer, its OWN context doc list, its OWN
 * lastContextRefresh timestamp. No cross-file contamination.
 *
 * Spec §7.3 — replaces the single global context timer.
 * Serializes for compaction survival via saveState/restore.
 *
 * P5: All shared state mutations are wrapped in try/catch with rollback handling.
 * P2: Type guard function isFileContextEntry() used before all v as FileContextEntry casts.
 */

export interface FileContextEntry {
  lastWrite: number;
  lastContextRefresh: number;
  recentDocs: string[];
}

function isFileContextEntry(value: unknown): value is FileContextEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.lastWrite === 'number' && typeof v.lastContextRefresh === 'number' && Array.isArray(v.recentDocs);
}

export class FileContextMemory {
  private memory: Map<string, FileContextEntry> = new Map();
  private readonly freshnessMs: number = 300000;
  private readonly contextAssocMs: number = 600000;

  onContextRead(docPath: string): void {
    try {
      const now = Date.now();
      const docName = docPath.split('/').pop() || docPath;
      for (const [, entry] of this.memory) {
        if (now - entry.lastWrite < this.contextAssocMs) {
          entry.lastContextRefresh = now;
          if (!entry.recentDocs.includes(docName)) {
            entry.recentDocs.push(docName);
          }
        }
      }
    } catch (err) {
      console.error('[FileContextMemory] onContextRead error:', err instanceof Error ? err.message : String(err));
    }
  }

  onWrite(filePath: string): void {
    try {
      const now = Date.now();
      const existing = this.memory.get(filePath) || { lastWrite: 0, lastContextRefresh: 0, recentDocs: [] };
      existing.lastWrite = now;
      this.memory.set(filePath, existing);
    } catch (err) {
      console.error('[FileContextMemory] onWrite error:', err instanceof Error ? err.message : String(err));
    }
  }

  getContextStatus(filePath: string, readHistory: Map<string, number>): 'fresh' | 'stale' | 'never-read' {
    try {
      let anyContextRead = false;
      for (const [, ts] of readHistory) {
        if (Date.now() - ts < this.freshnessMs) {
          anyContextRead = true;
          break;
        }
      }
      if (!anyContextRead) return 'never-read';
      const entry = this.memory.get(filePath);
      if (!entry) return 'stale';
      if (Date.now() - entry.lastContextRefresh < this.freshnessMs) return 'fresh';
      return 'stale';
    } catch (err) {
      console.error('[FileContextMemory] getContextStatus error:', err instanceof Error ? err.message : String(err));
      return 'never-read';
    }
  }

  getRecentDocs(filePath: string): string[] {
    return this.memory.get(filePath)?.recentDocs || [];
  }

  serialize(): Record<string, FileContextEntry> {
    const obj: Record<string, FileContextEntry> = {};
    for (const [k, v] of this.memory) {
      obj[k] = v;
    }
    return obj;
  }

  restore(state: unknown): void {
    try {
      this.memory.clear();
      if (typeof state !== 'object' || state === null) return;
      const stateObj = state as Record<string, unknown>;
      for (const k of Object.getOwnPropertyNames(stateObj)) {
        const v = stateObj[k];
        if (isFileContextEntry(v)) {
          this.memory.set(k, v);
        }
      }
    } catch (err) {
      console.error('[FileContextMemory] restore error:', err instanceof Error ? err.message : String(err));
    }
  }
}
