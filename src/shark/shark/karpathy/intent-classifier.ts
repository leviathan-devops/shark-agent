/**
 * IntentClassifier v2.0 — T3 Knowledge Base Aligned
 * ==================================================
 *
 * Dual-mode classifier for NL input (classify) and tool calls (classifyToolCall)
 * with gate enforcement matrix, bash command evaluation, evidence production,
 * failure-mode-first design, and the 7-question engineering mindset.
 *
 * Pure TypeScript, zero NLP dependencies, deterministic, no LLM calls.
 *
 * ─── EXTERNAL API ───────────────────────────────────────────────────────────
 *
 * ## Public Methods
 *
 * ### `classify(input: string): IntentResult`
 *   Classifies natural language input into an IntentResult.
 *   - **Input:** `string` — raw NL text (may contain partial/incomplete sentences)
 *   - **Output:** `IntentResult` — always returned, never null. If no intent can
 *     be determined, returns `{ intent: 'QUERY', action: 'unknown', target: '',
 *     confidence: 0, enforcement: 'PASS' }`.
 *   - **Error states:**
 *     - Empty input → returns fallback QUERY with confidence 0
 *     - No verb match → returns QUERY with raw text as action, confidence 0.3
 *     - Null/undefined input → returns fallback QUERY with confidence 0
 *   - **Example:**
 *     ```typescript
 *     const ic = new IntentClassifier();
 *     const result = ic.classify('delete the config file');
 *     // → { intent: 'DESTRUCTIVE', action: 'delete', target: 'the config file',
 *     //     confidence: 0.95, enforcement: 'BLOCK', violation: '...', correction: '...' }
 *     ```
 *
 * ### `classifyToolCall(toolName: string, args: Record<string, unknown>): IntentResult`
 *   Classifies intent from a tool call by tool name + arguments.
 *   - **Input:** `toolName: string, args: Record<string, unknown>`
 *   - **Output:** `IntentResult` — always returned. Unknown tools get EXECUTE/WARN.
 *   - **Error states:**
 *     - Empty toolName → returns EXECUTE/WARN fallback with confidence 0.4
 *     - Null args → treated as empty object, name-based classification still works
 *     - Unknown tool name → EXECUTE with WARN enforcement
 *   - **Example:**
 *     ```typescript
 *     const result = ic.classifyToolCall('bash', { command: 'rm -rf /' });
 *     // → { intent: 'EXECUTE', action: 'bash', target: 'rm -rf /',
 *     //     confidence: 0.9, enforcement: 'BLOCK', violation: '...', correction: '...' }
 *     ```
 *
 * ### `setGate(gate: GatePhase): void`
 *   Sets the current gate phase for enforcement decisions.
 *   - **Input:** `GatePhase` — one of 'PLAN'|'BUILD'|'TEST'|'VERIFY'|'AUDIT'|'DELIVERY'
 *   - **Output:** `void`
 *   - **Error states:**
 *     - Invalid gate value → silently ignored (state unchanged)
 *     - Undefined/null → silently ignored
 *
 * ### `getGate(): GatePhase`
 *   Returns the current gate phase.
 *   - **Input:** none
 *   - **Output:** `GatePhase`
 *   - **Error states:** none (always returns valid GatePhase)
 *
 * ### `getPending(): string`
 *   Returns unprocessed input remaining in the streaming buffer.
 *   - **Input:** none
 *   - **Output:** `string` — may be empty
 *   - **Error states:** none (always returns string)
 *
 * ### `clear(): void`
 *   Clears all internal state (buffer + evidence).
 *   - **Input:** none
 *   - **Output:** `void`
 *   - **Error states:** none (always succeeds)
 *
 * ### `getEvidenceLog(): EvidenceEntry[]`
 *   Returns a copy of the evidence log array.
 *   - **Input:** none
 *   - **Output:** `EvidenceEntry[]`
 *   - **Error states:** none (always returns array, possibly empty)
 *
 * ─── T3 KNOWLEDGE BASE ALIGNMENT ────────────────────────────────────────────
 *
 * This implementation follows the T3 engineering standards:
 * - P2 (Type Certainty): Input validation at every boundary
 * - P3 (Error Path Completeness): Every catch block has explicit handling
 * - P10 (Output Contract): Functions always return what they promise
 * - Evidence production: Every classification writes evidence
 * - Failure-mode-first: Pre-declare what can fail before implementing
 * - 7-question engineering: Each public method answers all 7 questions
 */

import { StreamingBuffer } from './streaming-buffer.js';
import { VerbFrameLexicon, type IntentCategory } from './verb-frame-lexicon.js';

// ─── TYPE EXPORTS ───────────────────────────────────────────────────────────

export type EnforcementLevel = 'BLOCK' | 'WARN' | 'PASS';
export type GatePhase = 'PLAN' | 'BUILD' | 'TEST' | 'VERIFY' | 'AUDIT' | 'DELIVERY';

export interface IntentResult {
  intent: IntentCategory;
  action: string;
  target: string;
  confidence: number;
  enforcement: EnforcementLevel;
  violation?: string;
  correction?: string;
}

export interface EvidenceEntry {
  inputHash: string;
  outputHash: string;
  intentFound: IntentCategory;
  confidence: number;
  timestamp: number;
  rawInput: string;
  source: 'classify' | 'classifyToolCall';
}

// ─── FALLBACK CONSTANTS ─────────────────────────────────────────────────────

/**
 * Fallback IntentResult returned when no intent can be determined.
 * Guarantees classify() and classifyToolCall() never return null (P10).
 */
// All 17 registered shark-* tools — prevents FSM from warning about legitimate tools
const KNOWN_SHARK_TOOLS = new Set([
  'shark-status', 'shark-gate', 'shark-evidence', 'shark-test-runner',
  'shark-checkpoint', 'shark-firewall-status', 'shark-firewall-audit',
  'shark-diagnose', 'shark-health', 'shark-spawn-container',
  'shark-run-trident', 'shark-hive-context', 'shark-checkpoint-history',
  'shark-audit', 'shark-browser', 'shark-vision', 'shark-browser-test',
]);

const FALLBACK_INTENT: IntentResult = {
  intent: 'QUERY',
  action: 'unknown',
  target: '',
  confidence: 0,
  enforcement: 'PASS',
};

/**
 * Gate enforcement matrix: maps (Category x GatePhase) → EnforcementLevel.
 */
const GATE_ENFORCEMENT_MATRIX: Record<IntentCategory, Record<GatePhase, EnforcementLevel>> = {
  DESTRUCTIVE: { PLAN: 'BLOCK', BUILD: 'WARN', TEST: 'BLOCK', VERIFY: 'BLOCK', AUDIT: 'BLOCK', DELIVERY: 'BLOCK' },
  CREATE: { PLAN: 'PASS', BUILD: 'PASS', TEST: 'PASS', VERIFY: 'PASS', AUDIT: 'PASS', DELIVERY: 'BLOCK' },
  READ: { PLAN: 'PASS', BUILD: 'PASS', TEST: 'PASS', VERIFY: 'PASS', AUDIT: 'PASS', DELIVERY: 'PASS' },
  MODIFY: { PLAN: 'WARN', BUILD: 'PASS', TEST: 'WARN', VERIFY: 'WARN', AUDIT: 'BLOCK', DELIVERY: 'BLOCK' },
  EXECUTE: { PLAN: 'WARN', BUILD: 'PASS', TEST: 'PASS', VERIFY: 'WARN', AUDIT: 'BLOCK', DELIVERY: 'WARN' },
  TEST: { PLAN: 'PASS', BUILD: 'PASS', TEST: 'PASS', VERIFY: 'PASS', AUDIT: 'BLOCK', DELIVERY: 'BLOCK' },
  CLAIM: { PLAN: 'WARN', BUILD: 'WARN', TEST: 'BLOCK', VERIFY: 'BLOCK', AUDIT: 'BLOCK', DELIVERY: 'BLOCK' },
  DEPLOY: { PLAN: 'BLOCK', BUILD: 'BLOCK', TEST: 'BLOCK', VERIFY: 'BLOCK', AUDIT: 'BLOCK', DELIVERY: 'WARN' },
  QUERY: { PLAN: 'PASS', BUILD: 'PASS', TEST: 'PASS', VERIFY: 'PASS', AUDIT: 'PASS', DELIVERY: 'PASS' },
};

/**
 * Known tool name → IntentCategory mapping for tool call classification.
 */
const TOOL_INTENT_MAP: Record<string, { category: IntentCategory; action: string }> = {
  write: { category: 'CREATE', action: 'write' },
  edit: { category: 'MODIFY', action: 'edit' },
  rename: { category: 'MODIFY', action: 'rename' },
  bash: { category: 'EXECUTE', action: 'bash' },
  glob: { category: 'READ', action: 'glob' },
  grep: { category: 'READ', action: 'grep' },
  read: { category: 'READ', action: 'read' },
  delete: { category: 'DESTRUCTIVE', action: 'delete' },
  remove: { category: 'DESTRUCTIVE', action: 'remove' },
  run: { category: 'EXECUTE', action: 'run' },
  test: { category: 'TEST', action: 'test' },
  build: { category: 'EXECUTE', action: 'build' },
  publish: { category: 'DEPLOY', action: 'publish' },
  deploy: { category: 'DEPLOY', action: 'deploy' },
  commit: { category: 'DEPLOY', action: 'commit' },
  push: { category: 'DEPLOY', action: 'push' },
  install: { category: 'CREATE', action: 'install' },
  query: { category: 'QUERY', action: 'query' },
  fetch: { category: 'QUERY', action: 'fetch' },
  task: { category: 'EXECUTE', action: 'task' },
  spawn: { category: 'EXECUTE', action: 'spawn' },
};

/**
 * Punctuation characters to strip from the end of words during verb extraction.
 */
const TRAILING_PUNCTUATION = ['.', ',', '!', '?', ';', ':', '"', "'", ')', ']', '}'];

/**
 * Valid gate phases for setGate validation.
 */
const VALID_GATES: GatePhase[] = ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT', 'DELIVERY'];

// ─── HELPER: Simple string hash for evidence ────────────────────────────────

/**
 * Compute a simple numeric hash (djb2) for a string.
 * Used for evidence fingerprinting, not cryptography.
 * Returns hex string of the hash.
 */
function simpleHash(input: string): string {
  try {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash) + input.charCodeAt(i);
      hash = hash & 0xFFFFFFFF;
    }
    return (hash >>> 0).toString(16);
  } catch (error) {
    console.error(`[IntentClassifier] simpleHash error: ${error instanceof Error ? error.message : String(error)}`);
    return '00000000';
  }
}

// ─── MAIN CLASS ─────────────────────────────────────────────────────────────

export class IntentClassifier {
  private buffer: StreamingBuffer;
  private lexicon: VerbFrameLexicon;
  private currentGate: GatePhase;
  private evidenceLog: EvidenceEntry[];

  constructor() {
    this.buffer = new StreamingBuffer();
    this.lexicon = new VerbFrameLexicon();
    this.currentGate = 'PLAN';
    this.evidenceLog = [];
  }

  // ╔═════════════════════════════════════════════════════════════════════════╗
  // ║  classify(input: string): IntentResult                                ║
  // ╚═════════════════════════════════════════════════════════════════════════╝
  //
  // ─── 7-Question Engineering Mindset ─────────────────────────────────────
  //
  // Q1: What does this function do?
  //     Feeds input text into a streaming buffer, extracts complete sentences,
  //     and classifies the first complete sentence's intent.
  //
  // Q2: What are the inputs?
  //     input: string — raw natural language text, possibly partial/multi-sentence.
  //
  // Q3: What are the outputs?
  //     IntentResult — always returned (never null, P10). If no complete sentence
  //     or no verb match: fallback QUERY with confidence 0.
  //
  // Q4: What can go wrong? (Failure modes)
  //     - input is null/undefined → TypeError from .feed() → must catch
  //     - input is empty → no sentences extracted → fallback
  //     - input is very long (>100K chars) → memory pressure → buffer handles it
  //     - sentence has no recognizable verb → QUERY with low confidence
  //     - buffer internal error → .feed() could throw → must catch
  //
  // Q5: How do we handle failures? (Failure-mode-first)
  //     - Null/undefined input → return fallback QUERY immediately
  //     - Empty input (after trim) → return fallback QUERY immediately
  //     - Buffer/lexicon errors → catch, log, return fallback QUERY
  //
  // Q6: What are the edge cases?
  //     - Input with only punctuation → normalizeWord strips it → fallback
  //     - Multiple sentences → only first is classified; rest stay in buffer
  //     - Input that exactly matches a blocked target → classified with BLOCK
  //     - Very long single word → tokenized but verb lookup may fail
  //
  // Q7: How do we verify it works?
  //     - Unit tests with known inputs → expected IntentResults
  //     - Evidence log confirms every classification
  //     - Never returns null for any input (test with random/empty/null)

  classify(input: string): IntentResult {
    if (typeof input !== 'string') {
      console.error(`[IntentClassifier] classify() received non-string input: ${typeof input}`);
      return this.createEvidenceEntry(FALLBACK_INTENT, '', 'classify');
    }

    const trimmedInput = input.trim();
    if (trimmedInput.length === 0) {
      return this.createEvidenceEntry(FALLBACK_INTENT, input, 'classify');
    }

    try {
      this.buffer.feed(input);
      const sentences = this.buffer.extractSentences();
      if (sentences.length === 0) {
        const partialResult: IntentResult = {
          intent: 'QUERY',
          action: trimmedInput.length > 80 ? trimmedInput.substring(0, 80) + '...' : trimmedInput,
          target: '',
          confidence: 0.1,
          enforcement: 'PASS',
        };
        return this.createEvidenceEntry(partialResult, input, 'classify');
      }

      const sentence = sentences[0];
      const result = this.classifySentence(sentence);
      return this.createEvidenceEntry(result, input, 'classify');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] classify() error: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        console.error(`[IntentClassifier] Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      return this.createEvidenceEntry(FALLBACK_INTENT, input, 'classify');
    }
  }

  // ╔═════════════════════════════════════════════════════════════════════════╗
  // ║  classifyToolCall(toolName, args): IntentResult                        ║
  // ╚═════════════════════════════════════════════════════════════════════════╝
  //
  // ─── 7-Question Engineering Mindset ─────────────────────────────────────
  //
  // Q1-Q7: see the full comment block in the actual file

  classifyToolCall(toolName: string, args: Record<string, unknown>): IntentResult {
    if (typeof toolName !== 'string') {
      console.error(`[IntentClassifier] classifyToolCall() received non-string toolName: ${typeof toolName}`);
      return this.createEvidenceEntry(
        { ...FALLBACK_INTENT, confidence: 0.4, enforcement: 'WARN', violation: `Invalid toolName type: ${typeof toolName}`, correction: 'Provide a valid string tool name' },
        String(toolName), 'classifyToolCall',
      );
    }

    const safeArgs: Record<string, unknown> = (typeof args === 'object' && args !== null) ? args : {};

    try {
      const normalizedTool = toolName.toLowerCase().trim();
      if (normalizedTool.length === 0) {
        return this.createEvidenceEntry(
          { intent: 'EXECUTE', action: 'unknown', target: '', confidence: 0.4, enforcement: 'WARN', violation: 'Empty tool name provided', correction: 'Provide a valid non-empty tool name' },
          toolName, 'classifyToolCall',
        );
      }

      const toolEntry = TOOL_INTENT_MAP[normalizedTool];
      if (!toolEntry) {
        return this.createEvidenceEntry(
          { intent: 'EXECUTE', action: normalizedTool, target: this.extractToolTarget(safeArgs), confidence: KNOWN_SHARK_TOOLS.has(normalizedTool) ? 0.9 : 0.4, enforcement: KNOWN_SHARK_TOOLS.has(normalizedTool) ? 'PASS' : 'WARN', violation: KNOWN_SHARK_TOOLS.has(normalizedTool) ? '' : `Unknown tool "${toolName}" — treating as EXECUTE with warning`, correction: KNOWN_SHARK_TOOLS.has(normalizedTool) ? '' : 'Verify the tool is safe to use in the current context' },
          `${toolName} ${JSON.stringify(safeArgs)}`, 'classifyToolCall',
        );
      }

      const category = toolEntry.category;
      const action = toolEntry.action;
      const target = this.extractToolTarget(safeArgs);
      let enforcement = this.getGateEnforcement(category);

      if (category === 'DESTRUCTIVE' || this.hasDestructiveArgs(normalizedTool, safeArgs)) {
        enforcement = 'BLOCK';
        return this.createEvidenceEntry(
          { intent: category, action, target, confidence: 0.95, enforcement, violation: `Tool "${toolName}" with destructive arguments is BLOCKED`, correction: 'Use a non-destructive approach or verify the target is safe' },
          `${toolName} ${JSON.stringify(safeArgs)}`, 'classifyToolCall',
        );
      }

      if (normalizedTool === 'bash' && typeof safeArgs.command === 'string') {
        const bashEnforcement = this.evaluateBashCommand(safeArgs.command);
        if (bashEnforcement !== 'PASS') {
          enforcement = bashEnforcement;
          return this.createEvidenceEntry(
            { intent: category, action, target: safeArgs.command.substring(0, 80), confidence: 0.9, enforcement, violation: bashEnforcement === 'BLOCK' ? 'Shell command blocked: contains dangerous pattern' : 'Shell command triggered warning', correction: 'Use targeted file operations instead of shell commands' },
            `${toolName} ${safeArgs.command}`, 'classifyToolCall',
          );
        }
      }

      if (normalizedTool === 'edit' && typeof safeArgs.oldString === 'string' && typeof safeArgs.newString === 'string') {
        if (safeArgs.oldString.length > 1000) {
          enforcement = 'WARN';
          return this.createEvidenceEntry(
            { intent: category, action, target, confidence: 0.8, enforcement, violation: 'Large edit operation may have unintended consequences', correction: 'Consider breaking the edit into smaller, targeted changes' },
            `${toolName} ${target}`, 'classifyToolCall',
          );
        }
      }

      let violation: string | undefined;
      let correction: string | undefined;
      if (enforcement === 'BLOCK') {
        violation = `Tool "${toolName}" (${category}) is BLOCKED in gate "${this.currentGate}"`;
        correction = `This tool is not permitted during the ${this.currentGate} phase`;
      } else if (enforcement === 'WARN') {
        violation = `Tool "${toolName}" (${category}) triggered a WARNING in gate "${this.currentGate}"`;
        correction = 'Proceed with caution — verify this action is necessary';
      }

      return this.createEvidenceEntry(
        { intent: category, action, target, confidence: 0.85, enforcement, violation, correction },
        `${toolName} ${JSON.stringify(safeArgs)}`, 'classifyToolCall',
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] classifyToolCall() error: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        console.error(`[IntentClassifier] Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      return this.createEvidenceEntry(
        { ...FALLBACK_INTENT, confidence: 0.4, enforcement: 'WARN', violation: `Internal classification error: ${errorMessage}`, correction: 'Retry the operation' },
        `${toolName} ${JSON.stringify(safeArgs)}`, 'classifyToolCall',
      );
    }
  }

  setGate(gate: GatePhase): void {
    if (typeof gate !== 'string') {
      console.error(`[IntentClassifier] setGate() received non-string gate: ${typeof gate}`);
      return;
    }
    if (!VALID_GATES.includes(gate as GatePhase)) {
      console.error(`[IntentClassifier] setGate() received invalid gate: "${gate}"`);
      return;
    }
    this.currentGate = gate;
  }

  getGate(): GatePhase {
    return this.currentGate;
  }

  getPending(): string {
    try {
      return this.buffer.getPending();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] getPending() error: ${errorMessage}`);
      return '';
    }
  }

  clear(): void {
    try {
      this.buffer.clear();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] buffer.clear() error: ${errorMessage}`);
    }
    this.evidenceLog = [];
  }

  getEvidenceLog(): EvidenceEntry[] {
    try {
      if (!Array.isArray(this.evidenceLog)) {
        console.error('[IntentClassifier] evidenceLog corrupted — not an array, resetting');
        this.evidenceLog = [];
        return [];
      }
      return [...this.evidenceLog];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] getEvidenceLog() error: ${errorMessage}`);
      return [];
    }
  }

  private classifySentence(sentence: string): IntentResult {
    if (typeof sentence !== 'string') {
      console.error(`[IntentClassifier] classifySentence() received non-string: ${typeof sentence}`);
      return { ...FALLBACK_INTENT };
    }
    const trimmed = sentence.trim();
    if (trimmed.length === 0) return { ...FALLBACK_INTENT };

    try {
      const verbResult = this.extractMainVerb(trimmed);
      if (!verbResult) {
        return { intent: 'QUERY', action: trimmed.length > 50 ? trimmed.substring(0, 50) + '...' : trimmed, target: '', confidence: 0.3, enforcement: 'PASS' };
      }

      const { verb, target } = verbResult;
      const frame = this.lexicon.lookup(verb);
      const category: IntentCategory = frame?.category ?? 'QUERY';
      let enforcement = this.getGateEnforcement(category);

      if (frame?.blockedTargets && frame.blockedTargets.length > 0 && target.length > 0) {
        try {
          if (this.lexicon.isBlocked(verb, target)) {
            enforcement = 'BLOCK';
            return { intent: category, action: verb, target, confidence: 0.95, enforcement, violation: `Target "${target}" is blocked for destructive action "${verb}"`, correction: 'Use a safe target path that is not in the blocked list' };
          }
        } catch (blockedError) {
          const errorMessage = blockedError instanceof Error ? blockedError.message : String(blockedError);
          console.error(`[IntentClassifier] isBlocked() check failed: ${errorMessage}`);
        }
      }

      let violation: string | undefined;
      let correction: string | undefined;
      if (enforcement === 'BLOCK') {
        violation = `Action "${verb}" (${category}) is BLOCKED in gate "${this.currentGate}"`;
        correction = `This action is not permitted during the ${this.currentGate} phase`;
        if (frame?.allowedGates && frame.allowedGates.length > 0) {
          correction += `. Allowed gates: ${frame.allowedGates.join(', ')}`;
        }
      } else if (enforcement === 'WARN') {
        violation = `Action "${verb}" (${category}) triggered a WARNING in gate "${this.currentGate}"`;
        correction = 'Proceed with caution — verify this action is necessary';
      }

      return { intent: category, action: verb, target, confidence: frame ? 0.9 : 0.5, enforcement, violation, correction };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] classifySentence() error: ${errorMessage}`);
      return { ...FALLBACK_INTENT };
    }
  }

  private extractMainVerb(sentence: string): { verb: string; target: string } | null {
    if (typeof sentence !== 'string') {
      console.error(`[IntentClassifier] extractMainVerb() received non-string: ${typeof sentence}`);
      return null;
    }
    try {
      const words = sentence.split(/\s+/).filter(w => w.length > 0);
      if (words.length === 0) return null;

      for (let i = 0; i < words.length; i++) {
        const normalized = this.normalizeWord(words[i]);
        if (this.lexicon.lookup(normalized)) {
          return { verb: normalized, target: words.slice(i + 1).join(' ') };
        }
        if (i + 1 < words.length) {
          const compound = `${normalized}:${this.normalizeWord(words[i + 1])}`;
          try {
            if (this.lexicon.lookup(compound)) {
              return { verb: compound, target: words.slice(i + 2).join(' ') };
            }
          } catch (compoundError) {
            const errorMessage = compoundError instanceof Error ? compoundError.message : String(compoundError);
            console.error(`[IntentClassifier] compound lookup error: ${errorMessage}`);
          }
        }
      }
      return { verb: this.normalizeWord(words[0]), target: words.slice(1).join(' ') };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] extractMainVerb() error: ${errorMessage}`);
      return null;
    }
  }

  private normalizeWord(word: string): string {
    if (typeof word !== 'string') {
      console.error(`[IntentClassifier] normalizeWord() received non-string: ${typeof word}`);
      return '';
    }
    try {
      let normalized = word.toLowerCase().trim();
      let changed = true;
      while (changed) {
        changed = false;
        for (const p of TRAILING_PUNCTUATION) {
          if (normalized.endsWith(p)) {
            normalized = normalized.substring(0, normalized.length - 1);
            changed = true;
            break;
          }
        }
      }
      return normalized;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] normalizeWord() error: ${errorMessage}`);
      return '';
    }
  }

  private getGateEnforcement(category: IntentCategory): EnforcementLevel {
    try {
      const gateMap = GATE_ENFORCEMENT_MATRIX[category];
      if (!gateMap) return 'PASS';
      return gateMap[this.currentGate] ?? 'PASS';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] getGateEnforcement() error: ${errorMessage}`);
      return 'PASS';
    }
  }

  private extractToolTarget(args: Record<string, unknown>): string {
    if (typeof args !== 'object' || args === null) return '';
    try {
      const targetKeys = ['filePath', 'path', 'target', 'file', 'command', 'url', 'package'];
      for (const key of targetKeys) {
        const value = args[key];
        if (typeof value === 'string' && value.length > 0) {
          return value.length > 80 ? value.substring(0, 80) + '...' : value;
        }
      }
      for (const value of Object.values(args)) {
        if (typeof value === 'string' && value.length > 0) {
          return value.length > 80 ? value.substring(0, 80) + '...' : value;
        }
      }
      return '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] extractToolTarget() error: ${errorMessage}`);
      return '';
    }
  }

  private hasDestructiveArgs(tool: string, args: Record<string, unknown>): boolean {
    if (typeof tool !== 'string') return false;
    if (typeof args !== 'object' || args === null) return false;
    try {
      if (typeof args.command === 'string') {
        const cmd = args.command.toLowerCase();
        const destructivePatterns = ['rm -rf', 'rm -r', 'rm --recursive', 'mkfs', 'format', 'dd if=', '> /dev/', 'chmod 000', 'chown -R'];
        for (const pattern of destructivePatterns) {
          if (cmd.includes(pattern)) return true;
        }
      }
      if (typeof args.filePath === 'string') {
        const fp = args.filePath.toLowerCase();
        const blockedPaths = ['/etc', '/boot', '/sys', '/proc', '/dev'];
        for (const bp of blockedPaths) {
          if (fp.startsWith(bp)) return true;
        }
      }
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] hasDestructiveArgs() error: ${errorMessage}`);
      return false;
    }
  }

  private evaluateBashCommand(command: string): EnforcementLevel {
    if (typeof command !== 'string') {
      console.error(`[IntentClassifier] evaluateBashCommand() received non-string: ${typeof command}`);
      return 'PASS';
    }
    try {
      const cmd = command.toLowerCase().trim();
      if (cmd.length === 0) return 'PASS';

      const blockPatterns = ['rm -rf /', 'rm -rf --no-preserve-root', ':(){ :|:& };:', '> /dev/sda', '> /dev/nvme', 'mkfs.', 'dd if=/dev/zero', 'chmod 000 /', 'chown -R 0:0 /', 'wget', 'curl'];
      for (const pattern of blockPatterns) {
        if (cmd.includes(pattern)) return 'BLOCK';
      }

      const warnPatterns = ['git push --force', 'git reset --hard', 'npm publish', 'npm run deploy', 'rm -rf', 'rm -r', 'kill -9', 'pkill', 'sudo', 'su ', '> ', '>> ', '| sh', '| bash', 'chmod', 'chown', 'docker rmi', 'docker rm', 'drop table', 'drop database'];
      for (const pattern of warnPatterns) {
        if (cmd.includes(pattern)) return 'WARN';
      }
      return 'PASS';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] evaluateBashCommand() error: ${errorMessage}`);
      return 'PASS';
    }
  }

  private createEvidenceEntry(result: IntentResult, rawInput: string, source: 'classify' | 'classifyToolCall'): IntentResult {
    try {
      if (typeof rawInput !== 'string') rawInput = String(rawInput);
      if (!result || typeof result !== 'object') {
        console.error('[IntentClassifier] createEvidenceEntry() received invalid result');
        return result ?? { ...FALLBACK_INTENT };
      }

      const entry: EvidenceEntry = {
        inputHash: simpleHash(rawInput),
        outputHash: simpleHash(JSON.stringify(result)),
        intentFound: result.intent,
        confidence: result.confidence,
        timestamp: Date.now(),
        rawInput: rawInput.length > 200 ? rawInput.substring(0, 200) + '...' : rawInput,
        source,
      };

      if (this.evidenceLog.length >= 10000) this.evidenceLog.shift();
      this.evidenceLog.push(entry);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[IntentClassifier] createEvidenceEntry() error: ${errorMessage}`);
    }
    return result;
  }
}
