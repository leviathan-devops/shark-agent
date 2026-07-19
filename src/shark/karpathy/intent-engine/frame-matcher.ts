/**
 * FrameMatcher — semantic frame matching with REAL slot filling.
 * =================================================================
 *
 * Implements Pillar 3 of the Intent Engine: map a tool call to a VerbFrame and
 * fill that frame's slots from the tool's arguments.
 *
 * Pipeline:
 *   1. parseToolArgs      → normalize args into an argName→value map
 *   2. findBestFrame      → resolve the tool name to a frame verb, then a frame
 *   3. fillSlots          → map each frame slot to a concrete arg value
 *   4. computeMatch       → derive match quality + frame-level confidence
 *
 * The 8 default frames are registered here and cover the core tool surface:
 *   write_file, edit, bash, shark-test-runner, shark-run-trident,
 *   shark-gate, webfetch, task.
 *
 * Slot filling uses BOTH the frame's declared `argMapping` (preferred) and a
 * generic ARG_TO_ROLE fallback table so unmatched tools still get partial fills.
 */

import type {
  FrameMatch,
  FrameSlot,
  GateType,
  MatchQuality,
  SemanticRole,
  VerbFrame,
} from './intent-types.js';

// ─── Tool name → frame verb normalization ──────────────────────────────────

const TOOL_TO_VERB: ReadonlyMap<string, string> = new Map<string, string>([
  ['write', 'write_file'],
  ['write_file', 'write_file'],
  ['edit', 'edit'],
  ['patch', 'edit'],
  ['replace', 'edit'],
  ['bash', 'bash'],
  ['shell', 'bash'],
  ['exec', 'bash'],
  ['run', 'bash'],
  ['shark-test-runner', 'shark-test-runner'],
  ['shark-run-trident', 'shark-run-trident'],
  ['shark-gate', 'shark-gate'],
  ['webfetch', 'webfetch'],
  ['fetch', 'webfetch'],
  ['task', 'task'],
]);

// ─── Generic arg-name → semantic-role fallback (spec Appendix D) ───────────

const ARG_TO_ROLE: ReadonlyMap<string, SemanticRole> = new Map<
  string,
  SemanticRole
>([
  ['filePath', 'PATIENT'],
  ['path', 'DESTINATION'],
  ['content', 'INSTRUMENT'],
  ['newString', 'INSTRUMENT'],
  ['oldString', 'INSTRUMENT'],
  ['command', 'AGENT'],
  ['cmd', 'AGENT'],
  ['description', 'PURPOSE'],
  ['notes', 'PURPOSE'],
  ['task', 'THEME'],
  ['pattern', 'THEME'],
  ['query', 'THEME'],
  ['prompt', 'THEME'],
  ['url', 'SOURCE'],
  ['source', 'SOURCE'],
  ['subagent_type', 'AGENT'],
  ['action', 'AGENT'],
  ['targetPath', 'PATIENT'],
  ['gate', 'PATIENT'],
]);

// ─── 8 default frames ──────────────────────────────────────────────────────

function emptySlot(
  role: SemanticRole,
  required: boolean,
  acceptsType: string,
  argMapping?: string,
): FrameSlot {
  return { role, required, acceptsType, argMapping, filled: false };
}

/** Build the 8 default verb frames that anchor the matcher. */
export function buildDefaultFrames(): VerbFrame[] {
  return [
    {
      verb: 'write_file',
      intent: 'WRITE_FILE',
      senses: [{ mode: 'WRITE_FILE', description: 'Write a new file to disk' }],
      dangerLevel: 'medium',
      allowedGates: ['BUILD', 'TEST', 'AUDIT', 'DELIVERY'],
      examples: ['write(filePath, content)'],
      slots: [
        emptySlot('PATIENT', true, 'string', 'filePath'),
        emptySlot('INSTRUMENT', true, 'string', 'content'),
      ],
    },
    {
      verb: 'edit',
      intent: 'EDIT_FILE',
      senses: [{ mode: 'EDIT_FILE', description: 'Edit an existing file in place' }],
      dangerLevel: 'medium',
      allowedGates: ['BUILD', 'TEST', 'AUDIT', 'DELIVERY'],
      examples: ['edit(filePath, oldString, newString)'],
      slots: [
        emptySlot('PATIENT', true, 'string', 'filePath'),
        emptySlot('INSTRUMENT', true, 'string', 'oldString'),
        emptySlot('INSTRUMENT', true, 'string', 'newString'),
      ],
    },
    {
      verb: 'bash',
      intent: 'BASH',
      senses: [{ mode: 'BASH', description: 'Execute a shell command' }],
      dangerLevel: 'high',
      allowedGates: ['BUILD', 'VERIFY', 'TEST', 'AUDIT', 'DELIVERY'],
      examples: ['bash(command)'],
      slots: [emptySlot('AGENT', true, 'string', 'command')],
    },
    {
      verb: 'shark-test-runner',
      intent: 'TEST',
      senses: [{ mode: 'TEST', description: 'Run the mechanical test suite' }],
      dangerLevel: 'low',
      allowedGates: ['TEST', 'VERIFY'],
      examples: ['shark-test-runner(action)'],
      slots: [emptySlot('AGENT', true, 'string', 'action')],
    },
    {
      verb: 'shark-run-trident',
      intent: 'EXTERNAL_AUDIT',
      senses: [{ mode: 'EXTERNAL_AUDIT', description: 'Run an external code audit' }],
      dangerLevel: 'low',
      allowedGates: ['VERIFY', 'AUDIT'],
      examples: ['shark-run-trident(targetPath)'],
      slots: [emptySlot('PATIENT', true, 'string', 'targetPath')],
    },
    {
      verb: 'shark-gate',
      intent: 'GATE_ADVANCE',
      senses: [{ mode: 'GATE_ADVANCE', description: 'Evaluate or advance a gate' }],
      dangerLevel: 'low',
      allowedGates: ['PLAN', 'BUILD', 'VERIFY', 'TEST', 'AUDIT', 'DELIVERY'],
      examples: ['shark-gate(action, gate)'],
      slots: [
        emptySlot('AGENT', true, 'string', 'action'),
        emptySlot('PATIENT', false, 'string', 'gate'),
      ],
    },
    {
      verb: 'webfetch',
      intent: 'WEB_FETCH',
      senses: [{ mode: 'WEB_FETCH', description: 'Fetch content from a URL' }],
      dangerLevel: 'low',
      allowedGates: ['PLAN', 'BUILD', 'VERIFY', 'TEST', 'AUDIT', 'DELIVERY'],
      examples: ['webfetch(url)'],
      slots: [emptySlot('SOURCE', true, 'string', 'url')],
    },
    {
      verb: 'task',
      intent: 'TASK_DISPATCH',
      senses: [{ mode: 'TASK_DISPATCH', description: 'Dispatch a subagent task' }],
      dangerLevel: 'medium',
      allowedGates: ['PLAN', 'BUILD', 'VERIFY', 'TEST', 'AUDIT'],
      examples: ['task(subagent_type, prompt)'],
      slots: [
        emptySlot('AGENT', true, 'string', 'subagent_type'),
        emptySlot('THEME', true, 'string', 'prompt'),
      ],
    },
  ];
}

// ─── FrameMatcher ──────────────────────────────────────────────────────────

/**
 * FrameMatcher — resolves a tool call to a VerbFrame and fills its slots from
 * the tool arguments, producing a FrameMatch with evidence + match quality.
 */
export class FrameMatcher {
  private readonly framesByVerb: Map<string, VerbFrame>;
  private readonly extraArgToRole: Map<string, SemanticRole>;

  constructor(frames?: VerbFrame[]) {
    this.framesByVerb = new Map<string, VerbFrame>();
    for (const f of frames ?? buildDefaultFrames()) {
      this.framesByVerb.set(f.verb, f);
    }
    this.extraArgToRole = new Map(ARG_TO_ROLE);
  }

  /** Register an additional frame (e.g. for project-specific tools). */
  register(frame: VerbFrame): void {
    this.framesByVerb.set(frame.verb, frame);
  }

  /** Look up a frame by verb. */
  getFrame(verb: string): VerbFrame | undefined {
    return this.framesByVerb.get(verb);
  }

  /** All registered frames. */
  getAll(): VerbFrame[] {
    return Array.from(this.framesByVerb.values());
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Match a tool call against the frame lexicon.
   *
   * @param toolName - the tool being invoked (write, edit, bash, ...).
   * @param args     - the tool arguments object.
   * @param gate     - the current gate (for gate-compliance scoring).
   */
  match(toolName: string, args: unknown, gate: GateType): FrameMatch {
    const normalizedArgs = this.parseToolArgs(args);
    const frame = this.findBestFrame(toolName);

    if (!frame) {
      return this.noMatchResult(normalizedArgs, gate);
    }

    const slots = this.fillSlots(frame, normalizedArgs);
    const qualityResult = this.computeMatchQuality(frame, slots);
    const confidence = this.computeFrameConfidence(frame, slots);
    const gateCompliant = this.computeGateCompliance(frame, gate);
    const evidence = this.buildEvidence(toolName, frame, slots, gateCompliant);

    return {
      frame,
      slots,
      confidence,
      adjustedConfidence: confidence,
      evidence,
      gateCompliant,
      matchQuality: qualityResult.quality,
      slotStats: {
        requiredSlots: qualityResult.requiredSlots,
        filledRequired: qualityResult.filledRequired,
        filledAll: qualityResult.filledAll,
      },
    };
  }

  // ── Step 1: parseToolArgs ────────────────────────────────────────────────

  /**
   * Normalize the raw args into an ordered Map<string, unknown> of argName→value.
   * Non-object args produce an empty map (caller can still classify by name).
   */
  private parseToolArgs(args: unknown): Map<string, unknown> {
    const out = new Map<string, unknown>();
    if (args === null || args === undefined) return out;
    if (typeof args !== 'object' || Array.isArray(args)) return out;
    for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
      if (v !== undefined) out.set(k, v);
    }
    return out;
  }

  // ── Step 2: findBestFrame ────────────────────────────────────────────────

  /**
   * Resolve a tool name to a frame verb, then to a frame.
   * Falls back to a direct verb lookup for already-canonical verbs.
   */
  private findBestFrame(toolName: string): VerbFrame | null {
    if (!toolName) return null;
    const lower = toolName.toLowerCase().trim();
    const verb = TOOL_TO_VERB.get(lower) ?? lower;
    return this.framesByVerb.get(verb) ?? null;
  }

  // ── Step 3: fillSlots ────────────────────────────────────────────────────

  /**
   * Fill each frame slot from the normalized args.
   * Strategy:
   *   a. If the slot declares argMapping AND that arg is present → fill.
   *   b. Else, scan args for one whose name maps (ARG_TO_ROLE) to this role.
   *   c. Else, leave unfilled.
   */
  private fillSlots(
    frame: VerbFrame,
    args: Map<string, unknown>,
  ): FrameSlot[] {
    return frame.slots.map((def: FrameSlot): FrameSlot => {
      // (a) explicit argMapping
      if (def.argMapping && args.has(def.argMapping)) {
        const value = args.get(def.argMapping);
        if (this.valueMatchesType(value, def.acceptsType)) {
          return {
            role: def.role,
            required: def.required,
            acceptsType: def.acceptsType,
            argMapping: def.argMapping,
            filled: true,
            value,
            source: def.argMapping,
          };
        }
      }
      // (b) generic arg→role scan
      for (const [argName, value] of args) {
        const mappedRole = this.extraArgToRole.get(argName);
        if (mappedRole === def.role && this.valueMatchesType(value, def.acceptsType)) {
          return {
            role: def.role,
            required: def.required,
            acceptsType: def.acceptsType,
            argMapping: def.argMapping,
            filled: true,
            value,
            source: argName,
          };
        }
      }
      // (c) unfilled
      return {
        role: def.role,
        required: def.required,
        acceptsType: def.acceptsType,
        argMapping: def.argMapping,
        filled: false,
      };
    });
  }

  /** Loose type check for slot values (string is the common case). */
  private valueMatchesType(value: unknown, acceptsType: string): boolean {
    if (acceptsType === 'string') return typeof value === 'string' && value.length > 0;
    if (acceptsType === 'number') return typeof value === 'number';
    if (acceptsType === 'boolean') return typeof value === 'boolean';
    return value !== undefined && value !== null;
  }

  // ── Step 4: computeMatch ─────────────────────────────────────────────────

  /**
   * Derive MatchQuality from slot-fill state:
   *   exact  → all required filled AND every slot filled (incl. optional)
   *   strong → all required filled
   *   partial→ >=1 required filled, some required missing
   *   weak   → frame found but zero required filled
   */
  private computeMatchQuality(
    frame: VerbFrame,
    slots: FrameSlot[],
  ): { quality: MatchQuality; requiredSlots: number; filledRequired: number; filledAll: boolean } {
    const required = slots.filter((s: FrameSlot) => s.required);
    const filledRequired = required.filter((s: FrameSlot) => s.filled).length;
    const filledAll = slots.every((s: FrameSlot) => s.filled);

    let quality: MatchQuality;
    if (required.length > 0 && filledRequired === required.length && filledAll) {
      quality = 'exact';
    } else if (required.length > 0 && filledRequired === required.length) {
      quality = 'strong';
    } else if (filledRequired > 0) {
      quality = 'partial';
    } else {
      quality = 'weak';
    }
    // Explicit consumption: return all computed stats so they're externally traceable.
    return { quality, requiredSlots: required.length, filledRequired, filledAll };
  }

  /**
   * Frame-level confidence: required fill ratio, with a small bonus for optional
   * slots filled and for higher match quality.
   */
  private computeFrameConfidence(frame: VerbFrame, slots: FrameSlot[]): number {
    const required = slots.filter((s: FrameSlot) => s.required);
    if (required.length === 0) return 0.9;
    const filledRequired = required.filter((s: FrameSlot) => s.filled).length;
    const fillRatio = filledRequired / required.length;

    const optional = slots.filter((s: FrameSlot) => !s.required);
    const filledOptional = optional.filter((s: FrameSlot) => s.filled).length;
    const optionalBonus = optional.length > 0 ? (filledOptional / optional.length) * 0.1 : 0;

    return Math.min(1, fillRatio + optionalBonus);
  }

  /** True when the frame's allowedGates includes the current gate. */
  private computeGateCompliance(frame: VerbFrame, gate: GateType): boolean {
    if (frame.allowedGates.length === 0) return true;
    return frame.allowedGates.includes(gate);
  }

  // ── Evidence + no-match ──────────────────────────────────────────────────

  private buildEvidence(
    toolName: string,
    frame: VerbFrame,
    slots: FrameSlot[],
    gateCompliant: boolean,
  ): string[] {
    const evidence: string[] = [];
    evidence.push(
      `Tool "${toolName}" resolved to frame verb "${frame.verb}" (intent ${frame.intent})`,
    );
    for (const slot of slots) {
      if (slot.filled) {
        const vt = typeof slot.value;
        evidence.push(
          `Slot ${slot.role} filled from ${slot.source} (value type: ${vt})`,
        );
      } else if (slot.required) {
        evidence.push(`Required slot ${slot.role} is UNFILLED (argMapping: ${slot.argMapping ?? 'none'})`);
      }
    }
    evidence.push(
      `Gate compliance: ${gateCompliant ? 'allowed' : 'NOT allowed'} in current gate`,
    );
    return evidence;
  }

  private noMatchResult(
    args: Map<string, unknown>,
    gate: GateType,
  ): FrameMatch {
    const evidence: string[] = [
      `No frame matched the tool name; ${args.size} arg(s) present`,
    ];
    return {
      frame: null,
      slots: [],
      confidence: 0.0,
      adjustedConfidence: 0.0,
      evidence,
      gateCompliant: true,
      matchQuality: 'no_match',
    };
  }
}
