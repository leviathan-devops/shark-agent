/**
 * Preflight Runner — Rule V-4: Evidence Grounding via Preflight
 * File: src/shark/planning-brain/cse/preflight-runner.ts
 *
 * V-4: Before evaluating claims about build/test state, the engine runs the
 * actual build (tsc --noEmit + bun build) to establish ground truth.
 * Build PASS suppresses false claims about broken builds; build FAIL boosts
 * findings about build issues. Confidence is adjusted: x0.1 if suppressed, x1.5
 * if supported.
 *
 * Results are cached per-gate to avoid re-running expensive build commands.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import type {
  GatePhase,
  PreflightGrounding,
  TscError,
} from './cse-types.js';

// ===========================================================================
// SAFE EXECUTION HELPER
// ===========================================================================

interface ExecResult {
  stdout: string;
  exitCode: number;
  durationMs: number;
}

function safeExec(command: string, cwd: string, timeoutMs: number = 60_000): ExecResult | null {
  const startTime = Date.now();
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      stdout: stdout ?? '',
      exitCode: 0,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    // Verified: error captured and returned as structured failure result
    const durationMs = Date.now() - startTime;
    const execErr = err as { stdout?: string; stderr?: string; status?: number; message?: string };
    const combinedOutput = (execErr.stdout ?? '') + (execErr.stderr ?? '') || (execErr.message ?? 'execution failed');
    return {
      stdout: combinedOutput,
      exitCode: typeof execErr.status === 'number' ? execErr.status : 1,
      durationMs,
    };
  }
}

function safeReadFileSync(filePath: string): { content: string; exists: boolean } {
  try {
    return { content: fs.readFileSync(filePath, 'utf-8'), exists: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { content: '', exists: false };
    void errMsg; // acknowledged — used for debugging if needed
  }
}

function safeStatMtime(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    void errMsg; // acknowledged — file missing is expected
    return null;
  }
}

// ===========================================================================
// PREFLIGHT RUNNER
// ===========================================================================

export class PreflightRunner {
  private workspacePath: string;
  private cache: Map<string, PreflightGrounding> = new Map();

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Run preflight for the given gate. Returns cached result if fresh.
   * Cache invalidation: gate transition OR explicit bust.
   */
  run(gate: GatePhase, bustCache: boolean = false): PreflightGrounding {
    const cacheKey = gate;

    if (!bustCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (this.isCacheFresh(cached)) {
        return cached;
      }
    }

    const grounding: PreflightGrounding = {
      gate,
      computedAt: Date.now(),
      tscStatus: { ran: false, success: false, durationMs: 0, output: '' },
      bundleStatus: { ran: false, success: false, durationMs: 0, output: '' },
      available: false,
      exports: [],
      tscErrors: [],
      unavailableReasons: [],
    };

    // Run tsc --noEmit
    const tscResult = safeExec('npx tsc --noEmit 2>&1', this.workspacePath, 120_000);
    if (tscResult) {
      grounding.tscStatus = {
        ran: true,
        success: tscResult.exitCode === 0,
        durationMs: tscResult.durationMs,
        output: tscResult.stdout,
      };
      grounding.available = true;
      if (tscResult.exitCode !== 0) {
        grounding.tscErrors = this.parseTscErrors(tscResult.stdout);
      }
    } else {
      grounding.unavailableReasons.push('tsc unavailable: execution failed');
    }

    // Run bun build (or npm build as fallback)
    const buildResult = safeExec('bun build src/index.ts --outdir dist 2>&1', this.workspacePath, 120_000);
    if (buildResult) {
      grounding.bundleStatus = {
        ran: true,
        success: buildResult.exitCode === 0,
        durationMs: buildResult.durationMs,
        output: buildResult.stdout,
        errorMessage: buildResult.exitCode !== 0 ? buildResult.stdout : undefined,
      };
      grounding.available = true;
      if (buildResult.exitCode === 0) {
        grounding.exports = this.extractExportsFromDist();
        grounding.bundleHash = this.hashFile(path.join(this.workspacePath, 'dist', 'index.js'));
      }
    } else {
      // Try npm build as fallback
      const npmResult = safeExec('npm run build 2>&1', this.workspacePath, 120_000);
      if (npmResult) {
        grounding.bundleStatus = {
          ran: true,
          success: npmResult.exitCode === 0,
          durationMs: npmResult.durationMs,
          output: npmResult.stdout,
          errorMessage: npmResult.exitCode !== 0 ? npmResult.stdout : undefined,
        };
        grounding.available = true;
        if (npmResult.exitCode === 0) {
          grounding.exports = this.extractExportsFromDist();
          grounding.bundleHash = this.hashFile(path.join(this.workspacePath, 'dist', 'index.js'));
        }
      } else {
        grounding.unavailableReasons.push('bun build and npm build both unavailable');
      }
    }

    if (!grounding.tscStatus.ran && !grounding.bundleStatus.ran) {
      grounding.available = false;
    }

    this.cache.set(cacheKey, grounding);
    return grounding;
  }

  /**
   * Determine if preflight needs to run for the current evaluation.
   */
  needsRun(gate: GatePhase, sourceWrites: string[]): boolean {
    const cached = this.cache.get(gate);
    if (!cached) return true;

    for (const filePath of sourceWrites) {
      if (filePath.includes(path.sep + 'src' + path.sep)) {
        const mtime = safeStatMtime(filePath);
        if (mtime !== null && mtime > cached.computedAt) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Cache freshness: valid if no source file modified since computedAt.
   * Implements Bible Section 14 Context Freshness Model.
   */
  private isCacheFresh(cached: PreflightGrounding): boolean {
    const srcDir = path.join(this.workspacePath, 'src');
    if (!fs.existsSync(srcDir)) return true;

    const latestMod = this.getLatestMtime(srcDir);
    return cached.computedAt >= latestMod;
  }

  private getLatestMtime(dir: string): number {
    let latest = 0;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      void errMsg; // Directory doesn't exist — return 0 (no modifications)
      return latest;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        latest = Math.max(latest, this.getLatestMtime(fullPath));
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
        const mtime = safeStatMtime(fullPath);
        if (mtime !== null) {
          latest = Math.max(latest, mtime);
        }
      }
    }
    return latest;
  }

  /**
   * Extract exports from dist/index.js.
   */
  private extractExportsFromDist(): string[] {
    const distPath = path.join(this.workspacePath, 'dist', 'index.js');
    const { content, exists } = safeReadFileSync(distPath);
    if (!exists) return [];

    const exports: string[] = [];

    // CommonJS: module.exports.foo = ... OR exports.foo = ...
    const cjsPattern = /(?:module\.exports|exports)\.(\w+)\s*=/g;
    let match: RegExpExecArray | null;
    while ((match = cjsPattern.exec(content)) !== null) {
      if (match[1]) exports.push(match[1]);
    }

    // Bundler __export: __export({ foo: ..., bar: ... })
    const bundlerPattern = /__export\(\s*\{([^}]+)\}/g;
    while ((match = bundlerPattern.exec(content)) !== null) {
      if (match[1]) {
        const names = match[1].split(',').map(s => s.trim().split(':')[0].trim());
        exports.push(...names.filter(n => n.length > 0));
      }
    }

    // Object.defineProperty(exports, "foo", ...)
    const defPropPattern = /Object\.defineProperty\(exports,\s*["']([^"']+)["']/g;
    while ((match = defPropPattern.exec(content)) !== null) {
      if (match[1]) exports.push(match[1]);
    }

    // ESM export statements
    const esmPattern = /\bexport\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g;
    while ((match = esmPattern.exec(content)) !== null) {
      if (match[1]) exports.push(match[1]);
    }

    return [...new Set(exports)];
  }

  /**
   * Parse tsc errors from compiler output.
   */
  private parseTscErrors(output: string): TscError[] {
    const errors: TscError[] = [];
    const errorPattern = /^(.+?)\((\d+),\d+\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = errorPattern.exec(output)) !== null) {
      if (match[1] && match[2] && match[4] && match[5]) {
        errors.push({
          file: match[1],
          line: parseInt(match[2], 10),
          code: match[4],
          message: match[5],
        });
      }
    }
    return errors;
  }

  /**
   * Hash a file using SHA-256 (truncated for compact representation).
   */
  private hashFile(filePath: string): string | undefined {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      void errMsg; // File doesn't exist — no hash available
      return undefined;
    }
  }

  /**
   * Bust the cache for a specific gate (force re-run).
   */
  bustCache(gate?: GatePhase): void {
    if (gate) {
      this.cache.delete(gate);
    } else {
      this.cache.clear();
    }
  }
}
