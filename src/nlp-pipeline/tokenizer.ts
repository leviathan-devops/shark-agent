import { StreamingBuffer } from '../shark/karpathy/streaming-buffer.js';
import type { Token, TokenizerResult } from './types.js';

/**
 * Tokenizer — deterministic, regex-based tokenizer wrapping the existing StreamingBuffer.
 *
 * Splits input text into tokens and sentences using whitespace and sentence
 * boundary detection. No external dependencies, pure TypeScript.
 */
export class Tokenizer {
  private buffer: StreamingBuffer;

  constructor() {
    this.buffer = new StreamingBuffer({ chunkSize: 10000 });
  }

  /**
   * Feed text into the tokenizer buffer and return tokens.
   */
  feed(input: string): Token[] {
    this.buffer.feed(input);
    return this.tokenize(input);
  }

  /**
   * Tokenize a string into tokens using whitespace splitting
   * and sentence boundary detection.
   */
  tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    const parts = input.split(/(\s+)/);
    let index = 0;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      if (/^\s+$/.test(part)) {
        tokens.push({ value: part, index, type: 'whitespace' });
      } else if (/^[.!?]+$/.test(part)) {
        tokens.push({ value: part, index, type: 'punctuation' });
        tokens.push({ value: '\n', index: -1, type: 'sentence-boundary' });
      } else {
        tokens.push({ value: part, index, type: 'word' });
      }
      index++;
    }

    return tokens;
  }

  /**
   * Extract sentences from the current buffer.
   */
  extractSentences(): string[] {
    return this.buffer.extractSentences();
  }

  /**
   * Get a complete analysis result including tokens, sentences, and counts.
   */
  analyze(input: string): TokenizerResult {
    const tokens = this.feed(input);
    const sentences = this.extractSentences();

    return {
      tokens,
      sentences,
      tokenCount: tokens.filter(t => t.type === 'word').length,
      sentenceCount: sentences.length,
    };
  }

  /**
   * Clear the internal buffer.
   */
  clear(): void {
    this.buffer.clear();
  }

  /**
   * Get the pending (unprocessed) text.
   */
  getPending(): string {
    return this.buffer.getPending();
  }
}

// ── Singleton ──────────────────────────────────────────────
let tokenizerSingleton: Tokenizer | null = null;
export function setTokenizer(t: Tokenizer): void { tokenizerSingleton = t; }
export function getTokenizer(): Tokenizer | null { return tokenizerSingleton; }
