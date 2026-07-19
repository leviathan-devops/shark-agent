/**
 * ContextRelevanceIndex — Auto-Built File→Doc Relevance Mapping
 *
 * Maps files to the context documents that are relevant to them.
 * Auto-learns from observed read-before-write patterns.
 * Falls back to CRITICAL_CONTEXT_DOCS for unknown files.
 *
 * Spec §5.3 — replaces one-size-fits-all "check if any doc was read" with
 * file-specific relevance tracking.
 *
 * P2: All type casts are preceded by runtime type guards.
 * P5: All shared state mutations are wrapped in try/catch.
 */

export class ContextRelevanceIndex {
  // Default index: glob-like prefix pattern → relevant doc names
  private index: Map<string, string[]> = new Map([
    ['src/', ['TASK_QUEUE.md', 'DECISION_CHAIN.md', 'BUILD_STATE.md', 'SPEC.md']],
    ['src/**/*.test.', ['EVIDENCE_STATE.md', 'BUILD_STATE.md']],
    ['src/hooks/', ['DECISION_CHAIN.md', 'CHANGELOG.md']],
    ['context_management/', ['COMPACTION_SURVIVAL.md', 'THOUGHT_STREAM.md']],
    ['*', ['TASK_QUEUE.md', 'DECISION_CHAIN.md']],
  ]);

  // Learned associations: filePath → docName → observation count
  private learned: Map<string, Map<string, number>> = new Map();

  /**
   * Observe a read-before-write pattern and learn from it.
   * After 3+ observations of (read doc D before writing file F),
   * doc D becomes a required read before writing file F.
   */
  observe(docPath: string, writePath: string): void {
    try {
      const docName = docPath.split('/').pop() || docPath;
      if (!this.learned.has(writePath)) {
        this.learned.set(writePath, new Map());
      }
      const docMap = this.learned.get(writePath);
      if (docMap) {
        docMap.set(docName, (docMap.get(docName) || 0) + 1);
      }
    } catch (err) {
      console.error('[ContextRelevanceIndex] observe error:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Get relevant context doc names for a given file path.
   * Uses learned associations if confidence >= 3 observations,
   * otherwise falls back to pattern-based index.
   */
  getRelevantDocs(filePath: string): string[] {
    try {
      // Check learned associations first
      const docMap = this.learned.get(filePath);
      if (docMap) {
        const highConf: string[] = [];
        for (const [doc, count] of docMap) {
          if (count >= 3) highConf.push(doc);
        }
        if (highConf.length > 0) return highConf;
      }

      // Fall back to pattern-based index
      for (const [pattern, docs] of this.index) {
        if (pattern === '*') continue; // skip fallback until end
        if (filePath.includes(pattern.replace('*', ''))) {
          return docs;
        }
      }

      // Ultimate fallback
      return ['TASK_QUEUE.md', 'DECISION_CHAIN.md'];
    } catch (err) {
      console.error('[ContextRelevanceIndex] getRelevantDocs error:', err instanceof Error ? err.message : String(err));
      return ['TASK_QUEUE.md', 'DECISION_CHAIN.md'];
    }
  }
}
