/**
 * Warhead #0.5: StopGuessing (priority 0.5)
 *
 * IL-01: INFERENCE IS NOT EVIDENCE. This warhead exists to KICK GUESSING IN THE NUTS.
 *
 * The pattern: agent writes to a file it hasn't read → it's GUESSING what's in it.
 * This is NOT a "write blocker". The write is just a SYMPTOM.
 * The ROOT PROBLEM is the agent choosing inference over investigation.
 *
 * This uses behavioral intelligence: the readHistory tracks every file the agent
 * has actually looked at. Writing to a file not in that history = GUESSING.
 * No regex needed. The pattern is behavioral, not textual.
 *
 * Every block is a record of: "you guessed instead of looking".
 * The correction tells the agent to STOP GUESSING AND READ.
 *
 * Note: inference LANGUAGE detection ("I think", "probably") is handled by
 * the TheatricalCodeBlock warhead and Semantic Firewall layers.
 * This warhead handles the BEHAVIORAL tracking: read-before-write.
 *
 * ENFORCEMENT lives in Planning Brain onBeforeExecution, NOT here.
 * This warhead is PURE DATA: tracking reads, writes, and exposing history.
 * ZERO throws. ZERO StructuredBlockError. ZERO enforcement logic.
 */
import type { SharkWarhead, HookRegistry } from '../warhead-registry.js';
import { isRecord, safeGetString } from '../type-guards.js';
import { isSharkAgent } from '../agent-identity.js';

const WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'write_file', 'edit', 'patch', 'create']);

export class StopGuessing implements SharkWarhead {
  readonly id = 'stop-guessing';
  readonly priority = 0.5;
  readonly type = 'static' as const;

  private inferencesBlocked = 0;
  private readonly readHistory: Map<string, number> = new Map();
  private readonly writeHistory: Map<string, number> = new Map();
  private filesReadThisSession: number = 0;

  register(hooks: HookRegistry): void {
    hooks.on('tool.execute.before', (input: unknown, output: unknown) => {
      if (!isRecord(input)) return;
      const toolInput = input as { tool?: string; agent?: string };
      if (!toolInput.tool || !WRITE_TOOLS.has(toolInput.tool)) return;
      const agent = toolInput.agent || '';
      if (!isSharkAgent(agent)) return;
      if (!isRecord(output)) return;
      const args = ((output as Record<string, unknown>).args || {}) as Record<string, unknown>;
      const filePath = typeof args.filePath === 'string' ? args.filePath
        : typeof args.path === 'string' ? args.path
        : '';
      if (!filePath) return;

      // PURE TRACKING — no enforcement, no throws
      const lastRead = this.readHistory.get(filePath);
      if (!lastRead || (Date.now() - lastRead) > 300000) {
        this.inferencesBlocked++;
      }
    });
  }

  trackFileRead(filePath: string): void {
    this.readHistory.set(filePath, Date.now());
    this.filesReadThisSession = this.readHistory.size;
  }

  /** Typed accessor for readHistory — used by Planning Brain enforcement */
  getReadHistory(): ReadonlyMap<string, number> {
    return this.readHistory;
  }

  trackWrite(filePath: string): void {
    this.writeHistory.set(filePath, Date.now());
  }

  /** Typed accessor for writeHistory — used by Planning Brain enforcement */
  getWriteHistory(): ReadonlyMap<string, number> {
    return this.writeHistory;
  }

  /**
   * Check if a file was recently read.
   * @unused — retained for future enforcement use (e.g. read-before-write gating).
   */
  wasFileRead(filePath: string, maxAgeMs: number = 300000): boolean {
    const lastRead = this.readHistory.get(filePath);
    return lastRead !== undefined && (Date.now() - lastRead) <= maxAgeMs;
  }

  incrementBlocked(): void {
    this.inferencesBlocked++;
  }

  getT0(): string {
    return `[STOP-GUESSING] Inferences: ${this.inferencesBlocked} | Files read: ${this.filesReadThisSession}`;
  }
}
