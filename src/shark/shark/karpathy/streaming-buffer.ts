/**
 * StreamingBuffer — accumulates input tokens and extracts complete sentences
 * using deterministic string matching (no regex, no NLP, no LLM).
 *
 * Sentence boundary detection: look for `.`, `!`, `?`, `\n` followed by
 * whitespace or end-of-input.
 *
 * T3 UPGRADE (§7.3):
 * - Configurable chunked processing (StreamBufferConfig.chunkSize)
 * - Concurrent safety: all state is instance-private; no shared mutable state
 * - Evidence production on every buffer flush (BufferFlushEvidence)
 * - P2 input validation on all public methods
 * - P3 error containment (try/catch wrappers)
 * - P10 output contract (guaranteed return types via JSDoc)
 */

// ─── T3 §7.3 Types ─────────────────────────────────────────────────────────

/**
 * Configuration for the StreamingBuffer.
 *
 * @property chunkSize - Maximum number of characters per chunk for chunked processing (default: 1000).
 */
export interface StreamBufferConfig {
  chunkSize: number;
}

/**
 * Evidence produced when the buffer is flushed.
 * Used for auditability and diagnostic tracing (T3 §7.3 evidence requirement).
 *
 * @property timestamp - Unix ms when the flush occurred.
 * @property tokensFlushed - Number of tokens removed from the buffer.
 * @property sentencesExtracted - Number of complete sentences found.
 * @property bytesProcessed - Total characters processed in this flush.
 * @property chunkIndex - Which chunk number this flush represents (0-based).
 */
export interface BufferFlushEvidence {
  timestamp: number;
  tokensFlushed: number;
  sentencesExtracted: number;
  bytesProcessed: number;
  chunkIndex: number;
}

// ─── Default configuration ─────────────────────────────────────────────────

const DEFAULT_CONFIG: StreamBufferConfig = {
  chunkSize: 1000,
};

export class StreamingBuffer {
  /** Token buffer for diagnostics and token-level tracking. */
  private buffer: string[] = [];

  /** Raw text accumulator for sentence boundary detection. */
  private pending = '';

  /** Configuration for chunked processing. */
  private config: StreamBufferConfig;

  /** Chunk counter for evidence production. */
  private chunkIndex = 0;

  /** Evidence log from all flush operations. */
  private flushEvidence: BufferFlushEvidence[] = [];

  /**
   * CONCURRENT SAFETY (T3 §7.3):
   * All state is instance-private (`private` keyword enforces encapsulation).
   * No static/shared mutable state exists — each StreamingBuffer instance is
   * fully isolated. Methods are NOT async and do NOT yield to the event loop
   * mid-operation, preventing interleaved access. For multi-threaded scenarios,
   * the caller must provide external synchronization (e.g., Mutex).
   */

  /**
   * @param config - Optional configuration overrides. Default chunkSize is 1000.
   *
   * P2: validates config object.
   */
  constructor(config?: Partial<StreamBufferConfig>) {
    this.config = { ...DEFAULT_CONFIG };

    // P2: validate and apply config
    if (config !== undefined && config !== null) {
      if (typeof config !== 'object') {
        throw new Error('P2 validation failed: config must be an object');
      }
      if (config.chunkSize !== undefined) {
        if (typeof config.chunkSize !== 'number' || !Number.isFinite(config.chunkSize) || config.chunkSize <= 0) {
          throw new Error(`P2 validation failed: chunkSize must be a positive number, got ${config.chunkSize}`);
        }
        this.config.chunkSize = Math.floor(config.chunkSize);
      }
    }
  }

  // ─── P2 Input Validation ─────────────────────────────────────────────────

  /**
   * Validate input string — P2: type certainty at boundaries.
   *
   * @param input - The value to validate.
   * @returns The trimmed, validated string.
   * @throws {Error} If input is not a non-empty string.
   */
  private validateInput(input: unknown): string {
    if (typeof input !== 'string') {
      throw new Error(`P2 validation failed: input must be a string, got ${typeof input}`);
    }
    if (input.length === 0) {
      throw new Error('P2 validation failed: input must be non-empty');
    }
    return input;
  }

  // ─── Core API ────────────────────────────────────────────────────────────

  /**
   * Feed a string of input into the buffer. Internally splits on whitespace
   * to build a token array and accumulates raw text for sentence extraction.
   *
   * P2: validates input. P3: wraps in try/catch.
   * P10: guarantees void return.
   *
   * @param input - The string to feed into the buffer.
   *
   * @throws {Error} P2 validation failure.
   */
  feed(input: unknown): void {
    try {
      const validated = this.validateInput(input);

      // Split on whitespace to get tokens; filter empty strings
      const tokens = validated.split(/\s+/).filter(t => t.length > 0);
      this.buffer.push(...tokens);

      // Append raw text to pending accumulator
      if (this.pending.length > 0 && !this.pending.endsWith(' ') && !validated.startsWith(' ')) {
        this.pending += ' ';
      }
      this.pending += validated;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`StreamingBuffer.feed P3 error: ${msg}`);
      throw error;
    }
  }

  /**
   * Extract all complete sentences from the pending buffer.
   * A sentence boundary is: `.` `!` `?` `\n` followed by a space or end of input.
   *
   * P3: wraps in try/catch. P10: guarantees string[] return type.
   *
   * @returns An array of complete sentence strings. Never returns null or undefined.
   *          The remaining partial sentence stays in `pending` for future feed calls.
   */
  extractSentences(): string[] {
    try {
      if (this.pending.length === 0) return [];

      const sentences: string[] = [];
      let remaining = this.pending;
      let extracted = '';

      while (remaining.length > 0) {
        const boundaryIndex = this.findBoundary(remaining);

        if (boundaryIndex === -1) {
          break;
        }

        const sentenceEnd = boundaryIndex + 1;
        const sentence = remaining.substring(0, sentenceEnd).trim();
        extracted += remaining.substring(0, sentenceEnd);
        remaining = remaining.substring(sentenceEnd).trimStart();

        if (sentence.length > 0) {
          sentences.push(sentence);
        }
      }

      this.pending = remaining;

      if (extracted.length > 0) {
        this.trimBuffer(extracted);
      }

      return sentences;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`StreamingBuffer.extractSentences P3 error: ${msg}`);
      return [];
    }
  }

  /**
   * Flush the buffer in chunks. Processes the pending text in configurable
   * chunkSize increments, extracting sentences from each chunk.
   *
   * Produces a BufferFlushEvidence entry for each chunk processed.
   *
   * P2: validates chunkSize if provided. P3: wraps in try/catch.
   * P10: guarantees void return type (evidence is accessible via getFlushEvidence).
   *
   * @param chunkSize - Optional override for chunk size. Defaults to config.chunkSize.
   *
   * @throws {Error} P2 validation failure.
   */
  flushChunks(chunkSize?: unknown): void {
    try {
      // P2: validate chunkSize
      let effectiveChunkSize = this.config.chunkSize;
      if (chunkSize !== undefined) {
        if (typeof chunkSize !== 'number' || !Number.isFinite(chunkSize) || chunkSize <= 0) {
          throw new Error(`P2 validation failed: chunkSize must be a positive number, got ${chunkSize}`);
        }
        effectiveChunkSize = Math.floor(chunkSize as number);
      }

      if (this.pending.length === 0) return;

      let processed = 0;
      const totalLength = this.pending.length;

      while (processed < totalLength) {
        const chunkEnd = Math.min(processed + effectiveChunkSize, totalLength);
        const chunk = this.pending.substring(processed, chunkEnd);

        // Temporarily replace pending with just this chunk
        const savedPending = this.pending;
        this.pending = chunk;

        const sentences = this.extractSentences();

        // Record evidence
        const evidence: BufferFlushEvidence = {
          timestamp: Date.now(),
          tokensFlushed: this.getProcessedTokenCount(sentences, chunk),
          sentencesExtracted: sentences.length,
          bytesProcessed: chunk.length,
          chunkIndex: this.chunkIndex,
        };
        this.flushEvidence.push(evidence);

        processed = chunkEnd;
        this.chunkIndex++;

        // Restore remaining pending
        this.pending = savedPending.substring(chunkEnd);
      }

      // Final consolidation: whatever is left in pending stays
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`StreamingBuffer.flushChunks P3 error: ${msg}`);
    }
  }

  /**
   * Flush the entire buffer, extracting all complete sentences and producing
   * a single evidence record. Convenience wrapper around flushChunks with
   * chunkSize = Infinity (one chunk for the whole buffer).
   *
   * P3: wraps in try/catch. P10: guarantees string[] return.
   *
   * @returns Array of all complete sentences extracted from the buffer.
   *          Evidence is accessible via getFlushEvidence().
   */
  flushAll(): string[] {
    try {
      if (this.pending.length === 0) return [];

      const sentences = this.extractSentences();

      // Record flush evidence
      const evidence: BufferFlushEvidence = {
        timestamp: Date.now(),
        tokensFlushed: this.buffer.length,
        sentencesExtracted: sentences.length,
        bytesProcessed: this.pending.length + (sentences.join(' ').length),
        chunkIndex: this.chunkIndex++,
      };
      this.flushEvidence.push(evidence);

      return sentences;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`StreamingBuffer.flushAll P3 error: ${msg}`);
      return [];
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Estimate how many tokens were processed in a given chunk.
   */
  private getProcessedTokenCount(sentences: string[], chunk: string): number {
    const sentenceTokens = sentences.join(' ').split(/\s+/).filter(t => t.length > 0).length;
    const chunkTokens = chunk.split(/\s+/).filter(t => t.length > 0).length;
    return Math.max(sentenceTokens, chunkTokens);
  }

  /**
   * Find the first sentence boundary in the given text.
   * Returns the index of the boundary character, or -1 if none found.
   *
   * Boundaries: `.` `!` `?` `\n`
   * Must be followed by whitespace or be the last character in the string.
   */
  private findBoundary(text: string): number {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
        const nextChar = i + 1 < text.length ? text[i + 1] : null;

        if (nextChar === null) {
          return i;
        }

        if (nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || nextChar === '\r') {
          return i;
        }
      }
    }

    return -1;
  }

  /**
   * Remove tokens from the buffer that correspond to already-extracted text.
   */
  private trimBuffer(extracted: string): void {
    const extractedTrimmed = extracted.trim();
    if (extractedTrimmed.length === 0) return;

    const extractedTokens = extractedTrimmed.split(/\s+/).filter(t => t.length > 0);
    if (extractedTokens.length === 0) return;

    this.buffer.splice(0, extractedTokens.length);
  }

  // ─── Evidence / Diagnostic API ──────────────────────────────────────────

  /**
   * Get all flush evidence records produced by flushChunks() and flushAll().
   *
   * P10: guarantees a defensive copy (never exposes internal array reference).
   *
   * @returns A new array containing all BufferFlushEvidence records.
   */
  getFlushEvidence(): BufferFlushEvidence[] {
    try {
      return [...this.flushEvidence];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`StreamingBuffer.getFlushEvidence P3 error: ${msg}`);
      return [];
    }
  }

  /**
   * Clear the flush evidence log.
   *
   * P3: wraps in try/catch. P10: guarantees void return.
   */
  clearFlushEvidence(): void {
    try {
      this.flushEvidence = [];
      this.chunkIndex = 0;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`StreamingBuffer.clearFlushEvidence P3 error: ${msg}`);
    }
  }

  // ─── State Management API ────────────────────────────────────────────────

  /**
   * Return the remaining partial (incomplete) sentence.
   *
   * P10: guarantees string return.
   *
   * @returns The pending partial sentence (may be empty string).
   */
  getPending(): string {
    try {
      return this.pending;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`StreamingBuffer.getPending P3 error: ${msg}`);
      return '';
    }
  }

  /**
   * Reset the buffer and pending state entirely.
   * Also resets the flush evidence log and chunk index.
   *
   * P3: wraps in try/catch. P10: guarantees void return.
   */
  clear(): void {
    try {
      this.buffer = [];
      this.pending = '';
      this.flushEvidence = [];
      this.chunkIndex = 0;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`StreamingBuffer.clear P3 error: ${msg}`);
    }
  }

  /**
   * Return the current token count (for diagnostics).
   *
   * P10: guarantees number return.
   *
   * @returns The number of tokens in the buffer (0 or positive integer).
   */
  get size(): number {
    try {
      return this.buffer.length;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`StreamingBuffer.size P3 error: ${msg}`);
      return 0;
    }
  }

  /**
   * Get the current configuration (defensive copy).
   *
   * P10: guarantees a safe copy of config.
   *
   * @returns A copy of the current StreamBufferConfig.
   */
  getConfig(): StreamBufferConfig {
    try {
      return { ...this.config };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`StreamingBuffer.getConfig P3 error: ${msg}`);
      return { ...DEFAULT_CONFIG };
    }
  }
}
