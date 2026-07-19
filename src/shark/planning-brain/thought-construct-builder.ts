/**
 * ThoughtConstructBuilder — constructs ThoughtConstruct nodes from EXISTING NLP signals.
 *
 * This builder does NOT parse text with regex-based NLP. It CONSUMES the outputs of:
 *   - IntentClassifier  → intent category, action verb, confidence, enforcement level
 *   - VerbFrameLexicon  → deep semantic frame matching with role slot fillers
 *   - _nlpContext        → already attached to messages by the messages.transform hook
 *
 * Each message is transformed into a structured ThoughtConstruct node containing its
 * intent, enforcement level, frame match, semantic roles, and derived flags
 * (isClaim, isVerification, hasEvidence) — ready for consumption by reasoning graphs,
 * verification engines, and evidence tracking systems.
 *
 * KEY PRINCIPLE: Consume existing signals, don't build new parsing.
 * The IntentProcessor and VerbFrameLexicon are ALREADY initialized and ALREADY running
 * on every message. This builder reads their outputs and structures them into nodes.
 */

import { VerbFrameLexicon } from '../karpathy/verb-frame-lexicon.js';
import type { FrameMatch, SemanticRole, IntentCategory } from '../karpathy/verb-frame-lexicon.js';
import { getIntentProcessor } from '../../nlp-pipeline/intent-processor.js';
import type { NlpIntent } from '../../nlp-pipeline/types.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * The structural kind of a thought construct — derived deterministically from
 * the intent category (primary) and content markers (secondary overrides).
 */
export type ThoughtConstructKind =
  | 'claim' | 'question' | 'command' | 'reasoning' | 'verification'
  | 'planning' | 'error-report' | 'context-recall' | 'correction' | 'unknown';

/**
 * A structured node representing a single thought/message in the reasoning stream.
 * Built entirely from existing NLP signals — no new parsing introduced.
 */
export interface ThoughtConstruct {
  sequenceNumber: number;
  timestamp: number;
  messageRole: 'user' | 'assistant' | 'system';
  kind: ThoughtConstructKind;
  intentCategory: string;              // From IntentClassifier (IntentCategory)
  intentConfidence: number;            // 0-1 from IntentClassifier
  enforcement: string;                 // Enforcement level from gate matrix
  frameMatch: FrameMatch | null;       // From VerbFrameLexicon.matchVerb
  semanticRoles: Map<string, string>;  // Filled slots from frame match
  isClaim: boolean;
  isVerification: boolean;
  hasEvidence: boolean;
  claimText: string | null;
  targetEntity: string | null;
  referencesPriorMessage: number | null;
  referencesTask: string | null;
  referencesFile: string | null;
}

// ─── Deterministic kind classification Map ───────────────────────────────────
// Maps IntentCategory → ThoughtConstructKind. This is the PRIMARY signal.
// Content-based overrides are applied AFTER this lookup for edge-case kinds
// (reasoning, error-report, correction) that have no direct category mapping.

const CATEGORY_KIND_MAP: Record<IntentCategory, ThoughtConstructKind> = {
  CLAIM: 'claim',
  QUERY: 'question',
  READ: 'context-recall',
  EXPLORE: 'context-recall',
  TEST: 'verification',
  AUDIT: 'verification',
  EXECUTE: 'command',
  DESTRUCTIVE: 'command',
  CREATE: 'command',
  MODIFY: 'command',
  DEPLOY: 'command',
  MANAGE: 'planning',
};

// Content markers for kinds that have no direct IntentCategory mapping.
// Uses string.includes (NOT regex) per design constraint.
const REASONING_MARKERS = [
  'because', 'therefore', 'thus', 'hence', 'consequently', 'as a result',
  'this means', 'which means', 'so the', 'since the',
];
const ERROR_MARKERS = [
  'error', 'fail', 'exception', 'traceback', 'crash', 'panic',
  'undefined is not', 'cannot read', 'typeerror', 'null reference',
];
const CORRECTION_MARKERS = [
  'actually', 'wait, no', 'correction', 'sorry, i meant',
  'no, that', 'mistake', 'on second thought', 'i was wrong',
];

// Semantic roles to check for target entity extraction (in priority order).
const TARGET_ROLES: SemanticRole[] = ['patient', 'goal', 'source', 'recipient', 'location'];

// Fallback intent when IntentProcessor is unavailable.
const FALLBACK_INTENT: NlpIntent = {
  category: 'QUERY',
  action: 'unknown',
  target: '',
  confidence: 0,
  enforcement: 'PASS',
};

// Known source file extensions for file reference detection.
const SOURCE_EXTENSIONS = [
  '.ts', '.js', '.tsx', '.jsx', '.json', '.yaml', '.yml',
  '.md', '.py', '.sh', '.css', '.html', '.sql', '.env',
  '.toml', '.xml', '.cfg', '.conf', '.txt',
];

// Punctuation characters to strip from tokens during file reference detection.
const TOKEN_PUNCTUATION = ['(', ')', '{', '}', '[', ']', '"', "'", '`', ',', ';', ':'];

// ─── Message input shape ─────────────────────────────────────────────────────

/**
 * The message object accepted by the builder. The _nlpContext is attached
 * by the messages.transform hook and contains pre-classified intent data.
 */
export interface ThoughtMessage {
  role: string;
  content: string;
  _nlpContext?: { intent?: NlpIntent };
}

// ─── Builder Class ───────────────────────────────────────────────────────────

export class ThoughtConstructBuilder {
  private sequenceCounter = 0;
  private lexicon: VerbFrameLexicon | null;
  private basePath: string;

  /**
   * @param lexicon Optional VerbFrameLexicon for deep frame matching.
   *                If not provided, a new instance is created.
   * @param basePath Optional base path for locating TASK_QUEUE.md.
   *                 Defaults to process.cwd().
   */
  constructor(lexicon?: VerbFrameLexicon, basePath?: string) {
    this.lexicon = lexicon ?? new VerbFrameLexicon();
    this.basePath = basePath ?? process.cwd();
  }

  /**
   * Build a ThoughtConstruct from a message.
   *
   * Consumes _nlpContext if already attached; otherwise classifies via
   * the singleton IntentProcessor. Performs deep verb frame matching and
   * derives structural flags for downstream reasoning systems.
   *
   * @param message The message object (with optional _nlpContext).
   * @param gate    The current gate phase for enforcement decisions.
   * @returns A fully populated ThoughtConstruct.
   */
  build(message: ThoughtMessage, gate: string): ThoughtConstruct {
    const content = typeof message?.content === 'string' ? message.content : '';
    const role = this.normalizeRole(message?.role);
    const timestamp = Date.now();
    const sequenceNumber = ++this.sequenceCounter;

    // ── Step 1: Obtain intent — prefer _nlpContext, else classify ──────────
    let intent: NlpIntent;
    if (message?._nlpContext?.intent) {
      intent = message._nlpContext.intent;
    } else {
      intent = this.classifyViaProcessor(content, gate);
    }

    // ── Step 2: Extract first sentence ─────────────────────────────────────
    const firstSentence = this.extractFirstSentence(content);

    // ── Step 3: Deep verb frame matching ───────────────────────────────────
    const verb = intent.action && intent.action !== 'unknown' ? intent.action : null;
    let frameMatch: FrameMatch | null = null;
    if (this.lexicon && verb && firstSentence) {
      try {
        frameMatch = this.lexicon.matchVerb(verb, firstSentence);
      } catch {
        // P3 error containment — frame match failure is non-fatal
        frameMatch = null;
      }
    }

    // ── Step 4: Classify kind via deterministic Map + content overrides ────
    const kind = this.classifyKind(intent.category, frameMatch, role, content);

    // ── Step 5: Extract semantic roles from frame match fillers ────────────
    const semanticRoles: Map<string, string> = frameMatch
      ? new Map<string, string>(frameMatch.fillers as Map<string, string>)
      : new Map<string, string>();

    // ── Step 6: Derive structural flags ────────────────────────────────────
    const isClaim = intent.category === 'CLAIM';
    const isVerification = intent.category === 'TEST' || intent.category === 'AUDIT';

    // ── Step 7: Extract target entity from semantic roles ──────────────────
    const roleTarget = this.extractTarget(semanticRoles);
    const targetEntity = roleTarget ?? (intent.target || null);

    // ── Step 8: Find task and file references ──────────────────────────────
    const referencesTask = this.findTaskReference(content);
    const referencesFile = this.findFileReference(content);
    const referencesPriorMessage = null; // Requires multi-message context, set externally

    // ── Step 9: Derive hasEvidence from signals ────────────────────────────
    const hasEvidence = this.deriveHasEvidence(frameMatch, referencesFile, referencesTask);

    // ── Step 10: Extract claim text ────────────────────────────────────────
    const claimText = isClaim ? firstSentence : null;

    return {
      sequenceNumber,
      timestamp,
      messageRole: role,
      kind,
      intentCategory: intent.category,
      intentConfidence: intent.confidence,
      enforcement: intent.enforcement,
      frameMatch,
      semanticRoles,
      isClaim,
      isVerification,
      hasEvidence,
      claimText,
      targetEntity,
      referencesPriorMessage,
      referencesTask,
      referencesFile,
    };
  }

  /**
   * Reset the sequence counter (useful for testing).
   */
  reset(): void {
    this.sequenceCounter = 0;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Classify content via the singleton IntentProcessor.
   * Falls back to FALLBACK_INTENT if the processor is unavailable or input is empty.
   * P3: error containment — never throws.
   */
  private classifyViaProcessor(content: string, gate: string): NlpIntent {
    if (!content || content.trim().length === 0) {
      return { ...FALLBACK_INTENT };
    }
    try {
      const ip = getIntentProcessor();
      if (!ip) return { ...FALLBACK_INTENT };
      ip.setGate(gate);
      return ip.classify(content);
    } catch {
      return { ...FALLBACK_INTENT };
    }
  }

  /**
   * Normalize a message role string to 'user' | 'assistant' | 'system'.
   * P2: handles unknown/missing roles gracefully.
   */
  private normalizeRole(role: unknown): 'user' | 'assistant' | 'system' {
    if (role === 'user' || role === 'assistant' || role === 'system') return role;
    if (typeof role === 'string') {
      const lower = role.toLowerCase();
      if (lower === 'user' || lower === 'human') return 'user';
      if (lower === 'assistant' || lower === 'ai' || lower === 'model') return 'assistant';
    }
    return 'system';
  }

  /**
   * Extract the first sentence from content.
   * Uses character scanning for determinism — no regex.
   * Caps at 200 characters to bound memory.
   */
  private extractFirstSentence(content: string): string {
    if (!content || content.length === 0) return '';
    const trimmed = content.trim();
    if (trimmed.length === 0) return '';

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      const isBoundary = ch === '.' || ch === '!' || ch === '?';
      if (!isBoundary) continue;

      // Boundary at end of string → return everything up to and including it
      if (i + 1 >= trimmed.length) {
        return trimmed.substring(0, i + 1).trim();
      }
      // Boundary followed by whitespace → sentence ends here
      const next = trimmed[i + 1];
      if (next === ' ' || next === '\n' || next === '\t' || next === '\r') {
        return trimmed.substring(0, i + 1).trim();
      }
    }
    // No sentence boundary found — return whole trimmed content (capped)
    return trimmed.length > 200 ? trimmed.substring(0, 200) : trimmed;
  }

  /**
   * Classify the ThoughtConstructKind from intent category + frame + role + content.
   *
   * Primary: deterministic Map<IntentCategory, kind>.
   * Overrides: content-based markers for kinds with no category mapping
   * (reasoning, error-report, correction). Uses string.includes only.
   */
  private classifyKind(
    category: string,
    frame: FrameMatch | null,
    role: 'user' | 'assistant' | 'system',
    content: string,
  ): ThoughtConstructKind {
    // Primary: Map lookup
    const cat = category as IntentCategory;
    let kind: ThoughtConstructKind = CATEGORY_KIND_MAP[cat] ?? 'unknown';

    // No content to override with
    if (!content || content.length === 0) return kind;

    const lower = content.toLowerCase();

    // Override 1: error-report — detect error language (applies to any base kind)
    if (ERROR_MARKERS.some((m) => lower.includes(m))) {
      kind = 'error-report';
    }

    // Override 2: correction — detect self-correction language
    if (CORRECTION_MARKERS.some((m) => lower.includes(m))) {
      kind = 'correction';
    }

    // Override 3: reasoning — assistant expressing causal reasoning
    // Only applies if base kind is 'question', 'claim', or 'unknown'
    if (role === 'assistant' && (kind === 'question' || kind === 'claim' || kind === 'unknown')) {
      if (REASONING_MARKERS.some((m) => lower.includes(m))) {
        kind = 'reasoning';
      }
    }

    // Refinement: if frame match indicates verification context (TEST actionType)
    // but category was QUERY, prefer verification
    if (frame?.frame?.actionType === 'TEST' && kind === 'question') {
      kind = 'verification';
    }

    return kind;
  }

  /**
   * Extract the target entity from filled semantic roles.
   * Checks patient, goal, source, recipient, location in priority order.
   */
  private extractTarget(roles: Map<string, string>): string | null {
    for (const roleKey of TARGET_ROLES) {
      const value = roles.get(roleKey);
      if (value && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  }

  /**
   * Find a task reference in content by reading TASK_QUEUE.md and checking
   * if content includes any task identifier found in the queue.
   * Uses string.includes (NOT regex) per design constraint.
   *
   * @returns The matched task identifier, or null if none found.
   */
  private findTaskReference(content: string): string | null {
    if (!content || content.length === 0) return null;

    let queueContent: string;
    try {
      const queuePath = path.join(this.basePath, 'TASK_QUEUE.md');
      if (!fs.existsSync(queuePath)) return null;
      queueContent = fs.readFileSync(queuePath, 'utf-8');
    } catch {
      return null;
    }

    // Extract task identifiers from TASK_QUEUE.md via character scanning.
    // Looks for tokens like "T001", "TASK-001", "WAVE-1" — no regex.
    const lines = queueContent.split('\n');
    for (const line of lines) {
      const tokens = line.split(' ');
      for (const rawToken of tokens) {
        const candidate = this.extractTaskId(rawToken);
        if (candidate && candidate.length >= 3 && content.includes(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  /**
   * Extract a task ID from a raw token using character-by-character scanning.
   * Recognized formats: T### (T + digits), TASK-###, WAVE-###.
   * Returns null if the token is not a task identifier.
   */
  private extractTaskId(token: string): string | null {
    // Strip leading/trailing non-alphanumeric characters
    let start = 0;
    let end = token.length;
    while (start < end && !this.isAlnum(token[start])) start++;
    while (end > start && !this.isAlnum(token[end - 1])) end--;
    const cleaned = token.substring(start, end);
    if (cleaned.length < 3) return null;

    // Format 1: T followed by 1-4 digits (e.g. T001, T42)
    if (cleaned[0] === 'T' && cleaned.length >= 2) {
      let allDigits = true;
      for (let i = 1; i < cleaned.length && i <= 5; i++) {
        if (cleaned[i] < '0' || cleaned[i] > '9') {
          allDigits = false;
          break;
        }
      }
      if (allDigits) return cleaned;
    }

    // Format 2: TASK- or WAVE- prefix
    if (cleaned.startsWith('TASK-') || cleaned.startsWith('WAVE-')) {
      return cleaned;
    }

    return null;
  }

  /**
   * Check if a character is alphanumeric (a-z, A-Z, 0-9, or hyphen).
   */
  private isAlnum(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return (
      (code >= 48 && code <= 57) ||  // 0-9
      (code >= 65 && code <= 90) ||  // A-Z
      (code >= 97 && code <= 122) || // a-z
      code === 45                    // hyphen
    );
  }

  /**
   * Find a file reference in content by detecting path-like strings.
   * Uses the path module for validation. Does NOT use regex.
   *
   * @returns The first file path found, or null if none.
   */
  private findFileReference(content: string): string | null {
    if (!content || content.length === 0) return null;

    const tokens = content.split(' ');
    for (const token of tokens) {
      const cleaned = this.stripPunctuation(token).trim();
      if (cleaned.length < 3) continue;

      // Check 1: Absolute path (starts with /)
      if (path.isAbsolute(cleaned)) {
        return cleaned;
      }

      // Check 2: Relative path with extension (./foo/bar.ts, ../lib.ts)
      if (cleaned.startsWith('./') || cleaned.startsWith('../')) {
        return cleaned;
      }

      // Check 3: File with extension and path separator, or known source file
      const ext = path.extname(cleaned);
      if (ext && ext.length >= 2 && ext.length <= 6) {
        if (cleaned.includes('/') || cleaned.includes('\\') || this.isLikelySourceFile(cleaned)) {
          return cleaned;
        }
      }
    }
    return null;
  }

  /**
   * Strip wrapping punctuation characters from a token.
   * Uses character-by-character scanning — no regex.
   */
  private stripPunctuation(token: string): string {
    let result = '';
    for (const ch of token) {
      if (!TOKEN_PUNCTUATION.includes(ch)) {
        result += ch;
      }
    }
    return result;
  }

  /**
   * Check if a filename looks like a source file by its extension.
   */
  private isLikelySourceFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return SOURCE_EXTENSIONS.includes(ext);
  }

  /**
   * Derive hasEvidence flag from frame match and reference signals.
   *
   * A construct has evidence if:
   *   - It has a frame match with confidence >= 0.5 (structural understanding), OR
   *   - It references a specific file (cites an artifact), OR
   *   - It references a specific task (tied to tracked work)
   */
  private deriveHasEvidence(
    frameMatch: FrameMatch | null,
    fileRef: string | null,
    taskRef: string | null,
  ): boolean {
    if (frameMatch && frameMatch.confidence >= 0.5) return true;
    if (fileRef !== null) return true;
    if (taskRef !== null) return true;
    return false;
  }
}
