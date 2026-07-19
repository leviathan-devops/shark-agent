/**
 * Tool Record Capture — B-1: Capture and hash tool calls
 *
 * Spec: PSE_PROBLEM_SOLVING_ENGINE_SPEC.md §4, §19 (Appendix A)
 *
 * Captures each tool call into a ToolCallRecord with:
 *   - SHA-256 argsHash (16 hex chars)
 *   - SHA-256 outputHash (16 hex chars)
 *   - File extraction from args
 *   - Error detection from output
 *   - Completion claim detection from output
 *   - Error signature extraction
 */

import { createHash } from 'node:crypto';
import type { ToolCallRecord, ToolCategory } from './pse-types.js';

// ─── Tool Name → Category Mapping ───────────────────────────────────────────

/** Map of known tool names to their behavioral category. */
const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
  // EXPLORE
  read: 'EXPLORE',
  glob: 'EXPLORE',
  grep: 'EXPLORE',
  find: 'EXPLORE',
  ls: 'EXPLORE',
  webfetch: 'EXPLORE',
  'tradingview-mcp_list_pages': 'EXPLORE',
  'tradingview-mcp_take_snapshot': 'EXPLORE',

  // EXECUTE
  bash: 'EXECUTE',
  exec: 'EXECUTE',
  run: 'EXECUTE',
  shell: 'EXECUTE',

  // CREATE
  write: 'CREATE',
  'write-file': 'CREATE',
  mkdir: 'CREATE',
  'create-file': 'CREATE',
  'visual-cortex_spawn_container_tile': 'CREATE',

  // MODIFY
  edit: 'MODIFY',
  patch: 'MODIFY',
  replace: 'MODIFY',
  'edit-file': 'MODIFY',

  // VERIFY
  'shark-gate': 'VERIFY',
  'manta-gate': 'VERIFY',
  verify: 'VERIFY',
  check: 'VERIFY',
  lint: 'VERIFY',
  validate: 'VERIFY',
  'manta-code-review': 'VERIFY',
  'manta-runtime-audit': 'VERIFY',
  'manta-code-audit': 'VERIFY',
  'manta-test-runner': 'VERIFY',
  'manta-evidence': 'VERIFY',

  // ANALYZE
  audit: 'ANALYZE',
  analyze: 'ANALYZE',
  review: 'ANALYZE',
  'trident-code-audit': 'ANALYZE',
  'trident-gate': 'ANALYZE',
};

/** Tools that write or modify the filesystem. */
const WRITE_TOOLS = new Set<string>([
  'write', 'write-file', 'create-file', 'edit', 'patch', 'replace', 'edit-file',
]);

/** Tools that read filesystem content. */
const READ_TOOLS = new Set<string>([
  'read', 'glob', 'grep', 'find',
]);

/** Args keys that may contain file paths. */
const FILE_PATH_KEYS = ['filePath', 'path', 'file', 'filename', 'dest', 'destPath', 'source', 'src'];

// ─── Hash Functions (Spec §19.1, §19.2) ──────────────────────────────────────

/**
 * Hash tool arguments into a stable, comparable string.
 * Uses real SHA-256 (crypto.createHash), truncated to N hex chars.
 */
export function hashArgs(args: unknown, truncateLength: number = 16): string {
  const argsStr = safeStringify(args || {});
  const hash = createHash('sha256').update(argsStr).digest('hex');
  return hash.substring(0, truncateLength);
}

/**
 * Hash tool output into a stable, comparable string.
 * Normalizes objects/strings before hashing.
 */
export function hashOutput(output: unknown, truncateLength: number = 16): string {
  const outputStr = normalizeToString(output);
  const hash = createHash('sha256').update(outputStr).digest('hex');
  return hash.substring(0, truncateLength);
}

/**
 * Generic string hasher for internal use.
 */
export function hashString(str: string, truncateLength: number = 16): string {
  const hash = createHash('sha256').update(str).digest('hex');
  return hash.substring(0, truncateLength);
}

// ─── Normalization Helpers ──────────────────────────────────────────────────

/**
 * Safely stringify any value to JSON, handling circular refs.
 */
function safeStringify(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  } catch {
    // Circular reference or other JSON failure — use String fallback
    return String(value ?? '');
  }
}

/**
 * Normalize any output to a string for hashing.
 */
function normalizeToString(output: unknown): string {
  if (output === null || output === undefined) return '';
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

// ─── File Extraction (Spec §4.3) ────────────────────────────────────────────

/**
 * Extract file paths from tool arguments.
 * Scans known arg keys and extracts string values.
 */
export function extractFilesTouched(args: unknown): string[] {
  if (!args || typeof args !== 'object') return [];
  const obj = args as Record<string, unknown>;
  const files: string[] = [];

  // Check known file path keys
  for (const key of FILE_PATH_KEYS) {
    const val = obj[key];
    if (typeof val === 'string' && val.length > 0) {
      files.push(val);
    }
    // Also check for arrays of paths
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === 'string' && item.length > 0) {
          files.push(item);
        }
      }
    }
  }

  // For bash/exec tools, extract file paths from command string
  if (typeof obj.command === 'string' || typeof obj.cmd === 'string') {
    const cmd = (obj.command as string) || (obj.cmd as string) || '';
    // Extract paths from common patterns: file.ts, src/file.js, etc.
    const pathMatches = cmd.match(/[\w./\-]+\.\w{1,5}/g);
    if (pathMatches) {
      for (const m of pathMatches) {
        // Only add if it looks like a file path (has extension, not a flag)
        if (!m.startsWith('-') && !m.startsWith('--')) {
          files.push(m);
        }
      }
    }
  }

  // Deduplicate
  return [...new Set(files)];
}

/**
 * Extract the primary file path from a record.
 */
export function extractPrimaryFilePath(args: unknown, filesTouched: string[]): string | null {
  if (filesTouched.length > 0) return filesTouched[0];
  if (!args || typeof args !== 'object') return null;
  const obj = args as Record<string, unknown>;
  if (typeof obj.filePath === 'string') return obj.filePath;
  if (typeof obj.path === 'string') return obj.path;
  return null;
}

// ─── Bytes Written Estimation ───────────────────────────────────────────────

/**
 * Estimate bytes written for write/edit tools.
 * Reads file size from disk if possible, otherwise uses content length.
 */
export function estimateBytesWritten(
  toolName: string,
  args: unknown,
  filesTouched: string[],
  basePath: string
): number {
  if (!WRITE_TOOLS.has(toolName) || filesTouched.length === 0) {
    return 0;
  }

  // If content is provided in args, estimate from that
  if (args && typeof args === 'object') {
    const obj = args as Record<string, unknown>;
    if (typeof obj.content === 'string') {
      return Buffer.byteLength(obj.content, 'utf-8');
    }
    if (typeof obj.newString === 'string') {
      return Buffer.byteLength(obj.newString, 'utf-8');
    }
    if (typeof obj.text === 'string') {
      return Buffer.byteLength(obj.text, 'utf-8');
    }
  }

  // Fallback: try to stat the file
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const fullPath = path.isAbsolute(filesTouched[0])
      ? filesTouched[0]
      : path.join(basePath, filesTouched[0]);
    const stat = fs.statSync(fullPath);
    return stat.size;
  } catch {
    return 0;
  }
}

// ─── Error Detection (Spec §4.4, §19.3) ──────────────────────────────────────

/**
 * Error patterns to check in tool output.
 * Permitted 5-10% regex subset for structural classification.
 */
const ERROR_PATTERNS = [
  /error\s+TS\d+/i,            // TypeScript errors
  /cannot find module/i,        // Import errors
  /module not found/i,
  /could not resolve/i,
  /TypeError/i,                 // Runtime errors
  /ReferenceError/i,
  /SyntaxError/i,
  /AssertionError/i,            // Test failures
  /Expected.*Received/i,
  /\bFAIL\b/,                   // Test failure marker
  /command not found/i,
  /no such file or directory/i,
  /permission denied/i,
  /exited with code [1-9]/,     // Non-zero exit
  /\[ERROR\]/i,
  /fatal:/i,                    // Git fatal errors
  /exception/i,
];

/**
 * Check if tool output contains error patterns.
 */
export function detectOutputError(output: unknown): boolean {
  const outputStr = normalizeToString(output).toLowerCase();
  if (!outputStr) return false;
  return ERROR_PATTERNS.some(pattern => pattern.test(outputStr));
}

/**
 * Extract a normalized error signature from tool output.
 * Permitted regex subset for structural classification (Spec §19.3).
 *
 * Returns one of:
 *   TS_ERROR:NNNN       — TypeScript compilation errors
 *   IMPORT_ERROR         — Module not found
 *   RUNTIME_ERROR:Type   — TypeError, ReferenceError, etc.
 *   TEST_FAILURE         — Assertion failures
 *   BUILD_ERROR          — Generic build failures
 *   UNKNOWN:hash8        — Unrecognized error
 *   null                 — No error detected
 */
export function extractErrorSignature(output: unknown): string | null {
  const outputStr = normalizeToString(output);

  // TypeScript errors
  const tsMatch = outputStr.match(/error\s+TS(\d+):/i);
  if (tsMatch) return `TS_ERROR:${tsMatch[1]}`;

  // Import errors
  if (/cannot find module|module not found|could not resolve/i.test(outputStr)) {
    return 'IMPORT_ERROR';
  }

  // Runtime errors
  const runtimeMatch = outputStr.match(/(TypeError|ReferenceError|SyntaxError)/);
  if (runtimeMatch) return `RUNTIME_ERROR:${runtimeMatch[1]}`;

  // Test failures
  if (/AssertionError|Expected.*Received|\bFAIL\b/.test(outputStr)) {
    return 'TEST_FAILURE';
  }

  // Generic build error
  if (/error|Error|ERROR/.test(outputStr) && /build|compile|tsc/i.test(outputStr)) {
    return 'BUILD_ERROR';
  }

  // Exit code errors
  if (/exited with code ([1-9])/.test(outputStr)) {
    const exitMatch = outputStr.match(/exited with code (\d+)/);
    if (exitMatch) return `EXIT_ERROR:${exitMatch[1]}`;
  }

  // Permission/path errors
  if (/no such file or directory|permission denied/i.test(outputStr)) {
    return 'FS_ERROR';
  }

  // Fallback: hash of first error line
  const lines = outputStr.split('\n');
  const errorLine = lines.find(l =>
    /error|Error|ERROR|fail|FAIL|fatal|exception/i.test(l)
  );
  if (errorLine) {
    return `UNKNOWN:${hashString(errorLine.trim(), 8)}`;
  }

  return null;
}

// ─── Completion Claim Detection (Spec §4.5, §19.4) ───────────────────────────

/**
 * Check if tool output contains a completion claim.
 * Scans STRUCTURED tool output (stdout/stderr), NOT agent messages.
 */
export function hasCompletionClaim(
  output: unknown,
  keywords: string[]
): boolean {
  const outputStr = normalizeToString(output).toLowerCase();
  if (!outputStr) return false;
  return keywords.some(kw => outputStr.includes(kw.toLowerCase()));
}

// ─── Tool Categorization ────────────────────────────────────────────────────

/**
 * Categorize a tool by its behavioral archetype.
 * Uses known mapping, then falls back to name-based heuristics.
 */
export function categorizeToolForPSE(toolName: string): ToolCategory {
  // Direct lookup
  if (TOOL_CATEGORY_MAP[toolName]) {
    return TOOL_CATEGORY_MAP[toolName];
  }

  // Heuristic fallbacks
  const lower = toolName.toLowerCase();

  if (lower.includes('read') || lower.includes('glob') || lower.includes('grep') ||
      lower.includes('search') || lower.includes('find') || lower.includes('list')) {
    return 'EXPLORE';
  }

  if (lower.includes('write') || lower.includes('create') || lower.includes('mkdir')) {
    return 'CREATE';
  }

  if (lower.includes('edit') || lower.includes('patch') || lower.includes('modify') ||
      lower.includes('replace') || lower.includes('update')) {
    return 'MODIFY';
  }

  if (lower.includes('bash') || lower.includes('exec') || lower.includes('run') ||
      lower.includes('shell') || lower.includes('command')) {
    return 'EXECUTE';
  }

  if (lower.includes('gate') || lower.includes('verify') || lower.includes('check') ||
      lower.includes('test') || lower.includes('lint') || lower.includes('validate')) {
    return 'VERIFY';
  }

  if (lower.includes('audit') || lower.includes('review') || lower.includes('analyze')) {
    return 'ANALYZE';
  }

  // Default: assume explore (safe, non-destructive)
  return 'EXPLORE';
}

// ─── Main Capture Function ──────────────────────────────────────────────────

/**
 * Create a ToolCallRecord from raw tool execution data.
 * This is the entry point for the sliding window.
 */
export function createToolCallRecord(
  toolName: string,
  args: unknown,
  output: unknown,
  gate: string | null,
  succeeded: boolean,
  config: {
    hashTruncateLength: number;
    completionClaimKeywords: string[];
    basePath: string;
  },
  id: number
): ToolCallRecord {
  const argsHash = hashArgs(args, config.hashTruncateLength);
  const outputHash = hashOutput(output, config.hashTruncateLength);
  const category = categorizeToolForPSE(toolName);
  const filesTouched = extractFilesTouched(args);
  const primaryFilePath = extractPrimaryFilePath(args, filesTouched);
  const bytesWritten = estimateBytesWritten(toolName, args, filesTouched, config.basePath);
  const outputHadError = !succeeded || detectOutputError(output);
  const outputHadCompletionClaim = hasCompletionClaim(output, config.completionClaimKeywords);
  const errorSignature = outputHadError ? extractErrorSignature(output) : null;

  return {
    id,
    timestamp: Date.now(),
    toolName,
    category,
    argsHash,
    outputHash,
    success: succeeded,
    outputHadError,
    outputHadCompletionClaim,
    gateAtExecution: gate,
    filesTouched,
    bytesWritten,
    primaryFilePath,
    errorSignature,
  };
}
