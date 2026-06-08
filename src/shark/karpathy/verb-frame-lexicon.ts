/**
 * VerbFrameLexicon — maps action verbs to semantic frames with danger levels
 * and role mappings. Pure TypeScript, zero dependencies, deterministic.
 *
 * T3 UPGRADE: Adds SemanticRole, FrameSlot, VerbFrame, FrameMatch interfaces
 * with evidence production (§5), P2 input validation, and P3 error containment.
 *
 * Pre-populated with all standard frames covering DESTRUCTIVE, CREATE, READ,
 * MODIFY, EXECUTE, TEST, CLAIM, DEPLOY, and QUERY categories.
 */

// ─── T3 §5 Types ───────────────────────────────────────────────────────────

/**
 * Semantic roles for verb frame slot filling (T3 §5.1).
 * Represents the thematic relation a noun phrase bears to the verb.
 */
export type SemanticRole =
  | 'agent' | 'patient' | 'recipient' | 'instrument'
  | 'location' | 'source' | 'goal' | 'time' | 'manner';

/**
 * FrameSlot — a role within a verb frame (T3 §5.2).
 * Each slot defines which role the constituent fills, whether it is required,
 * what semantic types it accepts, and an optional preposition trigger.
 */
export interface FrameSlot {
  role: SemanticRole;
  required: boolean;
  acceptsType: string[];
  preposition?: string;
}

/**
 * VerbFrame — a semantic frame for a verb sense (T3 §5.3).
 * Contains the verb lemma, sense label, slot structure, example usage,
 * and the Shark intent category this frame maps to.
 */
export interface VerbFrame {
  verb: string;
  sense: string;
  slots: FrameSlot[];
  example: string;
  actionType: IntentCategory;
}

/**
 * FrameEvidence — a record of how a match was produced (T3 §5.4).
 * Each piece of evidence traces a matching decision back to its source.
 */
export interface FrameEvidence {
  matchedAt: number;
  matchType: 'exact' | 'stem' | 'slot-fill' | 'synonym';
  source: string;
  detail: string;
}

/**
 * FrameMatch — the result of matching a verb against a sentence (T3 §5.5).
 * Contains the matched VerbFrame, the role fillers extracted from the sentence,
 * an overall confidence score, and the chain of evidence.
 */
export interface FrameMatch {
  frame: VerbFrame;
  fillers: Map<SemanticRole, string>;
  confidence: number;
  evidence: FrameEvidence[];
}

// ─── Pre-populated VerbFrame entries ───────────────────────────────────────

const VERB_FRAMES: VerbFrame[] = [
  {
    verb: 'delete',
    sense: 'remove entity from location',
    slots: [
      { role: 'agent', required: false, acceptsType: ['person', 'system'] },
      { role: 'patient', required: true, acceptsType: ['file', 'resource', 'entity'] },
      { role: 'location', required: false, acceptsType: ['path', 'filesystem'], preposition: 'from' },
    ],
    example: 'delete the log file from /var/log',
    actionType: 'DESTRUCTIVE',
  },
  {
    verb: 'write',
    sense: 'create content at destination',
    slots: [
      { role: 'agent', required: false, acceptsType: ['person', 'system'] },
      { role: 'patient', required: true, acceptsType: ['content', 'code', 'text'] },
      { role: 'goal', required: false, acceptsType: ['path', 'file'], preposition: 'to' },
    ],
    example: 'write the config to /etc/app.conf',
    actionType: 'CREATE',
  },
  {
    verb: 'read',
    sense: 'retrieve content from source',
    slots: [
      { role: 'agent', required: false, acceptsType: ['person', 'system'] },
      { role: 'patient', required: false, acceptsType: ['content', 'data'] },
      { role: 'source', required: true, acceptsType: ['path', 'file', 'url'], preposition: 'from' },
    ],
    example: 'read the config from /etc/app.conf',
    actionType: 'READ',
  },
  {
    verb: 'edit',
    sense: 'modify existing content',
    slots: [
      { role: 'agent', required: false, acceptsType: ['person', 'system'] },
      { role: 'patient', required: true, acceptsType: ['file', 'content', 'code'] },
      { role: 'manner', required: false, acceptsType: ['method', 'technique'], preposition: 'by' },
    ],
    example: 'edit the config file by replacing the API key',
    actionType: 'MODIFY',
  },
  {
    verb: 'move',
    sense: 'transfer entity from source to goal',
    slots: [
      { role: 'agent', required: false, acceptsType: ['person', 'system'] },
      { role: 'patient', required: true, acceptsType: ['file', 'entity', 'resource'] },
      { role: 'source', required: false, acceptsType: ['path'], preposition: 'from' },
      { role: 'goal', required: true, acceptsType: ['path'], preposition: 'to' },
    ],
    example: 'move the file from /tmp to /var/log',
    actionType: 'MODIFY',
  },
  {
    verb: 'run',
    sense: 'execute a command or process',
    slots: [
      { role: 'agent', required: false, acceptsType: ['person', 'system'] },
      { role: 'patient', required: true, acceptsType: ['command', 'script', 'process'] },
      { role: 'instrument', required: false, acceptsType: ['tool', 'runtime'], preposition: 'with' },
    ],
    example: 'run the tests with bun',
    actionType: 'EXECUTE',
  },
  {
    verb: 'test',
    sense: 'verify correctness of entity',
    slots: [
      { role: 'agent', required: false, acceptsType: ['person', 'system'] },
      { role: 'patient', required: true, acceptsType: ['code', 'module', 'system'] },
      { role: 'instrument', required: false, acceptsType: ['framework', 'tool'], preposition: 'with' },
    ],
    example: 'test the module with jest',
    actionType: 'TEST',
  },
  {
    verb: 'deploy',
    sense: 'publish artifact to environment',
    slots: [
      { role: 'agent', required: false, acceptsType: ['person', 'system'] },
      { role: 'patient', required: true, acceptsType: ['artifact', 'build', 'code'] },
      { role: 'goal', required: true, acceptsType: ['environment', 'server'], preposition: 'to' },
    ],
    example: 'deploy the build to production',
    actionType: 'DEPLOY',
  },
  {
    verb: 'query',
    sense: 'request information from a source',
    slots: [
      { role: 'agent', required: false, acceptsType: ['person', 'system'] },
      { role: 'patient', required: false, acceptsType: ['data', 'information'] },
      { role: 'source', required: true, acceptsType: ['database', 'api', 'system'], preposition: 'from' },
    ],
    example: 'query the user data from the database',
    actionType: 'QUERY',
  },
  {
    verb: 'claim',
    sense: 'assert a proposition without evidence',
    slots: [
      { role: 'agent', required: false, acceptsType: ['person', 'system'] },
      { role: 'patient', required: true, acceptsType: ['proposition', 'statement', 'fact'] },
    ],
    example: 'claim the build passes all tests',
    actionType: 'CLAIM',
  },
];

// ─── Existing types (unchanged for backward compat) ────────────────────────

export type IntentCategory =
  | 'DESTRUCTIVE' | 'CREATE' | 'READ' | 'MODIFY'
  | 'EXECUTE' | 'TEST' | 'CLAIM' | 'DEPLOY' | 'QUERY';

export interface SemanticFrame {
  verbs: string[];
  category: IntentCategory;
  dangerLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  blockedTargets?: string[];
  allowedGates?: string[];
  description: string;
}

const CRITICAL_BLOCKED_TARGETS: readonly string[] = [
  '/', '/etc', '/usr', '/boot', '/var', '/sys', '/proc',
  'node_modules', '.git', 'dist', 'deploy', 'credentials', '.env',
  '/etc/shadow', '/etc/passwd', '/etc/sudoers', '/root',
];

export class VerbFrameLexicon {
  /** Legacy verb → SemanticFrame mapping (backward compat). */
  private frames: Map<string, SemanticFrame>;

  /** T3 §5 VerbFrame registry for deep semantic matching. */
  private verbFrames: Map<string, VerbFrame>;

  constructor() {
    this.frames = new Map<string, SemanticFrame>();
    this.verbFrames = new Map<string, VerbFrame>();
    this.initializeFrames();
    this.initializeVerbFrames();
  }

  // ─── P2 input validation ─────────────────────────────────────────────────

  /**
   * Validate verb input — P2: type certainty at boundaries.
   * @throws {Error} If input is not a non-empty string.
   */
  private validateVerb(verb: unknown): string {
    if (typeof verb !== 'string') {
      throw new Error(`P2 validation failed: verb must be a string, got ${typeof verb}`);
    }
    const trimmed = verb.trim();
    if (trimmed.length === 0) {
      throw new Error('P2 validation failed: verb must be non-empty');
    }
    return trimmed.toLowerCase();
  }

  /**
   * Validate target input — P2: type certainty at boundaries.
   * @throws {Error} If input is not a string.
   */
  private validateTarget(target: unknown): string {
    if (typeof target !== 'string') {
      throw new Error(`P2 validation failed: target must be a string, got ${typeof target}`);
    }
    return target.toLowerCase().trim();
  }

  /**
   * Validate gate input — P2: type certainty at boundaries.
   * @throws {Error} If input is not a non-empty string.
   */
  private validateGate(gate: unknown): string {
    if (typeof gate !== 'string') {
      throw new Error(`P2 validation failed: gate must be a string, got ${typeof gate}`);
    }
    const trimmed = gate.trim();
    if (trimmed.length === 0) {
      throw new Error('P2 validation failed: gate must be non-empty');
    }
    return trimmed.toUpperCase();
  }

  /**
   * Validate SemanticFrame input — P2: structural validity.
   * @throws {Error} If frame is missing required fields.
   */
  private validateFrame(frame: unknown): asserts frame is SemanticFrame {
    if (frame === null || typeof frame !== 'object') {
      throw new Error('P2 validation failed: frame must be an object');
    }
    const f = frame as Record<string, unknown>;
    if (!Array.isArray(f.verbs) || f.verbs.length === 0) {
      throw new Error('P2 validation failed: frame.verbs must be a non-empty array');
    }
    if (typeof f.category !== 'string' || f.category.length === 0) {
      throw new Error('P2 validation failed: frame.category must be a non-empty string');
    }
    if (typeof f.dangerLevel !== 'string' || f.dangerLevel.length === 0) {
      throw new Error('P2 validation failed: frame.dangerLevel must be a non-empty string');
    }
  }

  // ─── Initialization ──────────────────────────────────────────────────────

  /**
   * Pre-populate all verb → frame mappings (legacy).
   */
  private initializeFrames(): void {
    const allFrames: SemanticFrame[] = [
      // ── DESTRUCTIVE ──────────────────────────────────────────────
      {
        verbs: ['rm', 'delete', 'remove', 'destroy', 'kill', 'force:remove'],
        category: 'DESTRUCTIVE',
        dangerLevel: 'CRITICAL',
        blockedTargets: [...CRITICAL_BLOCKED_TARGETS],
        allowedGates: ['BUILD'],
        description: 'Destructive operations that permanently remove or destroy resources',
      },
      {
        verbs: ['force:delete', 'wipe', 'purge', 'truncate', 'unlink'],
        category: 'DESTRUCTIVE',
        dangerLevel: 'CRITICAL',
        blockedTargets: [...CRITICAL_BLOCKED_TARGETS],
        allowedGates: [],
        description: 'Force-delete operations with no recovery possible',
      },
      {
        verbs: ['reset', 'revert', 'rollback'],
        category: 'DESTRUCTIVE',
        dangerLevel: 'HIGH',
        blockedTargets: [...CRITICAL_BLOCKED_TARGETS],
        allowedGates: ['BUILD', 'TEST'],
        description: 'State-resetting operations that discard changes',
      },

      // ── CREATE ───────────────────────────────────────────────────
      {
        verbs: ['write', 'create', 'generate', 'implement', 'add', 'make'],
        category: 'CREATE',
        dangerLevel: 'LOW',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT'],
        description: 'Create new files, components, or resources',
      },
      {
        verbs: ['scaffold', 'init', 'bootstrap', 'new', 'touch'],
        category: 'CREATE',
        dangerLevel: 'LOW',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT'],
        description: 'Initialize or scaffold new projects/modules',
      },
      {
        verbs: ['install', 'download', 'fetch', 'pull'],
        category: 'CREATE',
        dangerLevel: 'MEDIUM',
        allowedGates: ['PLAN', 'BUILD', 'TEST'],
        description: 'Install or fetch external dependencies',
      },

      // ── READ ─────────────────────────────────────────────────────
      {
        verbs: ['read', 'cat', 'view', 'inspect', 'check', 'list', 'grep'],
        category: 'READ',
        dangerLevel: 'NONE',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT', 'DELIVERY'],
        description: 'Read or inspect files and resources',
      },
      {
        verbs: ['ls', 'find', 'search', 'glob', 'lookup', 'peek', 'show'],
        category: 'READ',
        dangerLevel: 'NONE',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT', 'DELIVERY'],
        description: 'Search, list, or enumerate resources',
      },
      {
        verbs: ['log', 'tail', 'follow', 'watch'],
        category: 'READ',
        dangerLevel: 'NONE',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT', 'DELIVERY'],
        description: 'Read logs or monitor output',
      },

      // ── MODIFY ───────────────────────────────────────────────────
      {
        verbs: ['edit', 'update', 'change', 'modify', 'refactor', 'rename'],
        category: 'MODIFY',
        dangerLevel: 'MEDIUM',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY'],
        description: 'Modify existing files or resources',
      },
      {
        verbs: ['patch', 'fix', 'correct', 'amend', 'adjust'],
        category: 'MODIFY',
        dangerLevel: 'MEDIUM',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY'],
        description: 'Apply patches or corrections to existing code',
      },
      {
        verbs: ['move', 'mv', 'copy', 'cp'],
        category: 'MODIFY',
        dangerLevel: 'MEDIUM',
        allowedGates: ['PLAN', 'BUILD', 'TEST'],
        description: 'Move or copy files around the filesystem',
      },

      // ── EXECUTE ──────────────────────────────────────────────────
      {
        verbs: ['run', 'execute', 'start', 'deploy', 'build', 'compile'],
        category: 'EXECUTE',
        dangerLevel: 'HIGH',
        allowedGates: ['BUILD', 'TEST', 'VERIFY'],
        description: 'Execute commands, start processes, or build artifacts',
      },
      {
        verbs: ['launch', 'invoke', 'call', 'trigger', 'fire'],
        category: 'EXECUTE',
        dangerLevel: 'HIGH',
        allowedGates: ['BUILD', 'TEST', 'VERIFY'],
        description: 'Launch or invoke processes and functions',
      },
      {
        verbs: ['restart', 'reload', 'reboot'],
        category: 'EXECUTE',
        dangerLevel: 'HIGH',
        allowedGates: ['BUILD', 'TEST'],
        description: 'Restart or reload running services',
      },
      {
        verbs: ['bash', 'sh', 'zsh', 'shell', 'exec'],
        category: 'EXECUTE',
        dangerLevel: 'HIGH',
        allowedGates: ['BUILD', 'TEST', 'VERIFY'],
        description: 'Execute shell commands',
      },

      // ── TEST ─────────────────────────────────────────────────────
      {
        verbs: ['test', 'verify', 'validate', 'check', 'assert', 'prove'],
        category: 'TEST',
        dangerLevel: 'LOW',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY'],
        description: 'Run tests or verify correctness',
      },
      {
        verbs: ['lint', 'format', 'audit', 'scan'],
        category: 'TEST',
        dangerLevel: 'LOW',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT'],
        description: 'Run linters, formatters, or security scans',
      },
      {
        verbs: ['benchmark', 'profile', 'measure'],
        category: 'TEST',
        dangerLevel: 'LOW',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY'],
        description: 'Run benchmarks or performance measurements',
      },

      // ── CLAIM ────────────────────────────────────────────────────
      {
        verbs: ['claim', 'assert', 'state', 'confirm', 'declare', 'say'],
        category: 'CLAIM',
        dangerLevel: 'HIGH',
        allowedGates: ['PLAN'],
        description: 'Make assertions or claims without supporting evidence',
      },
      {
        verbs: ['believe', 'assume', 'presume', 'hypothesize'],
        category: 'CLAIM',
        dangerLevel: 'HIGH',
        allowedGates: ['PLAN'],
        description: 'Express beliefs or assumptions without verification',
      },
      {
        verbs: ['guarantee', 'promise', 'assure'],
        category: 'CLAIM',
        dangerLevel: 'HIGH',
        allowedGates: [],
        description: 'Make unconditional guarantees (always requires evidence)',
      },

      // ── DEPLOY ───────────────────────────────────────────────────
      {
        verbs: ['deploy', 'publish', 'ship', 'release', 'push', 'commit'],
        category: 'DEPLOY',
        dangerLevel: 'HIGH',
        allowedGates: ['DELIVERY'],
        description: 'Deploy or publish artifacts to production or registries',
      },
      {
        verbs: ['tag', 'version', 'bump', 'release:cut'],
        category: 'DEPLOY',
        dangerLevel: 'HIGH',
        allowedGates: ['DELIVERY'],
        description: 'Create version tags or cut releases',
      },
      {
        verbs: ['merge', 'pr:merge', 'submit'],
        category: 'DEPLOY',
        dangerLevel: 'HIGH',
        allowedGates: ['DELIVERY'],
        description: 'Merge code changes into target branches',
      },

      // ── QUERY ────────────────────────────────────────────────────
      {
        verbs: ['query', 'ask', 'request', 'inquiry'],
        category: 'QUERY',
        dangerLevel: 'LOW',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT', 'DELIVERY'],
        description: 'Query or request information from databases or APIs',
      },
      {
        verbs: ['fetch', 'get', 'retrieve', 'select', 'find'],
        category: 'QUERY',
        dangerLevel: 'LOW',
        allowedGates: ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT', 'DELIVERY'],
        description: 'Retrieve or fetch data from external sources',
      },
    ];

    // Register every verb → frame mapping
    for (const frame of allFrames) {
      for (const verb of frame.verbs) {
        const key = verb.toLowerCase().trim();
        if (key.length > 0) {
          this.frames.set(key, frame);
        }
      }
    }
  }

  /**
   * Pre-populate the T3 §5 VerbFrame registry with semantic role data.
   */
  private initializeVerbFrames(): void {
    for (const vf of VERB_FRAMES) {
      const key = vf.verb.toLowerCase().trim();
      if (key.length > 0 && !this.verbFrames.has(key)) {
        this.verbFrames.set(key, vf);
      }
    }
  }

  // ─── T3 §5 matchVerb — deep semantic frame matching ──────────────────────

  /**
   * Match a verb against an input sentence and produce a FrameMatch with
   * slot fillers, confidence score, and evidence chain.
   *
   * P2: validates verb input. P3: wraps in try/catch.
   * P10: never returns null without evidence explaining why.
   *
   * @param verb - The verb lemma to match.
   * @param sentence - The sentence to extract slot fillers from.
   * @returns FrameMatch if found, or null with empty evidence.
   */
  matchVerb(verb: unknown, sentence: unknown): FrameMatch | null {
    try {
      // P2 input validation
      const validatedVerb = this.validateVerb(verb);
      if (typeof sentence !== 'string') {
        throw new Error(`P2 validation failed: sentence must be a string, got ${typeof sentence}`);
      }
      const trimmedSentence = sentence.trim();
      if (trimmedSentence.length === 0) {
        throw new Error('P2 validation failed: sentence must be non-empty');
      }

      // Look up VerbFrame
      const frame = this.verbFrames.get(validatedVerb);
      if (!frame) {
        return null;
      }

      const now = Date.now();
      const fillers = new Map<SemanticRole, string>();
      const evidence: FrameEvidence[] = [];

      evidence.push({
        matchedAt: now,
        matchType: 'exact',
        source: 'verb-frame-lexicon:matchVerb',
        detail: `Matched verb "${validatedVerb}" to frame "${frame.sense}"`,
      });

      // Try to fill each slot from the sentence
      const words = trimmedSentence.split(/\s+/).filter(w => w.length > 0);
      let requiredFilled = 0;
      let totalRequired = 0;

      for (const slot of frame.slots) {
        if (slot.required) totalRequired++;

        if (slot.preposition) {
          // Look for preposition pattern: preposition + noun phrase
          const prepIndex = words.findIndex(
            w => w.toLowerCase() === slot.preposition
          );
          if (prepIndex >= 0 && prepIndex + 1 < words.length) {
            const fillerWords: string[] = [];
            for (let j = prepIndex + 1; j < words.length; j++) {
              const w = words[j];
              const lower = w.toLowerCase();
              if (['from', 'to', 'with', 'by', 'in', 'at', 'on', 'for', 'of'].includes(lower) &&
                  lower !== slot.preposition) {
                break;
              }
              fillerWords.push(w);
            }
            if (fillerWords.length > 0) {
              const filler = fillerWords.join(' ');
              fillers.set(slot.role, filler);
              if (slot.required) requiredFilled++;
              evidence.push({
                matchedAt: Date.now(),
                matchType: 'slot-fill',
                source: `matchVerb:preposition:${slot.preposition}`,
                detail: `Filled ${slot.role} slot with "${filler}" via preposition "${slot.preposition}"`,
              });
            }
          }
        } else if (slot.role === 'patient' && words.length > 0) {
          // Patient is typically the noun phrase after the verb
          const verbIndex = words.findIndex(
            w => w.toLowerCase() === validatedVerb
          );
          if (verbIndex >= 0 && verbIndex + 1 < words.length) {
            const afterVerb = words.slice(verbIndex + 1).filter(
              w => !['from', 'to', 'with', 'by', 'in', 'at'].includes(w.toLowerCase())
            );
            if (afterVerb.length > 0) {
              const filler = afterVerb[0];
              fillers.set(slot.role, filler);
              if (slot.required) requiredFilled++;
              evidence.push({
                matchedAt: Date.now(),
                matchType: 'slot-fill',
                source: 'matchVerb:post-verbal',
                detail: `Filled ${slot.role} slot with "${filler}" as post-verbal noun phrase`,
              });
            }
          }
        }
      }

      // Calculate confidence: required slots filled / total required
      const confidence = totalRequired > 0 ? requiredFilled / totalRequired : 0.5;

      evidence.push({
        matchedAt: Date.now(),
        matchType: 'slot-fill',
        source: 'matchVerb:confidence',
        detail: `Confidence ${confidence.toFixed(2)} (${requiredFilled}/${totalRequired} required slots filled)`,
      });

      return {
        frame,
        fillers,
        confidence,
        evidence,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`VerbFrameLexicon.matchVerb P3 error: ${msg}`);
    }
  }

  /**
   * Get the VerbFrame for a given verb lemma (if it exists in the T3 registry).
   *
   * P2: validates verb input. P3: wraps in try/catch.
   *
   * @param verb - The verb lemma to look up.
   * @returns The VerbFrame or undefined if not found.
   */
  getVerbFrame(verb: unknown): VerbFrame | undefined {
    try {
      const key = this.validateVerb(verb);
      return this.verbFrames.get(key);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`VerbFrameLexicon.getVerbFrame P3 error: ${msg}`);
    }
  }

  /**
   * Register a custom VerbFrame at runtime.
   *
   * P2: validates frame structure. P3: wraps in try/catch.
   *
   * @param verb - The verb lemma.
   * @param frame - The VerbFrame to register.
   */
  registerVerbFrame(verb: unknown, frame: unknown): void {
    try {
      const key = this.validateVerb(verb);
      if (frame === null || typeof frame !== 'object') {
        throw new Error('P2 validation failed: frame must be an object');
      }
      const f = frame as Record<string, unknown>;
      if (typeof f.sense !== 'string' || !Array.isArray(f.slots)) {
        throw new Error('P2 validation failed: frame must have sense (string) and slots (array)');
      }
      this.verbFrames.set(key, frame as VerbFrame);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`VerbFrameLexicon.registerVerbFrame P3 error: ${msg}`);
    }
  }

  /**
   * Get all registered VerbFrames (defensive copy with defensive slot copies).
   *
   * @returns Array of VerbFrame entries.
   */
  getAllVerbFrames(): VerbFrame[] {
    try {
      return Array.from(this.verbFrames.values()).map(vf => ({
        ...vf,
        slots: vf.slots.map(s => ({ ...s })),
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`VerbFrameLexicon.getAllVerbFrames P3 error: ${msg}`);
    }
  }

  // ─── Legacy API (unchanged, with added P2/P3) ────────────────────────────

  /**
   * Look up a verb in the lexicon. Returns the SemanticFrame or undefined.
   * Performs case-insensitive lookup.
   *
   * P2: validates verb input. P3: wraps in try/catch.
   *
   * @param verb - The verb to look up.
   * @returns The SemanticFrame or undefined if not found.
   */
  lookup(verb: unknown): SemanticFrame | undefined {
    try {
      const key = this.validateVerb(verb);
      return this.frames.get(key);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`VerbFrameLexicon.lookup P3 error: ${msg}`);
      return undefined;
    }
  }

  /**
   * Get the IntentCategory for a given verb.
   *
   * P2: validates verb input. P3: wraps in try/catch.
   *
   * @param verb - The verb to look up.
   * @returns The IntentCategory or undefined.
   */
  getCategory(verb: unknown): IntentCategory | undefined {
    try {
      const frame = this.lookup(verb);
      return frame?.category;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`VerbFrameLexicon.getCategory P3 error: ${msg}`);
      return undefined;
    }
  }

  /**
   * Get the danger level string for a given verb.
   *
   * P2: validates verb input. P3: wraps in try/catch.
   *
   * @param verb - The verb to look up.
   * @returns The danger level string or 'UNKNOWN'.
   */
  getDangerLevel(verb: unknown): string {
    try {
      const frame = this.lookup(verb);
      return frame?.dangerLevel ?? 'UNKNOWN';
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`VerbFrameLexicon.getDangerLevel P3 error: ${msg}`);
      return 'UNKNOWN';
    }
  }

  /**
   * Check if a verb+target combination is blocked.
   * Returns true if the verb's frame has blockedTargets and the target matches.
   *
   * P2: validates verb and target input. P3: wraps in try/catch.
   *
   * @param verb - The verb to check.
   * @param target - The target path/entity to check.
   * @returns True if the action is blocked.
   */
  isBlocked(verb: unknown, target: unknown): boolean {
    try {
      const validatedVerb = this.validateVerb(verb);
      const normalizedTarget = this.validateTarget(target);

      const frame = this.frames.get(validatedVerb);
      if (!frame || !frame.blockedTargets || frame.blockedTargets.length === 0) {
        return false;
      }

      for (const blocked of frame.blockedTargets) {
        if (normalizedTarget === blocked.toLowerCase()) {
          return true;
        }
        if (normalizedTarget.startsWith(blocked.toLowerCase() + '/') ||
            normalizedTarget.startsWith(blocked.toLowerCase() + '\\\\')) {
          return true;
        }
      }

      return false;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`VerbFrameLexicon.isBlocked P3 error: ${msg}`);
      return false;
    }
  }

  /**
   * Register a custom verb-frame mapping at runtime.
   *
   * P2: validates verb and frame input. P3: wraps in try/catch.
   *
   * @param verb - The verb to register.
   * @param frame - The SemanticFrame to associate.
   */
  register(verb: unknown, frame: unknown): void {
    try {
      const key = this.validateVerb(verb);
      this.validateFrame(frame);
      this.frames.set(key, frame);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`VerbFrameLexicon.register P3 error: ${msg}`);
    }
  }

  /**
   * Get the full map of verb → SemanticFrame (defensive copy).
   *
   * P3: wraps in try/catch.
   *
   * @returns A defensive copy of the internal frames map.
   */
  getAllCategories(): Map<string, SemanticFrame> {
    try {
      return new Map(this.frames);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`VerbFrameLexicon.getAllCategories P3 error: ${msg}`);
    }
  }
}
