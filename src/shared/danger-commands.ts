/**
 * Danger Commands — Consolidated Danger Detection (Single Source of Truth)
 * =====================================================================
 *
 * Bible §7.7, Iron Law 8: ONE source of truth for danger detection.
 *
 * This module consolidates ALL danger/destructive/bash-command patterns from:
 *   1. src/shared/guardian.ts         → DANGEROUS_PATTERNS + isDangerousCommand()
 *   2. src/shark/karpathy/intent-classifier.ts → hasDestructiveArgs() + evaluateBashCommand()
 *
 * Note: src/hooks/v4.1/command-execute-hook.ts contains ANTI-DERAILMENT patterns
 * (theatrical verification, fake tests, host fallback, etc.) — these are behavioral
 * detection, NOT danger/destructive command detection, and are NOT consolidated here.
 *
 * ─── EXPORTS ──────────────────────────────────────────────────────────────────
 *
 *   isDangerousCommand(command: string): boolean
 *     Regex-based detection of catastrophic system commands.
 *     Source: guardian.ts DANGEROUS_PATTERNS.
 *
 *   hasDestructiveArgs(tool: string, args: Record<string, unknown>): boolean
 *     Detects destructive tool arguments (command substrings + blocked paths).
 *     Source: intent-classifier.ts hasDestructiveArgs().
 *
 *   evaluateBashCommand(command: string): 'CRITICAL' | 'MEDIUM' | 'PASS'
 *     Full bash command evaluation with block (critical) and warn (medium) tiers.
 *     Source: intent-classifier.ts evaluateBashCommand().
 */

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface DangerMatch {
  detected: boolean;
  pattern?: string;
  severity: 'CRITICAL' | 'HIGH' | 'NONE';
}

// ─── TIER 1: CRITICAL DANGER PATTERNS (guardian.ts) ──────────────────────────
//
// Anchored regex patterns tested against trimmed command.
// These match the most catastrophic system-destroying commands.

const CRITICAL_DANGER_PATTERNS: RegExp[] = [
  /^rm\s+-rf/,                        // ANY rm -rf — system or project, no exceptions
  /^rm\s+-r\s+/,                      // ANY rm -r — recursive delete
  /^rm\s+--recursive/,                // ANY rm --recursive
  /^rm\s+-rf\s+\//,
  /^rm\s+-rf\s+\/bin/,
  /^rm\s+-rf\s+\/usr/,
  /^rm\s+-rf\s+\/sys/,
  /^rm\s+-rf\s+\/proc/,
  /^dd\s+if=/,
  /^mkfs/,
  /^:(){ :|:& };:/,
];

// ─── TIER 2: DESTRUCTIVE COMMAND SUBSTRINGS (intent-classifier.ts) ───────────
//
// Lowercased substring matches against args.command.
// Detects dangerous flags and operations within larger commands.

const DESTRUCTIVE_COMMAND_PATTERNS: string[] = [
  'rm -rf',
  'rm -r',
  'rm --recursive',
  'mkfs',
  'format',
  'dd if=',
  '> /dev/',
  'chmod 000',
  'chown -R',
];

// ─── TIER 3: BLOCKED FILE PATHS (intent-classifier.ts) ───────────────────────
//
// Checked via startsWith() against lowercased args.filePath.
// These paths are system-critical and must never be written to.

const BLOCKED_FILE_PATHS: string[] = [
  '/etc',
  '/boot',
  '/sys',
  '/proc',
  '/dev',
];

// ─── TIER 4: BASH BLOCK PATTERNS (intent-classifier.ts evaluateBashCommand) ──
//
// Lowercased substring matches against the full command.
// These cause immediate BLOCK — the most dangerous shell operations.

const BASH_BLOCK_PATTERNS: string[] = [
  'rm -rf',                          // ANY rm -rf — hard block, no exceptions
  'rm -r',                           // ANY rm -r — recursive delete blocked
  'rm --recursive',                  // ANY rm --recursive
  'rm -rf /',
  'rm -rf --no-preserve-root',
  ':(){ :|:& };:',
  '> /dev/sda',
  '> /dev/nvme',
  'mkfs.',
  'dd if=/dev/zero',
  'chmod 000 /',
  'chown -R 0:0 /',
  'wget',
  'curl',
];

// ─── TIER 5: BASH WARN PATTERNS (intent-classifier.ts evaluateBashCommand) ───
//
// Lowercased substring matches against the full command.
// These cause WARN — risky operations that require caution but aren't catastrophic.

const BASH_WARN_PATTERNS: string[] = [
  'git push --force',
  'git reset --hard',
  'npm publish',
  'npm run deploy',
  'kill -9',
  'pkill',
  'sudo',
  'su ',
  '> ',
  '>> ',
  '| sh',
  '| bash',
  'chmod',
  'chown',
  'docker rmi',
  'docker rm',
  'drop table',
  'drop database',
];

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

/**
 * Detects catastrophic system-destroying commands using anchored regex patterns.
 *
 * Tests the trimmed command against CRITICAL_DANGER_PATTERNS.
 * Returns true if ANY pattern matches.
 *
 * Source: guardian.ts DANGEROUS_PATTERNS + isDangerousCommand().
 */
export function isDangerousCommand(command: string): boolean {
  if (typeof command !== 'string') return false;
  const trimmed = command.trim();
  for (const pattern of CRITICAL_DANGER_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

/**
 * Detects destructive tool arguments by checking command substrings and file paths.
 *
 * Checks args.command against DESTRUCTIVE_COMMAND_PATTERNS (substring includes).
 * Checks args.filePath against BLOCKED_FILE_PATHS (startsWith).
 *
 * Source: intent-classifier.ts hasDestructiveArgs().
 */
export function hasDestructiveArgs(tool: string, args: Record<string, unknown>): boolean {
  if (typeof tool !== 'string') return false;
  if (typeof args !== 'object' || args === null) return false;
  try {
    if (typeof args.command === 'string') {
      const cmd = args.command.toLowerCase();
      for (const pattern of DESTRUCTIVE_COMMAND_PATTERNS) {
        if (cmd.includes(pattern)) return true;
      }
    }
    if (typeof args.filePath === 'string') {
      const fp = args.filePath.toLowerCase();
      for (const bp of BLOCKED_FILE_PATHS) {
        if (fp.startsWith(bp)) return true;
      }
    }
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[danger-commands] hasDestructiveArgs() error: ${errorMessage}`);
    return false;
  }
}

/**
 * Evaluates a bash command and returns the enforcement level.
 *
 * Checks lowercased trimmed command against BASH_BLOCK_PATTERNS first (returns CRITICAL),
 * then BASH_WARN_PATTERNS (returns MEDIUM), then PASS.
 *
 * Source: intent-classifier.ts evaluateBashCommand().
 */
export function evaluateBashCommand(command: string): 'CRITICAL' | 'MEDIUM' | 'PASS' {
  if (typeof command !== 'string') {
    console.error(`[danger-commands] evaluateBashCommand() received non-string: ${typeof command}`);
    return 'PASS';
  }
  try {
    const cmd = command.toLowerCase().trim();
    if (cmd.length === 0) return 'PASS';

    for (const pattern of BASH_BLOCK_PATTERNS) {
      if (cmd.includes(pattern)) return 'CRITICAL';
    }

    for (const pattern of BASH_WARN_PATTERNS) {
      if (cmd.includes(pattern)) return 'MEDIUM';
    }
    return 'PASS';
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[danger-commands] evaluateBashCommand() error: ${errorMessage}`);
    return 'PASS';
  }
}
