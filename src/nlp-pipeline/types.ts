/**
 * NLP Pipeline types — shared types for tokenizer and intent processor.
 * These wrap and re-export from the existing Karpathy module with cleaner interfaces.
 */

import type { IntentCategory } from '../shark/karpathy/verb-frame-lexicon.js';

/**
 * A single token produced by the tokenizer
 */
export interface Token {
  value: string;
  index: number;
  type: 'word' | 'whitespace' | 'punctuation' | 'sentence-boundary';
}

/**
 * Classification result from the intent processor
 */
export interface NlpIntent {
  category: IntentCategory;
  action: string;
  target: string;
  confidence: number;
  enforcement: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | 'PASS';
  violation?: string;
  correction?: string;
}

/**
 * Analysis result from the tokenizer
 */
export interface TokenizerResult {
  tokens: Token[];
  sentences: string[];
  tokenCount: number;
  sentenceCount: number;
}

/**
 * Configuration for the NLP pipeline
 */
export interface NlpPipelineConfig {
  basePath?: string;
  gate?: string;
  debug?: boolean;
}

/**
 * Evidence entry produced by the NLP pipeline
 */
export interface NlpEvidenceEntry {
  timestamp: string;
  type: 'tokenization' | 'intent-classification' | 'frame-matching';
  input: string;
  result: Record<string, unknown>;
  confidence: number;
}
