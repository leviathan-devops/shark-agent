/**
 * Karpathy 2.0 Frontal Lobe — Main module exports.
 *
 * Provides StreamingBuffer, VerbFrameLexicon, IntentClassifier, and IntentFSM
 * for deterministic intent detection and enforcement in the Shark v4.9
 * 2-Lobe Execution Brain.
 *
 * T3 UPGRADE: Exports new SemanticRole, FrameSlot, VerbFrame, FrameMatch,
 * FrameEvidence, StreamBufferConfig, and BufferFlushEvidence types.
 */

export { StreamingBuffer } from './streaming-buffer.js';
export type {
  StreamBufferConfig,
  BufferFlushEvidence,
} from './streaming-buffer.js';

export {
  VerbFrameLexicon,
} from './verb-frame-lexicon.js';
export type {
  IntentCategory,
  SemanticFrame,
  SemanticRole,
  FrameSlot,
  VerbFrame,
  FrameMatch,
  FrameEvidence,
} from './verb-frame-lexicon.js';

export {
  IntentClassifier,
} from './intent-classifier.js';
export type {
  EnforcementLevel,
  GatePhase,
  IntentResult,
} from './intent-classifier.js';

export { IntentFSM } from './fsm.js';
export type {
  FSMState,
  FSMEvent,
  FSMTransition,
  EvidenceRecord,
} from './fsm.js';
