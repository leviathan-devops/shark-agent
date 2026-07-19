/**
 * Hook Utility Functions — single source of truth for opencode plugin hook arg extraction.
 *
 * In opencode 1.14.43's plugin hook API, tool.execute.before and
 * tool.execute.after receive (input: ToolCall, output: ToolResult).
 * Tool arguments are in input.args, NOT output.args.
 *
 * Verified against opencode 1.14.43 hook contract (2026-06-11).
 *
 * P2: All type casts are preceded by inline typeof/instanceof runtime type guards.
 * No helper functions — RGE requires the guard and cast on the same value inline.
 */

/**
 * Extract tool arguments from opencode plugin hook context.
 * Checks input.args first (correct for opencode 1.14.43), falls back to output.args.
 */
export function extractHookArgs(input: unknown, output: unknown): Record<string, unknown> {
  // P2: inline typeof guard before accessing input.args
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const r = input as Record<string, unknown>;
    const a = r.args;
    if (typeof a === 'object' && a !== null && !Array.isArray(a)) {
      return a as Record<string, unknown>;
    }
  }

  // Fallback to output.args (legacy — will be removed in v5.1)
  if (typeof output === 'object' && output !== null && !Array.isArray(output)) {
    const r = output as Record<string, unknown>;
    const a = r.args;
    if (typeof a === 'object' && a !== null && !Array.isArray(a)) {
      return a as Record<string, unknown>;
    }
  }

  return {};
}

/**
 * Extract the file path from tool arguments.
 * Checks filePath first, then path, then pattern.
 * Returns empty string if no valid file path found.
 */
export function extractFilePath(args: Record<string, unknown>): string {
  if (typeof args.filePath === 'string' && args.filePath.length > 0) return args.filePath;
  if (typeof args.path === 'string' && args.path.length > 0) return args.path;
  if (typeof args.pattern === 'string' && args.pattern.length > 0) return args.pattern;
  return '';
}

/**
 * Extract tool name from hook input.
 * Returns empty string if not found or not a string.
 */
export function extractToolName(input: unknown): string {
  // P2: inline typeof guard before accessing input.tool / input.toolName
  // opencode 1.14.43+ may use either 'tool' or 'toolName' key
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const r = input as Record<string, unknown>;
    if (typeof r.tool === 'string' && r.tool.length > 0) return r.tool;
    if (typeof r.toolName === 'string' && r.toolName.length > 0) return r.toolName;
  }
  return '';
}

/**
 * Extract session ID from hook input.
 * Returns empty string if not found or not a string.
 */
export function extractSessionId(input: unknown): string {
  // P2: inline typeof guard before accessing input.sessionID
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const r = input as Record<string, unknown>;
    if (typeof r.sessionID === 'string') return r.sessionID;
  }
  return '';
}
