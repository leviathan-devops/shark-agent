import nlp from 'compromise';
// `sentiment` ships no TypeScript declarations; default export is the class.
// @ts-ignore - missing type declarations for untyped package
import sentiment from 'sentiment';
import { VerbFrameLexicon } from '../shark/karpathy/verb-frame-lexicon';

// Types
export interface Token {
  text: string;
  pos: 'NN' | 'VB' | 'JJ' | 'RB' | 'DT' | 'IN' | 'MD' | 'PRP' | 'CD' | 'NNP' | 'OTHER';
  lemma: string;
  index: number;
  isStopWord: boolean;
}

export interface DepEdge {
  from: number;
  to: number;
  relation: 'nsubj' | 'dobj' | 'iobj' | 'amod' | 'advmod' | 'prep' | 'pobj' | 'root' | 'OTHER';
}

export interface Entity {
  text: string;
  type: 'TOOL' | 'FILE_PATH' | 'IDENTIFIER' | 'COMMAND' | 'UNKNOWN';
  confidence: number;
  span: [number, number];
}

export interface FrameCandidate {
  frame: string;
  slots: Record<string, string>;
  confidence: number;
  evidenceTokens: number[];
}

export interface NLPAnalysis {
  tokens: Token[];
  dependencies: DepEdge[];
  entities: Entity[];
  sentiment: number;
  frames: FrameCandidate[];
  source: string;
  timestamp: number;
}

export class StatisticalNLPEngine {
  private _analyzedCount = 0;
  /** Lazily-initialized VerbFrameLexicon (shared with the rest of Shark). */
  private _lexicon: VerbFrameLexicon | null = null;
  /** Lazily-initialized sentiment analyzer (stateless, but constructor-safe). */
  private _sentimentAnalyzer: any = null;

  /** Lazily build the VerbFrameLexicon once and reuse it. */
  private _getLexicon(): VerbFrameLexicon {
    if (!this._lexicon) this._lexicon = new VerbFrameLexicon();
    return this._lexicon;
  }

  /** Lazily build the sentiment analyzer once and reuse it. */
  private _getSentimentAnalyzer(): any {
    if (!this._sentimentAnalyzer) {
      try {
        const Ctor: any = sentiment;
        this._sentimentAnalyzer = new Ctor();
      } catch {
        this._sentimentAnalyzer = null;
      }
    }
    return this._sentimentAnalyzer;
  }

  analyze(text: string): NLPAnalysis {
    const doc = nlp(text);

    // POS tagging
    // NOTE: compromise's doc.json({ terms: true }) returns an array of
    // SENTENCES, each with a nested `terms` array — NOT a flat term list.
    // The previous code mapped over the outer (sentence) array, so every
    // "token" was the whole sentence with pos=OTHER, which meant no verb/noun
    // was ever tagged and deps/frames were always empty. Flatten correctly:
    const sentences = doc.json({ terms: true } as any) || [];
    const tokens: Token[] = [];
    let tokenIdx = 0;
    for (const sent of sentences) {
      const terms: any[] = Array.isArray(sent) ? sent : sent?.terms || [];
      for (const term of terms) {
        tokens.push({
          text: term.text || '',
          pos: this._mapPOSTag(term.tags?.[0] || ''),
          lemma: term.lemma || term.normal || term.text || '',
          index: tokenIdx++,
          isStopWord: false,
        });
      }
    }

    // Shallow dependency parsing
    const dependencies = this._extractDependencies(doc, tokens);

    // NER extraction
    const entities = this._extractEntities(text, tokens);

    // Sentiment — computed from raw text via the `sentiment` package
    // (compromise v14 has no .sentiment() method; the old doc-based call was dead code)
    const sentiment = this._computeSentiment(text);

    // Frame candidates
    const frames = this._generateFrames(tokens, dependencies, entities);

    this._analyzedCount++;

    return {
      tokens,
      dependencies,
      entities,
      sentiment,
      frames,
      source: text.slice(0, 200),
      timestamp: Date.now(),
    };
  }

  get analyzedCount(): number { return this._analyzedCount; }

  private _mapPOSTag(tag: string): Token['pos'] {
    const map: Record<string, Token['pos']> = {
      'Noun': 'NN', 'Verb': 'VB', 'Adjective': 'JJ',
      'Adverb': 'RB', 'Determiner': 'DT', 'Preposition': 'IN',
      'Modal': 'MD', 'Pronoun': 'PRP', 'Value': 'CD',
      'ProperNoun': 'NNP',
    };
    return map[tag] || 'OTHER';
  }

  private _extractDependencies(doc: any, tokens: Token[]): DepEdge[] {
    const edges: DepEdge[] = [];

    // Use compromise's .facts() API for real subject-verb-object extraction.
    // The old adjacent-token bigram scan missed 80%+ of real SVO structures
    // (e.g. "read the file" failed because "the" sat between verb and noun).
    //
    // NOTE: compromise v14 does NOT export a `plugins/facts` subpath (verified at
    // runtime: `nlp.plugins` is empty and `require('compromise/plugins/facts')`
    // fails with "Package subpath is not defined"). The `.facts()` call is
    // guarded with optional chaining and wrapped in try/catch, so it silently
    // falls through to the enhanced bigram scan below. If compromise adds a
    // facts plugin in a future version, this code will auto-activate.
    try {
      const facts = doc.facts?.();
      if (facts && Array.isArray(facts)) {
        for (const fact of facts) {
          // compromise .facts() returns { subj: {text}, verb: {text}, obj: {text} }
          const subjText = fact.subj?.text || fact.subject?.text || '';
          const verbText = fact.verb?.text || '';
          const objText = fact.obj?.text || fact.object?.text || '';

          // Find token indices (match the first whitespace-delimited head token)
          const subjIdx = subjText
            ? tokens.findIndex(t => t.text.toLowerCase() === subjText.toLowerCase().split(' ')[0])
            : -1;
          const verbIdx = verbText
            ? tokens.findIndex(t => t.text.toLowerCase() === verbText.toLowerCase())
            : -1;
          const objIdx = objText
            ? tokens.findIndex(t => t.text.toLowerCase() === objText.toLowerCase().split(' ')[0])
            : -1;

          if (verbIdx >= 0) {
            if (subjIdx >= 0 && subjIdx < verbIdx) {
              edges.push({ from: subjIdx, to: verbIdx, relation: 'nsubj' });
            }
            if (objIdx >= 0 && objIdx > verbIdx) {
              edges.push({ from: verbIdx, to: objIdx, relation: 'dobj' });
            }
            if (subjIdx < 0 && objIdx < 0) {
              edges.push({ from: verbIdx, to: verbIdx, relation: 'root' });
            }
          }
        }
      }
    } catch {
      // .facts() may not be available in all compromise versions — fall through
      // to the enhanced bigram scan below.
    }

    // Fallback: if .facts() returned nothing, do an enhanced bigram scan with
    // determiner/preposition skipping so "read the file" / "should read file"
    // are captured even without the .facts() plugin.
    if (edges.length === 0) {
      for (let i = 0; i < tokens.length - 1; i++) {
        const curr = tokens[i];

        // verb → object: look ahead up to 3 tokens, skipping determiners/
        // prepositions ("read the file" → "the" is DT, skipped).
        if (curr.pos === 'VB') {
          for (let j = i + 1; j < Math.min(i + 4, tokens.length); j++) {
            const next = tokens[j];
            if (next.pos === 'NN' || next.pos === 'NNP') {
              edges.push({ from: i, to: j, relation: 'dobj' });
              break;
            }
            if (next.pos === 'DT' || next.pos === 'IN') continue; // skip determiners/prepositions
            break; // stop at any other POS
          }
        }

        // subject → verb: noun/pronoun followed by verb, skipping modals
        // ("the agent should read..." → "should" is MD, skipped).
        if (curr.pos === 'NN' || curr.pos === 'NNP' || curr.pos === 'PRP') {
          for (let j = i + 1; j < Math.min(i + 3, tokens.length); j++) {
            const next = tokens[j];
            if (next.pos === 'VB') {
              edges.push({ from: i, to: j, relation: 'nsubj' });
              break;
            }
            if (next.pos === 'MD') continue; // skip modals ("should", "will")
            break;
          }
        }
      }
    }

    return edges;
  }

  private _extractEntities(text: string, tokens: Token[]): Entity[] {
    const entities: Entity[] = [];

    // File path detection: src/foo/bar.ts, ./path/to/file, /absolute/path
    const fileRegex = /(?:[.\w-]+\/)*[\w.-]+\.(?:ts|js|json|md|yaml|yml|css|html|py|sh|cpp|h)/g;
    let match;
    while ((match = fileRegex.exec(text)) !== null) {
      entities.push({
        text: match[0],
        type: 'FILE_PATH',
        confidence: 0.9,
        span: [match.index, match.index + match[0].length],
      });
    }

    // Command detection: words like "bash", "npm", "bun", "docker", "git"
    const knownTools = ['bash', 'npm', 'bun', 'docker', 'git', 'node', 'python', 'echo',
      'read', 'write', 'edit', 'grep', 'glob', 'cat', 'ls', 'mkdir', 'rm', 'cp', 'mv'];
    for (const tok of tokens) {
      if (knownTools.includes(tok.text.toLowerCase())) {
        entities.push({
          text: tok.text,
          type: 'TOOL',
          confidence: 0.85,
          span: [tok.index, tok.index + 1],
        });
      }
    }

    // Identifier detection: ProperNoun tokens
    for (const tok of tokens) {
      if (tok.pos === 'NNP' && !entities.some(e => e.text === tok.text)) {
        entities.push({
          text: tok.text,
          type: 'IDENTIFIER',
          confidence: 0.6,
          span: [tok.index, tok.index + 1],
        });
      }
    }

    return entities;
  }

  private _computeSentiment(text: string): number {
    // compromise v14 has no .sentiment() method, so the old doc-based call was
    // dead code that always returned 0. We now use the standalone `sentiment`
    // package. Its API is `new Sentiment().analyze(text)` returning
    // { score, comparative, ... }. Normalize the comparative to [-1.0, 1.0].
    //
    // NOTE: The `sentiment` package uses the AFINN-165 dictionary (2477 words)
    // by default. This is the standard word list; no custom/trimmed dictionary
    // is in use. If domain-specific sentiment (e.g. technical risk language)
    // is needed, extend with `analyzer.registerLanguage('en', customWords)`.
    try {
      const analyzer = this._getSentimentAnalyzer();
      if (!analyzer) return 0; // sentiment library not installed — return neutral
      const result = analyzer.analyze(text);
      if (result && typeof result.comparative === 'number') {
        return Math.max(-1, Math.min(1, result.comparative));
      }
      if (result && typeof result.score === 'number') {
        // Fallback: bound raw score to [-1,1] using a soft clamp.
        return Math.max(-1, Math.min(1, result.score / 5));
      }
    } catch {}
    return 0;
  }

  private _generateFrames(tokens: Token[], deps: DepEdge[], entities: Entity[]): FrameCandidate[] {
    const frames: FrameCandidate[] = [];
    const lexicon = this._getLexicon();
    const sentence = tokens.map(t => t.text).join(' ');

    // Pre-resolve a file-path entity (if any) so frames without an explicit
    // dobj still get a plausible target.
    const fileEntity = entities.find(e => e.type === 'FILE_PATH');

    for (const tok of tokens) {
      if (tok.pos !== 'VB') continue;
      const verb = tok.text.toLowerCase();

      // 1) Legacy SemanticFrame lookup (120+ verbs across 30+ frames).
      // lookup() throws on non-string input (P2 validation), but `verb`
      // here is always a lowercase string from a real token, so it's safe.
      let semanticFrame;
      try {
        semanticFrame = lexicon.lookup(verb);
      } catch {
        semanticFrame = undefined;
      }
      if (semanticFrame) {
        // Find the direct object (dobj) for this verb, if any.
        const dobjDep = deps.find(d => d.from === tok.index && d.relation === 'dobj');
        const target = dobjDep ? tokens[dobjDep.to]?.text : '';

        const dangerBoost =
          semanticFrame.dangerLevel === 'CRITICAL' ? 0.3 :
          semanticFrame.dangerLevel === 'HIGH' ? 0.2 : 0.1;

        frames.push({
          frame: `${semanticFrame.category.toLowerCase()}_${verb}`,
          slots: {
            action: verb,
            target: target || fileEntity?.text || '',
            category: semanticFrame.category,
          },
          confidence: Math.min(1, 0.6 + dangerBoost),
          evidenceTokens: dobjDep ? [tok.index, dobjDep.to] : [tok.index],
        });
      }

      // 2) T3 §5 VerbFrame matching (10 deep frames with role slots).
      // matchVerb() throws on non-string input; guard it defensively.
      try {
        const frameMatch = lexicon.matchVerb(verb, sentence);
        if (frameMatch && frameMatch.confidence > 0.5) {
          const slots: Record<string, string> = {};
          frameMatch.fillers.forEach((value: string, role: string) => {
            slots[role] = value;
          });
          frames.push({
            frame: `${frameMatch.frame.actionType.toLowerCase()}_${verb}`,
            slots,
            confidence: frameMatch.confidence,
            evidenceTokens: [tok.index],
          });
        }
      } catch {
        // matchVerb swallows errors silently — non-critical path.
      }
    }

    return frames;
  }
}

// Singleton
let _engine: StatisticalNLPEngine | null = null;
export function getStatisticalNLPEngine(): StatisticalNLPEngine {
  if (!_engine) _engine = new StatisticalNLPEngine();
  return _engine;
}
export function resetStatisticalNLPEngine(): void { _engine = null; }
