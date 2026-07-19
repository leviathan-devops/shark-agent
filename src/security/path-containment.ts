/**
 * Path Containment — Semantic path security.
 * 
 * Resolves paths via fs.realpath() to prevent symlink attacks.
 * Checks against workspace root for containment.
 * 
 * Based on Trident v4.3.2 security/path-containment.ts pattern.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { logInfo } from '../shared/shark-logger.js';

// Tool classification for path-aware enforcement
const READ_TOOLS = new Set(['read', 'glob', 'grep', 'list', 'search', 'rg', 'find']);
const WRITE_TOOLS = new Set(['write', 'edit', 'create', 'write_file', 'writeText']);
const EXEC_TOOLS = new Set(['bash', 'terminal', 'mcp_terminal', 'execute']);

// System paths that should never be MODIFIED (written to)
const SYSTEM_PATHS = ['/etc', '/boot', '/sys', '/proc', '/dev', '/var/lib'];

// Sensitive files that should never be READ (even by read tools)
const SENSITIVE_FILES = new Set([
  '/etc/shadow',
  '/etc/sudoers',
  '/etc/ssh/sshd_config',
]);

// Sensitive file patterns (checked via regex)
const SENSITIVE_PATTERNS: RegExp[] = [
  /\.env$/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /credentials/i,
  /\.htpasswd$/i,
];

export interface PathAnalysis {
  isSystemPath: boolean;
  isSensitive: boolean;
  isContained: boolean;
  purpose: 'config' | 'data' | 'temp' | 'web' | 'system' | 'user' | 'cache' | 'unknown';
  resolvedPath: string;
}

/**
 * Analyze a file path semantically.
 * Returns structured information about the path's nature.
 */
export function analyzePath(filePath: string, workspaceRoot?: string): PathAnalysis {
  const resolved = path.resolve(filePath);
  const lower = resolved.toLowerCase();
  
  // Check system paths
  const isSystemPath = SYSTEM_PATHS.some((sp: string) => lower.startsWith(sp));
  
  // Check sensitive files
  const isSensitive = SENSITIVE_FILES.has(lower) || 
    SENSITIVE_PATTERNS.some((p: RegExp) => p.test(lower));
  
  // Determine purpose
  let purpose: PathAnalysis['purpose'] = 'unknown';
  if (lower.startsWith('/etc/')) purpose = 'config';
  else if (lower.startsWith('/tmp/') || lower.startsWith('/var/tmp/')) purpose = 'temp';
  else if (lower.includes('/www/') || lower.includes('/html/') || lower.includes('/public/')) purpose = 'web';
  else if (lower.startsWith('/var/lib/')) purpose = 'data';
  else if (lower.startsWith('/home/') || lower.startsWith('/root/')) purpose = 'user';
  else if (lower.includes('/cache/') || lower.startsWith('/var/cache/')) purpose = 'cache';
  else if (isSystemPath) purpose = 'system';
  
  // Check workspace containment
  let isContained = true;
  if (workspaceRoot) {
    const root = path.resolve(workspaceRoot);
    const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
    isContained = resolved.startsWith(rootWithSep) || resolved === root;
  }
  
  return {
    isSystemPath,
    isSensitive,
    isContained,
    purpose,
    resolvedPath: resolved,
  };
}

/**
 * Resolve a path securely via fs.realpath().
 * Prevents symlink-based path traversal attacks.
 */
export function resolveSecurePath(filePath: string, workspaceRoot: string): string {
  const resolvedInput = path.resolve(filePath);
  
  try {
    const resolvedRoot = fs.realpathSync(path.resolve(workspaceRoot));
    const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
    
    let realPath: string;
    try {
      // Try to resolve the input path (may not exist yet for writes)
      realPath = fs.realpathSync(resolvedInput);
    } catch {
      logInfo('[path-containment] realpathSync failed, using resolved input');
      realPath = resolvedInput;
    }
    
    if (!realPath.startsWith(rootWithSep) && realPath !== resolvedRoot) {
      throw new Error(`Path traversal blocked: ${realPath} is outside workspace. Allowed project root: ${resolvedRoot}. Write only under this directory.`);
    }
    
    return realPath;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Path traversal blocked')) {
      throw err; // Re-throw containment violations
    }
    // If realpath fails for other reasons, fall back to resolved path
    return resolvedInput;
  }
}

/**
 * Check if a tool+path combination is destructive.
 * Tool-aware: READ tools are NEVER destructive regardless of path.
 * WRITE tools: destructive if targeting system paths.
 * EXEC tools: checked via isDangerousCommand separately.
 */
export function isDestructiveOperation(tool: string, filePath: string): boolean {
  // READ_TOOLS — NEVER destructive. Reading is always safe.
  if (READ_TOOLS.has(tool)) {
    return false;
  }
  
  // WRITE_TOOLS — destructive if targeting system paths
  if (WRITE_TOOLS.has(tool)) {
    const lower = filePath.toLowerCase();
    return SYSTEM_PATHS.some((sp: string) => lower.startsWith(sp));
  }
  
  // EXEC_TOOLS and unknown — not destructive by default (command checked separately)
  return false;
}

/**
 * Check if a read operation targets sensitive content.
 * Even read tools should be blocked from reading SSH keys, shadow, etc.
 */
export function isSensitiveRead(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SENSITIVE_FILES.has(lower) || SENSITIVE_PATTERNS.some((p: RegExp) => p.test(lower));
}

export { READ_TOOLS, WRITE_TOOLS, EXEC_TOOLS, SYSTEM_PATHS };
