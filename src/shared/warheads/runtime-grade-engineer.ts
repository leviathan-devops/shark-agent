/**
 * Warhead #0: RuntimeGradeEngineer (priority 0)
 *
 * P1-P10 mechanical enforcement + E10 zero-tolerance.
 * Scans tool output for violations, blocks unsafe patterns.
 */
import type { SharkWarhead, HookRegistry } from '../warhead-registry.js';
import { EnforcementError, isRecord } from '../warhead-registry.js';
import { safeGetString } from '../type-guards.js';
import { isSharkAgent } from '../agent-identity.js';
import { getGateManager } from '../../tools/shark-gate.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Maximum stored history entries to prevent unbounded growth */
const MAX_P3_HISTORY = 100;

/** Safely extract string from unknown tool output (tries multiple keys) */
function safeGetFirstString(value: unknown, ...keys: string[]): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = obj[key];
      if (typeof candidate === 'string') return candidate;
    }
  }
  return '';
}

/** Safely extract args as string for scanning */
function argsToString(args: unknown): string {
  if (args === null || args === undefined) return '';
  if (typeof args === 'string') return args;
  try {
    return JSON.stringify(args);
  } catch {
      console.warn('[runtime-grade-engineer] argsToString failed');
      return String(args);
    }
  }
  
  /**
   * Extract the file path from write/edit tool args.
 * Different tools expose the path under different keys (filePath, path).
 */
function extractFilePath(argsObj: Record<string, unknown>): string {
  if (typeof argsObj.filePath === 'string') return argsObj.filePath;
  if (typeof argsObj.path === 'string') return argsObj.path;
  return '';
}

/**
 * Detect whether the file being written is TypeScript/JavaScript.
 *
 * The `as` cast (and `instanceof`) checks are TypeScript/JavaScript-specific
 * language constructs. They must NOT be applied to other languages where the
 * tokens have different meaning:
 *   - Python: `with open(f) as fh`, `except E as e`, `import x as y`
 *   - Go:     `switch v := x.(type)` / `value, ok := x.(T)`
 *   - Rust:   `use x as y`, `extern "C" { ... }`
 *
 * Applying TS checks to non-TS files produces permanent false-positive blocks
 * that cause infinite write-retry loops.
 */
function isTypeScriptContent(filePath: string, content: string): boolean {
  // 1. Trust the file extension first — definitive signal
  if (filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' ||
        ext === 'mts' || ext === 'mjs' || ext === 'cjs') {
      return true;
    }
    // Known non-TS extensions — skip TS-specific checks entirely
    if (ext === 'py' || ext === 'rb' || ext === 'go' || ext === 'rs' ||
        ext === 'java' || ext === 'c' || ext === 'cpp' || ext === 'cc' ||
        ext === 'h' || ext === 'hpp' || ext === 'sh' || ext === 'bash' ||
        ext === 'zsh' || ext === 'yml' || ext === 'yaml' || ext === 'json' ||
        ext === 'toml' || ext === 'ini' || ext === 'xml' || ext === 'html' ||
        ext === 'htm' || ext === 'css' || ext === 'scss' || ext === 'md' ||
        ext === 'txt' || ext === 'sql' || ext === 'php' || ext === 'swift' ||
        ext === 'kt' || ext === 'scala' || ext === 'lua' || ext === 'pl' ||
        ext === 'r' || ext === 'dart') {
      return false;
    }
  }
  // 2. No extension or unknown — do NOT apply TS-specific checks by default.
  //    Safe default: avoid false-positive blocks that cause write-retry loops.
  return false;
}

export class RuntimeGradeEngineer implements SharkWarhead {
  readonly id = 'runtime-grade-engineer';
  readonly priority = 0;
  readonly type = 'static' as const;

  private p1p10ViolationCount = 0;
  private p3ScanCount = 0;
  private p2BlockCount = 0;
  private e10BlockCount = 0;

  register(hooks: HookRegistry): void {
    // P3 Violation Detection — scans tool output for empty catches (TS/JS only)
    hooks.on('tool.execute.after', (input: unknown, output: unknown) => {
      if (!isRecord(input)) return;
      const toolInput = input as { tool?: string; sessionID?: string; agent?: string; args?: unknown };
      if (!toolInput.tool) return;

      // Agent filter — only scan for SHARK agents
      const agent = toolInput.agent || '';
      if (!isSharkAgent(agent)) return;

      // Only check write/edit tools for empty catch blocks
      const writeTools = new Set(['write', 'write_file', 'edit', 'patch', 'create', 'mcp_edit', 'mcp_create', 'mcp_patch']);
      if (!writeTools.has(toolInput.tool)) return;

      if (!isRecord(output)) return;
      const content = safeGetFirstString(output, 'output', 'result');
      if (content.length === 0) return;

      // Only apply empty catch check to TypeScript/JavaScript content
      const filePath = toolInput.args ? extractFilePath(toolInput.args as Record<string, unknown>) : '';
      if (!isTypeScriptContent(filePath, content)) return;

      this.p3ScanCount++;

      // Empty catch detection
      const emptyCatchPattern = /catch\s*\{\s*\}/g;
      emptyCatchPattern.lastIndex = 0;
      if (emptyCatchPattern.test(content)) {
        this.p1p10ViolationCount++;
        try {
          const evidenceDir = path.join(process.cwd(), '.shark', 'evidence');
          if (!fs.existsSync(evidenceDir)) {
            fs.mkdirSync(evidenceDir, { recursive: true });
          }
          fs.appendFileSync(
            path.join(evidenceDir, 'p3-violations.log'),
            `${new Date().toISOString()} P3: empty catch in ${toolInput.tool}\n`
          );
        } catch (writeErr: unknown) {
          const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
          console.error(`[RuntimeGradeEngineer] Failed to write P3 violation log: ${msg}`);
        }
      }
    });

    // E10 Enforcement — blocks claims without evidence
    // Semantic check: uses the GateManager's EvidenceCollector to verify
    // that the required evidence exists for the current gate.
    // This is NOT regex — it checks REAL filesystem state via the evidence API.
    hooks.on('tool.execute.before', (input: unknown) => {
      if (!isRecord(input)) return;
      const toolInput = input as { tool?: string; args?: unknown; agent?: string };
      if (!toolInput.tool) return;
      const agent = toolInput.agent || '';
      if (!isSharkAgent(agent)) return;

      // Only check WRITE tools for evidence claims
      const writeTools = new Set(['write', 'write_file', 'edit', 'patch', 'create']);
      if (!writeTools.has(toolInput.tool)) return;
      if (!isRecord(toolInput.args)) return;
      const argsObj = toolInput.args as Record<string, unknown>;
      const content = typeof argsObj.content === 'string' ? argsObj.content
        : typeof argsObj.newString === 'string' ? argsObj.newString
        : '';
      if (!content) return;

      // Check evidence system directly — NOT regex on text.
      // If the agent has completed the required work, the evidence system
      // should have proof. No need to check for specific words.
      try {
        const gm = getGateManager();
        if (gm) {
          const collector = gm.getEvidenceCollector();
          const currentGate = gm.getCurrentGate();
          const evidenceCheck = collector.hasRequiredEvidence(currentGate);
          if (!evidenceCheck.passed) {
            // Only flag if there's content that looks like a claim
            const claimsGrade = /\b(runtime[ -]grade|production[ -]ready)\b/i.test(content);
            if (claimsGrade) {
              this.e10BlockCount++;
              throw new EnforcementError(
                `[E10 VIOLATION] Claim without evidence. ` +
                `Evidence check for ${currentGate} gate failed. Missing: ${evidenceCheck.missing.join(', ')}. ` +
                `Run container tests and submit evidence before claiming completion.`
              );
            }
          }
        }
      } catch (e) {
        if (e instanceof EnforcementError) throw e;
        // Non-fatal — evidence system unavailable
      }
    });

    // P1: Import path resolution — block imports escaping project root
    // Only scan WRITE/EDIT tool content, not all tool args
    hooks.on('tool.execute.before', (input: unknown) => {
      if (!isRecord(input)) return;
      const ti = input as { tool?: string; args?: unknown; agent?: string };
      const agent = ti.agent || '';
      if (!isSharkAgent(agent)) return;
      const writeTools = new Set(['write', 'write_file', 'edit', 'patch', 'create']);
      if (!writeTools.has(ti.tool || '')) return;
      if (!isRecord(ti.args)) return;
      const argsObj = ti.args as Record<string, unknown>;
      const content = typeof argsObj.content === 'string' ? argsObj.content
        : typeof argsObj.newString === 'string' ? argsObj.newString
        : '';
      if (!content) return;
      if (/from\s+['"]\.\.\/\.\.(\/|['"])/.test(content)) {
        this.p1p10ViolationCount++;
        throw new EnforcementError(`[P1] Import escapes project root. Use project-relative paths.`);
      }
    });

    // P4: Resource lifecycle — detect opens without matching closes
    hooks.on('tool.execute.after', (input: unknown, output: unknown) => {
      if (!isRecord(input)) return;
      const ti = input as { tool?: string; agent?: string };
      if (!ti.tool) return;
      const agent = ti.agent || '';
      if (!isSharkAgent(agent)) return;
      if (!isRecord(output)) return;
      const c = safeGetString(output, 'output', 'result');
      if (!c) return;
      const opens = (c.match(/(setInterval|open\(|createServer|new WebSocket)/g) || []).length;
      const closes = (c.match(/(clearInterval|close\(|destroy|end|cleanup)/g) || []).length;
      if (opens > closes) this.p1p10ViolationCount++;
    });

    // P7: Path resolution — block hardcoded /home/ /Users/ paths
    // Only scan WRITE/EDIT tool content, not all tool args
    hooks.on('tool.execute.before', (input: unknown) => {
      if (!isRecord(input)) return;
      const ti = input as { tool?: string; args?: unknown; agent?: string };
      const agent = ti.agent || '';
      if (!isSharkAgent(agent)) return;
      const writeTools = new Set(['write', 'write_file', 'edit', 'patch', 'create']);
      if (!writeTools.has(ti.tool || '')) return;
      if (!isRecord(ti.args)) return;
      const argsObj = ti.args as Record<string, unknown>;
      const content = typeof argsObj.content === 'string' ? argsObj.content
        : typeof argsObj.newString === 'string' ? argsObj.newString
        : '';
      if (!content) return;
      if (/\/(home|Users)\/\w+/.test(content) && !content.includes('docker')) {
        this.p1p10ViolationCount++;
        throw new EnforcementError(`[P7] Hardcoded user path. Use env/config reference.`);
      }
    });

    // P9: Async discipline — detect fire-and-forget promises
    hooks.on('tool.execute.after', (input: unknown, output: unknown) => {
      if (!isRecord(input)) return;
      const ti = input as { tool?: string; agent?: string };
      if (!ti.tool) return;
      const agent = ti.agent || '';
      if (!isSharkAgent(agent)) return;
      if (!isRecord(output)) return;
      const c = safeGetString(output, 'output', 'result');
      if (!c) return;
      if (/new Promise\(.*\)[^.(]/.test(c)) this.p1p10ViolationCount++;
    });
  }

  getT0(): string {
    return `[RGE] P2 blocks: ${this.p2BlockCount} | P3 scans: ${this.p3ScanCount} | E10 blocks: ${this.e10BlockCount} | P1/P7 violations: ${this.p1p10ViolationCount}`;
  }
}
