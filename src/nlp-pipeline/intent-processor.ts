import { IntentClassifier, type GatePhase } from '../shark/karpathy/intent-classifier.js';
import { VerbFrameLexicon } from '../shark/karpathy/verb-frame-lexicon.js';
import type { NlpIntent, NlpPipelineConfig, NlpEvidenceEntry } from './types.js';
import type { IntentCategory } from '../shark/karpathy/verb-frame-lexicon.js';

/**
 * IntentProcessor — deterministic intent classifier wrapping the existing
 * IntentClassifier and VerbFrameLexicon from the Karpathy module.
 *
 * Provides a clean public API for intent classification with zero dependencies
 * on enforcement brain internals.
 */
export class IntentProcessor {
  private classifier: IntentClassifier;
  private lexicon: VerbFrameLexicon;
  private evidenceLog: NlpEvidenceEntry[] = [];
  private currentGate: string = 'PLAN';
  private debug: boolean;

  constructor(config: NlpPipelineConfig = {}) {
    this.classifier = new IntentClassifier();
    this.lexicon = new VerbFrameLexicon();
    this.debug = config.debug || false;

    if (config.gate) {
      this.currentGate = config.gate;
      this.classifier.setGate(config.gate as GatePhase);
    }
  }

  /**
   * Classify a natural language input string.
   */
  classify(input: string): NlpIntent {
    const result = this.classifier.classify(input);

    const intent: NlpIntent = {
      category: result.intent,
      action: result.action,
      target: result.target,
      confidence: result.confidence ?? 1.0,
      enforcement: result.enforcement,
      violation: result.violation,
      correction: result.correction,
    };

    if (this.debug) {
      this.evidenceLog.push({
        timestamp: new Date().toISOString(),
        type: 'intent-classification',
        input,
        result: intent as unknown as Record<string, unknown>,
        confidence: intent.confidence,
      });
    }

    return intent;
  }

  /**
   * Classify a tool call by name and arguments.
   */
  classifyToolCall(toolName: string, args: Record<string, unknown>): NlpIntent {
    const result = this.classifier.classifyToolCall(toolName, args);

    const intent: NlpIntent = {
      category: result.intent,
      action: result.action,
      target: result.target,
      confidence: result.confidence ?? 1.0,
      enforcement: result.enforcement,
      violation: result.violation,
      correction: result.correction,
    };

    if (this.debug) {
      this.evidenceLog.push({
        timestamp: new Date().toISOString(),
        type: 'intent-classification',
        input: `${toolName}: ${JSON.stringify(args)}`,
        result: intent as unknown as Record<string, unknown>,
        confidence: intent.confidence,
      });
    }

    return intent;
  }

  /**
   * Match a verb against the verb frame lexicon.
   */
  matchVerb(verb: string, sentence: string) {
    return this.lexicon.matchVerb(verb, sentence);
  }

  /**
   * Set the current gate phase for enforcement decisions.
   */
  setGate(gate: string): void {
    this.currentGate = gate;
    this.classifier.setGate(gate as GatePhase);
  }

  /**
   * Get the current gate phase.
   */
  getGate(): string {
    return this.currentGate;
  }

  /**
   * Get the evidence log for debugging.
   */
  getEvidenceLog(): NlpEvidenceEntry[] {
    return [...this.evidenceLog];
  }

  /**
   * Clear the evidence log.
   */
  clearEvidenceLog(): void {
    this.evidenceLog = [];
  }
}

// ── Singleton ──────────────────────────────────────────────
let intentProcessorSingleton: IntentProcessor | null = null;
export function setIntentProcessor(ip: IntentProcessor): void { intentProcessorSingleton = ip; }
export function getIntentProcessor(): IntentProcessor | null { return intentProcessorSingleton; }
