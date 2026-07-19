/**
 * Warhead #6: TheatricalCodeBlock (priority 6)
 *
 * DUAL LAYER:
 *   LAYER 1 (before): Scans write INPUT for patterns. THROWS EnforcementError to BLOCK.
 *   LAYER 2 (after): Scans write OUTPUT for patterns that slipped through. LOGS + COUNTS.
 *
 * Layer 1 is the primary defense. Layer 2 is the safety net for patterns Layer 1 misses.
 */
import type { SharkWarhead, HookRegistry } from '../warhead-registry.js';
import { EnforcementError } from '../warhead-registry.js';
import { isRecord, safeGetString } from '../type-guards.js';
import { isSharkAgent } from '../agent-identity.js';

/** Read-only pattern definitions — these are the patterns that trigger blocks */
const THEATRICAL_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly name: string;
  readonly severity: 'critical' | 'high';
  readonly correction: string;
}> = [

  { pattern: /\/\/\s*(TODO|FIXME|placeholder|hack|temp)/i, name: 'placeholder-code', severity: 'high',
    correction: 'Replace placeholder with real implementation.' },
  { pattern: /\b(probably|I think|I assume|should exist|verified elsewhere)\b/i, name: 'theatrical-evasion', severity: 'critical',
    correction: 'State what you FOUND, not what you THINK. Read the file.' },
  { pattern: /\/\/\s*Mock\s/i, name: 'mock-code', severity: 'high',
    correction: 'Replace mock with real implementation. Mock code is not runtime-grade.' },
  { pattern: /\/\/\s*In this mock/i, name: 'mock-comment', severity: 'high',
    correction: 'Remove mock comment. Implement the real logic.' },
  { pattern: /\b(mock\s+jwt|mock\s+token|fake\s+data|stub\s+implementation)\b/i, name: 'mock-data-fabrication', severity: 'high',
    correction: 'Use real data or actual test fixtures. Mock values are not evidence.' },
  { pattern: /\/\/\s*Mock\s+(Auth|Routes|Login|Register|Reset|User)/i, name: 'mock-module', severity: 'critical',
    correction: 'Remove entire mock module. Implement the real handlers with proper error handling.' },
  { pattern: /Bearer\s+mock-jwt/i, name: 'mock-auth-token', severity: 'critical',
    correction: 'Remove mock auth token. Use real authentication flow or test helpers.' },
  { pattern: /\bblocked\s*:\s*false\b/, name: 'theatrical-blocked-false', severity: 'critical',
    correction: 'Remove theatrical default. Block or allow explicitly.' },
  { pattern: /(?:const|let|var)\s+\w+\s*=\s*\{[^}]*blocked\s*:\s*false[^}]*\};?\s*(?:\r?\n)\s*return\s+\w+\s*;?/, name: 'theatrical-blocked-false-variable', severity: 'critical',
    correction: 'Remove theatrical default. Block or allow explicitly.' },
];

/** Write tools that should be scanned */
const WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'write_file', 'edit', 'patch', 'create']);

export class TheatricalCodeBlock implements SharkWarhead {
  readonly id = 'theatrical-code-block';
  readonly priority = 6;
  readonly type = 'static' as const;

  private beforeBlocks = 0;
  private afterDetections = 0;
  private readonly patternsDetected: Map<string, number> = new Map();

  register(hooks: HookRegistry): void {
    hooks.on('tool.execute.before', (input: unknown, output: unknown) => {
      if (!isRecord(input)) return;
      const toolInput = input as { tool?: string; agent?: string };
      if (!toolInput.tool || !WRITE_TOOLS.has(toolInput.tool)) return;
      const agent = toolInput.agent || '';
      if (!isSharkAgent(agent)) return;
      if (!isRecord(output)) return;
      const args = (output as Record<string, unknown>).args || {};
      const content = isRecord(args)
        ? safeGetString(args, 'content') || safeGetString(args, 'newString')
        : '';
      if (!content) return;
      for (const { pattern, name, severity, correction } of THEATRICAL_PATTERNS) {
        const flags = typeof pattern === 'object' && pattern instanceof RegExp ? pattern.flags : '';
        const source = typeof pattern === 'object' ? pattern.source : pattern;
        const regex = new RegExp(source, flags);
        if (regex.test(content)) {
          this.beforeBlocks++;
          this.patternsDetected.set(name, (this.patternsDetected.get(name) ?? 0) + 1);
          if (severity === 'critical') {
            throw new EnforcementError(
              `[THEATRICAL CODE] ${name} in ${toolInput.tool}. ${correction}`
            );
          }
        }
      }
    });

    hooks.on('tool.execute.after', (input: unknown, output: unknown) => {
      if (!isRecord(input)) return;
      const toolInput = input as { tool?: string; agent?: string };
      if (!toolInput.tool || !WRITE_TOOLS.has(toolInput.tool)) return;
      const agent = toolInput.agent || '';
      if (!isSharkAgent(agent)) return;
      if (!isRecord(output)) return;
      const toolOutput = output as { output?: unknown; result?: unknown };
      const rawOutput = toolOutput.output ?? toolOutput.result ?? '';
      if (typeof rawOutput !== 'string' || rawOutput.length === 0) return;
      for (const { pattern, name } of THEATRICAL_PATTERNS) {
        const flags = typeof pattern === 'object' && pattern instanceof RegExp ? pattern.flags : '';
        const source = typeof pattern === 'object' ? pattern.source : pattern;
        const regex = new RegExp(source, flags);
        if (regex.test(rawOutput)) {
          this.afterDetections++;
          this.patternsDetected.set(name, (this.patternsDetected.get(name) ?? 0) + 1);
        }
      }
    });
  }

  getT0(): string {
    return `[THEATRICAL] Layer 1 blocks: ${this.beforeBlocks} | Layer 2 detections: ${this.afterDetections}`;
  }
}
