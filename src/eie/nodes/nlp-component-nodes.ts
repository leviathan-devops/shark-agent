/**
 * src/eie/nodes/nlp-component-nodes.ts — 15 Deterministic NLP Pipeline Nodes
 *
 * From KB-07:
 * - Deterministic tokeniser (regex, no ML)
 * - Deterministic dependency parser (grammar rules, no ML)
 * - Subject-Verb-Object extraction
 * - Verb → action-frame matching
 * - Intent classification via FSM
 * - Named Entity Recognition (file/tool/gate names)
 * - Sentiment (confident vs uncertain language)
 * - Temporal expression extraction
 * - Coreference resolution
 * - Claim / commitment / question / negation detection
 * - The Deterministic Guarantee (no ML models, regex + grammar only)
 *
 * Source: KB-07_DETERMINISTIC_NLP.md
 *
 * INVARIANT: Every node in this file is severity 'guide', layer 5,
 * category 'nlp-component', source 'alg-sys'. The pipeline is 100%
 * deterministic — no probabilistic ML models are permitted anywhere
 * in the NLP subsystem (see NLP-DETERMINISTIC-GUARANTEE).
 */

import type { KnowledgeNode } from '../types';

// ══ PIPELINE STAGES 1-3 (Tokenise → Parse → SVO) ══════════════

export const NLP_TOKENISER: KnowledgeNode = {
  id: 'NLP-TOKENISER',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'TOKENISER — Stage 1: Split raw input into tokens deterministically using a fixed regex grammar. No ML tokeniser, no BPE, no subword merges. Whitespace + punctuation + camelCase/snake_case boundaries only.',
  detectionMethod: 'Grep the NLP module for ML tokeniser imports (tiktoken, @xenova/transformers, openai.*token). Flag any non-regex tokenisation path.',
  fixTemplate: 'const TOKEN_RE = /[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z])|\\d+|[\\w]+/g; function tokenise(input: string): string[] { return input.match(TOKEN_RE) ?? []; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-TOKENISER: Stage 1 of deterministic pipeline. Regex-only, same output every run.',
  warheadTemplate: 'Deterministic tokenisation is the reproducibility root of the whole NLP pipeline. An ML tokeniser would make every downstream stage non-reproducible.',
  evidenceSpec: { id: 'nlp-tokeniser', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-DEPENDENCY-PARSE', 'NLP-DETERMINISTIC-GUARANTEE', 'IL10-EVIDENCE-IS-MECHANICAL'],
  selfVerified: true,
};

export const NLP_DEPENDENCY_PARSE: KnowledgeNode = {
  id: 'NLP-DEPENDENCY-PARSE',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'DEPENDENCY PARSE — Stage 2: Build a syntax tree from tokens using deterministic grammar rules (head/dependent edges). No neural parser (spaCy en_core_web_trf, stanza, transformers). Deterministic rules: subject→verb, verb→object, modifier→head.',
  detectionMethod: 'Grep for ML parser imports (spacy, stanza, transformers, @xenova/transformers, compromise-pluralise-ML). Flag any dependency edge produced by a model rather than a rule table.',
  fixTemplate: 'const GRAMMAR = { subject: /^(I|we|the agent|it)$/i, verb: /^(build|test|fix|deploy|verify)$/i, object: /^[A-Z_][\\w./-]*$/ }; function parse(tokens: string[]): DepEdge[] { /* rule-based head/dependent assignment */ }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-DEPENDENCY-PARSE: Stage 2. Rule-based syntax tree, no neural parser.',
  warheadTemplate: 'A non-deterministic parser returns different trees across runs on identical input, breaking claim/evidence reproducibility in the AUDIT gate.',
  evidenceSpec: { id: 'nlp-parse', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-TOKENISER', 'NLP-SVO-EXTRACTION', 'NLP-DETERMINISTIC-GUARANTEE'],
  selfVerified: true,
};

export const NLP_SVO_EXTRACTION: KnowledgeNode = {
  id: 'NLP-SVO-EXTRACTION',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'SVO EXTRACTION — Stage 3: Extract (Subject, Verb, Object) triples from the dependency tree. The subject is the nominal governor of the verb; the object is the verbal complement. Emit at most one SVO per finite clause.',
  detectionMethod: 'Audit the SVO extractor for cases where it returns multiple SVOs per clause or merges unrelated verbs. Flag any SVO whose subject/object cannot be traced to a parse-tree edge.',
  fixTemplate: 'function extractSVO(tree: DepTree): SVO[] { return tree.clauses.map(c => ({ subject: c.head("nsubj"), verb: c.head("root"), object: c.head("dobj") })); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-SVO-EXTRACTION: Stage 3. One SVO per clause, traced to parse edges.',
  warheadTemplate: 'SVO triples are the substrate for claim and commitment extraction. Ambiguous SVOs propagate as ambiguous claims into the AUDIT claim-reality check.',
  evidenceSpec: { id: 'nlp-svo', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-DEPENDENCY-PARSE', 'NLP-VERB-FRAME-MATCH', 'NLP-CLAIM-EXTRACTION'],
  selfVerified: true,
};

// ══ PIPELINE STAGES 4-5 (Frame match → Intent FSM) ════════════

export const NLP_VERB_FRAME_MATCH: KnowledgeNode = {
  id: 'NLP-VERB-FRAME-MATCH',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'VERB FRAME MATCH — Stage 4: Map each extracted verb to a fixed action frame (create, build, test, deploy, verify, fix, plan, debug, refactor). Use an exact-match verb table with stem normalisation; never a learned classifier.',
  detectionMethod: 'Inspect the verb→frame table. Flag verbs routed to multiple frames or frames selected by similarity score rather than exact key match.',
  fixTemplate: 'const VERB_FRAMES: Record<string, ActionFrame> = { build: "BUILD", built: "BUILD", test: "TEST", tested: "TEST", fix: "FIX", fixed: "FIX", verify: "VERIFY", deploy: "DEPLOY" }; const frame = VERB_FRAMES[stem(verb)] ?? "UNKNOWN";',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-VERB-FRAME-MATCH: Stage 4. Exact-match verb table, no embedding similarity.',
  warheadTemplate: 'Frames drive intent and commitment extraction. A similarity-scored frame match is non-deterministic and would flip intent labels across runs.',
  evidenceSpec: { id: 'nlp-frame', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-SVO-EXTRACTION', 'NLP-INTENT-FSM', 'NLP-CLAIM-EXTRACTION'],
  selfVerified: true,
};

export const NLP_INTENT_FSM: KnowledgeNode = {
  id: 'NLP-INTENT-FSM',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'INTENT FSM — Stage 5: Classify intent by walking a finite state machine over (frame, negation, question) signals. States are named (BUILD, TEST, DEBUG, DEPLOY, PLAN, QUERY). Transitions are a fixed table — no softmax, no logistic regression.',
  detectionMethod: 'Find intent code that branches on a probability threshold or calls a model. Flag any FSM transition function that takes a floating-point score.',
  fixTemplate: 'type IntentState = "BUILD"|"TEST"|"DEBUG"|"DEPLOY"|"PLAN"|"QUERY"; function classify(sigs: Signal[]): IntentState { let s: IntentState = "QUERY"; for (const sig of sigs) s = TRANSITIONS[s][sig]; return s; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-INTENT-FSM: Stage 5. Deterministic transition table, no probabilities.',
  warheadTemplate: 'Intent drives downstream engine routing. A probabilistic classifier could route the same sentence to different engines across runs, breaking audit reproducibility.',
  evidenceSpec: { id: 'nlp-intent-fsm', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-VERB-FRAME-MATCH', 'NLP-INTENT-CLASSIFICATION', 'NLP-NEGATION-DETECTION'],
  selfVerified: true,
};

// ══ PIPELINE STAGE 6 (NER) ════════════════════════════════════

export const NLP_NER: KnowledgeNode = {
  id: 'NLP-NER',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'NER — Named Entity Recognition: Tag file names, tool names, gate names, and error codes using deterministic regex gazetteers, not a neural NER model. File: /path/ or foo.ts. Tool: ts|tsc|bun|git|rg. Gate: PLAN|BUILD|VERIFY|TEST|AUDIT|DELIVERY. Error: TS\\d+.',
  detectionMethod: 'Grep for ML NER imports (spacy NER, transformers token-classification, @xenova/transformers ner). Flag entity spans produced by a model rather than a regex/gazetteer.',
  fixTemplate: 'const GAZETTEERS = { file: /[\\w-]+\\.[a-z]{1,4}/g, tool: /\\b(ts|tsc|bun|git|rg|npm)\\b/g, gate: /\\b(PLAN|BUILD|VERIFY|TEST|AUDIT|DELIVERY)\\b/g, error: /\\bTS\\d{4}\\b/g };',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-NER: Deterministic gazetteers for file/tool/gate/error entities.',
  warheadTemplate: 'Entities anchor claims to concrete artifacts (a file, a gate, a tool). A model-based NER would hallucinate spans and create phantom evidence references.',
  evidenceSpec: { id: 'nlp-ner', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-CLAIM-EXTRACTION', 'NLP-TEMPORAL', 'AP-EVIDENCE-FABRICATION'],
  selfVerified: true,
};

// ══ PIPELINE STAGE 7 (Sentiment) ══════════════════════════════

export const NLP_SENTIMENT: KnowledgeNode = {
  id: 'NLP-SENTIMENT',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'SENTIMENT — Confident vs Uncertain: Classify agent language confidence via a fixed lexicon (confident: done, built, fixed, verified, complete; uncertain: maybe, might, probably, I think, hopefully, seems). Binary classification by token-set intersection, not a sentiment model.',
  detectionMethod: 'Find sentiment code using a model (VADER transformer, HuggingFace sentiment). Flag confidence scores stored as floats rather than booleans.',
  fixTemplate: 'const CONFIDENT = new Set(["done","built","fixed","verified","complete"]); const UNCERTAIN = new Set(["maybe","might","probably","hopefully","seems"]); function sentiment(text: string): "confident"|"uncertain" { const t = new Set(tokenise(text)); return intersect(t, UNCERTAIN) > 0 ? "uncertain" : "confident"; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-SENTIMENT: Lexicon-based confident/uncertain, no model.',
  warheadTemplate: 'Confidence labels feed claim-reality scoring. A model sentiment score would drift across model versions, silently changing audit verdicts.',
  evidenceSpec: { id: 'nlp-sentiment', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-CLAIM-EXTRACTION', 'NLP-INTENT-CLASSIFICATION', 'AP-SUCCESS-CLAIM'],
  selfVerified: true,
};

// ══ PIPELINE STAGE 8 (Temporal) ═══════════════════════════════

export const NLP_TEMPORAL: KnowledgeNode = {
  id: 'NLP-TEMPORAL',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'TEMPORAL — Expression Extraction: Extract ordering cues (before, after, then, finally, next, once) and bind each to the nearest verb. Produces a partial ordering over actions. Pure regex + adjacency rule, no temporal ML model.',
  detectionMethod: 'Find temporal code using a dependency-tagger model. Flag temporal edges not anchored to a verb token.',
  fixTemplate: 'const TEMPORAL = /\\b(before|after|then|finally|next|once)\\b/gi; function temporals(tokens: string[]): TemporalEdge[] { /* bind each cue to nearest preceding verb */ }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-TEMPORAL: Regex cues + verb adjacency, no model.',
  warheadTemplate: 'Temporal ordering reconstructs the build-order the agent claims to have followed. Mistracking it lets the AUDIT gate accept out-of-order work as sequential.',
  evidenceSpec: { id: 'nlp-temporal', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-DEPENDENCY-PARSE', 'GK-AUDIT-BUILD-ORDER', 'IL19-GATE-ORDER-IMMUTABLE'],
  selfVerified: true,
};

// ══ PIPELINE STAGE 9 (Coreference) ════════════════════════════

export const NLP_COREFERENCE: KnowledgeNode = {
  id: 'NLP-COREFERENCE',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'COREFERENCE — Pronoun Resolution: Resolve it/that/this/these to the nearest preceding noun phrase of matching number, with a fallback to the previous SVO object. Rule-based, no neural coref model (no AllenNLP, no spanbert).',
  detectionMethod: 'Find coref code importing a neural model. Flag pronoun resolutions that cannot be traced to the previous noun phrase.',
  fixTemplate: 'function resolve(pronoun: "it"|"that"|"this"|"these", nouns: Noun[]): Noun { const num = (pronoun === "these") ? "plural" : "singular"; return nouns.filter(n => n.number === num).pop() ?? nouns[nouns.length - 1]; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-COREFERENCE: Rule-based pronoun→noun resolution, no model.',
  warheadTemplate: 'Coreference binds a vague pronoun ("it works") to a concrete noun. A model could resolve "it" differently across runs, flipping the claim target.',
  evidenceSpec: { id: 'nlp-coref', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-SVO-EXTRACTION', 'NLP-CLAIM-EXTRACTION', 'NLP-NEGATION-DETECTION'],
  selfVerified: true,
};

// ══ PIPELINE STAGE 10 (Intent Classification) ═════════════════

export const NLP_INTENT_CLASSIFICATION: KnowledgeNode = {
  id: 'NLP-INTENT-CLASSIFICATION',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'INTENT CLASSIFICATION: Produce the final intent label (BUILD | TEST | DEBUG | DEPLOY | PLAN) from the Intent FSM terminal state plus NER and sentiment signals. Single canonical label per utterance — no multi-label, no probability vector.',
  detectionMethod: 'Find intent output that is a Record<string, number> or returns argmax over scores. Flag any classification that emits ties or top-k.',
  fixTemplate: 'function classifyIntent(fsm: IntentState, ner: Entities, sent: Sentiment): Intent { /* deterministic combination; return one of 5 labels */ }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-INTENT-CLASSIFICATION: One canonical label per utterance, no scores.',
  warheadTemplate: 'The intent label selects which engine (BUILD vs AUDIT) processes the utterance. A probabilistic label would route the same utterance to different engines across runs.',
  evidenceSpec: { id: 'nlp-intent', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-INTENT-FSM', 'NLP-NER', 'NLP-SENTIMENT'],
  selfVerified: true,
};

// ══ PIPELINE STAGE 11 (Claim Extraction) ══════════════════════

export const NLP_CLAIM_EXTRACTION: KnowledgeNode = {
  id: 'NLP-CLAIM-EXTRACTION',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'CLAIM EXTRACTION: Extract past-tense factual claims ("built X", "fixed Y", "verified Z") from SVO triples whose verb is past-tense and sentiment is confident. Each claim binds to NER-resolved entities. Output is the input to the AUDIT claim-reality check.',
  detectionMethod: 'Inspect claim extractor for claims lacking entity binding, or claims extracted from present/future tense. Flag any claim whose evidence pointer is null.',
  fixTemplate: 'function extractClaims(svos: SVO[]): Claim[] { return svos.filter(s => isPastTense(s.verb)).map(s => ({ verb: s.verb, object: resolveEntity(s.object), tense: "past" })); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-CLAIM-EXTRACTION: Past-tense SVOs → entity-bound claims for AUDIT.',
  warheadTemplate: 'Claims are the unit of the claim-reality audit. An unbound claim ("it works") with no entity target cannot be mechanically verified and must be rejected.',
  evidenceSpec: { id: 'nlp-claim', verify: 'claim-reality', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-SVO-EXTRACTION', 'NLP-NER', 'NLP-COREFERENCE', 'GK-AUDIT-CLAIM-REALITY', 'IL11-OUTPUT-IS-PROOF'],
  selfVerified: true,
};

// ══ PIPELINE STAGE 12 (Commitment Extraction) ═════════════════

export const NLP_COMMITMENT_EXTRACTION: KnowledgeNode = {
  id: 'NLP-COMMITMENT-EXTRACTION',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'COMMITMENT EXTRACTION: Extract future commitments ("will X", "shall Y", "must do Z", "going to W") from SVO triples whose verb is modal-auxiliary future. Each commitment is logged for later verification that it was actually fulfilled.',
  detectionMethod: 'Inspect commitment extractor for commitments dropped or merged. Flag future-tense SVOs that did not produce a commitment record.',
  fixTemplate: 'const MODALS = /^(will|shall|must|going to|gonna)$/i; function extractCommitments(svos: SVO[]): Commitment[] { return svos.filter(s => MODALS.test(s.aux)).map(s => ({ verb: s.verb, object: resolveEntity(s.object), due: "next-turn" })); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-COMMITMENT-EXTRACTION: Modal-future SVOs → commitments logged for fulfilment check.',
  warheadTemplate: 'Commitments are the contract the agent signs with itself. Dropping a commitment silently is a torn-state failure of the agent\'s own plan.',
  evidenceSpec: { id: 'nlp-commitment', verify: 'claim-reality', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-CLAIM-EXTRACTION', 'NLP-NEGATION-DETECTION', 'FM04-TORN-STATE', 'IL02-CONTRACT-HONORED'],
  selfVerified: true,
};

// ══ PIPELINE STAGE 13 (Question Detection) ════════════════════

export const NLP_QUESTION_DETECTION: KnowledgeNode = {
  id: 'NLP-QUESTION-DETECTION',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'QUESTION DETECTION: Detect interrogative utterances (ends with "?", or starts with wh-word: what|why|how|when|where|who|which). Questions route to QUERY intent and must not be treated as claims or commitments.',
  detectionMethod: 'Find question detection that uses a classifier. Flag questions misrouted into claim/commitment extractors.',
  fixTemplate: 'const WH = /^(what|why|how|when|where|who|which)\\b/i; function isQuestion(text: string): boolean { return text.trimEnd().endsWith("?") || WH.test(text.trim()); }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-QUESTION-DETECTION: Punctuation + wh-word rule, routes to QUERY intent.',
  warheadTemplate: 'A question ("did the build succeed?") misclassified as a claim ("the build succeeded") would inject a false fact into the AUDIT reality ledger.',
  evidenceSpec: { id: 'nlp-question', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-INTENT-CLASSIFICATION', 'NLP-CLAIM-EXTRACTION', 'AP-EVIDENCE-FABRICATION'],
  selfVerified: true,
};

// ══ PIPELINE STAGE 14 (Negation Detection) ════════════════════

export const NLP_NEGATION_DETECTION: KnowledgeNode = {
  id: 'NLP-NEGATION-DETECTION',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'NEGATION DETECTION: Detect negation cues (not, never, don\'t, didn\'t, no, cannot, won\'t) and flip the polarity of the nearest following SVO/claim/commitment. Cues scope to the same clause; no cross-clause negation propagation.',
  detectionMethod: 'Find negation handling that scopes across sentence boundaries. Flag claims whose polarity was not inverted under a detected cue.',
  fixTemplate: 'const NEG = /\\b(not|never|don.t|didn.t|cannot|won.t|no)\\b/i; function polarity(text: string, svo: SVO): boolean { const cue = text.slice(0, svo.start).match(NEG); return cue ? !svo.basePolarity : svo.basePolarity; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-NEGATION-DETECTION: Clause-scoped cue flips claim/commitment polarity.',
  warheadTemplate: 'Missing a negation inverts a claim: a stated negative ("the build did NOT succeed") would be recorded as a positive assertion, a critical false positive in the AUDIT ledger.',
  evidenceSpec: { id: 'nlp-negation', verify: 'test-run', minQuality: 0.99 },
  severity: 'guide',
  layer: 5,
  links: ['NLP-CLAIM-EXTRACTION', 'NLP-COMMITMENT-EXTRACTION', 'NLP-INTENT-FSM', 'AP-EVIDENCE-FABRICATION'],
  selfVerified: true,
};

// ══ THE DETERMINISTIC GUARANTEE (Invariant) ═══════════════════

export const NLP_DETERMINISTIC_GUARANTEE: KnowledgeNode = {
  id: 'NLP-DETERMINISTIC-GUARANTEE',
  source: 'alg-sys',
  sourceFile: 'KB-07_DETERMINISTIC_NLP.md',
  category: 'nlp-component',
  rule: 'DETERMINISTIC GUARANTEE — INVARIANT: Every stage of the NLP pipeline (tokeniser → parse → SVO → frame → FSM → NER → sentiment → temporal → coref → intent → claim → commitment → question → negation) MUST be 100% deterministic. NO ML models, NO neural networks, NO embeddings, NO probabilistic classifiers. Regex + grammar + lookup tables only. Identical input → identical output, forever.',
  detectionMethod: 'Grep the NLP module and package.json for forbidden ML dependencies: transformers, @xenova/transformers, onnxruntime, tensorflow, torch, spacy, stanza, openai (for inference), tiktoken (model-based), any package with "model"/"embedding"/"neural" in its name. Flag ANY hit as a determinism violation.',
  fixTemplate: '// FORBIDDEN — remove: import { pipeline } from "@xenova/transformers";\n// REQUIRED — use: const TOKEN_RE = /.../g; function tokenise(s) { return s.match(TOKEN_RE) ?? []; }\n// Add to package.json "overrides": block to prevent transitive ML deps.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'NLP-DETERMINISTIC-GUARANTEE: No ML in NLP. Regex + grammar only. Same input → same output.',
  warheadTemplate: 'The determinism guarantee is the foundation of the entire audit trail. A single ML stage anywhere in the NLP pipeline makes every upstream claim and every downstream audit verdict non-reproducible, voiding IL10 (Evidence Is Mechanical) and IL11 (Output Is Proof).',
  evidenceSpec: { id: 'nlp-determinism', verify: 'sre-audit', minQuality: 0.999 },
  severity: 'guide',
  layer: 5,
  links: [
    'NLP-TOKENISER', 'NLP-DEPENDENCY-PARSE', 'NLP-SVO-EXTRACTION',
    'NLP-VERB-FRAME-MATCH', 'NLP-INTENT-FSM', 'NLP-NER', 'NLP-SENTIMENT',
    'NLP-TEMPORAL', 'NLP-COREFERENCE', 'NLP-INTENT-CLASSIFICATION',
    'NLP-CLAIM-EXTRACTION', 'NLP-COMMITMENT-EXTRACTION',
    'NLP-QUESTION-DETECTION', 'NLP-NEGATION-DETECTION',
    'IL10-EVIDENCE-IS-MECHANICAL', 'IL11-OUTPUT-IS-PROOF', 'AP-MOCK-IN-PRODUCTION',
  ],
  selfVerified: true,
};

// ══ EXPORTS ════════════════════════════════════════════════════

export const nlpComponentNodes: KnowledgeNode[] = [
  // Pipeline stages 1-3
  NLP_TOKENISER, NLP_DEPENDENCY_PARSE, NLP_SVO_EXTRACTION,
  // Pipeline stages 4-5
  NLP_VERB_FRAME_MATCH, NLP_INTENT_FSM,
  // Pipeline stages 6-9
  NLP_NER, NLP_SENTIMENT, NLP_TEMPORAL, NLP_COREFERENCE,
  // Pipeline stage 10
  NLP_INTENT_CLASSIFICATION,
  // Pipeline stages 11-14
  NLP_CLAIM_EXTRACTION, NLP_COMMITMENT_EXTRACTION, NLP_QUESTION_DETECTION, NLP_NEGATION_DETECTION,
  // Invariant
  NLP_DETERMINISTIC_GUARANTEE,
];
