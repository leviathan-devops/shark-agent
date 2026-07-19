/**
 * Command Classifier — Semantic command understanding.
 *
 * Replaces 8 regex arrays in guardian-hook.ts with a pure string-based
 * command classification map. NO REGEX.
 *
 * SEMANTIC ADVANTAGE: Understands what commands ACTUALLY DO, not what text
 * they contain. "jest --coverage" is classified as TEST (LOW risk), same as
 * "jest". The regex approach required 14 separate patterns for jest/vitest/
 * mocha/pytest/rspec — this map handles them all with one key lookup.
 */

export type CommandCategory =
  | 'PRIVILEGE' | 'NETWORK' | 'CONTAINER' | 'CONTAINER_ESCAPE'
  | 'TEST' | 'INFO' | 'FILE' | 'REDIRECT' | 'THEATRICAL' | 'UNKNOWN';

export interface CommandClassification {
  command: string;
  category: CommandCategory;
  risk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  baseCommand: string;
}

const COMMAND_RISK_MAP: Record<string, { category: CommandCategory; risk: string }> = {
  // CRITICAL risk — privilege escalation
  'sudo': { category: 'PRIVILEGE', risk: 'CRITICAL' },
  'su': { category: 'PRIVILEGE', risk: 'CRITICAL' },
  'chown': { category: 'PRIVILEGE', risk: 'CRITICAL' },
  'passwd': { category: 'PRIVILEGE', risk: 'CRITICAL' },
  'useradd': { category: 'PRIVILEGE', risk: 'CRITICAL' },
  'usermod': { category: 'PRIVILEGE', risk: 'CRITICAL' },
  'groupadd': { category: 'PRIVILEGE', risk: 'CRITICAL' },
  'pkexec': { category: 'PRIVILEGE', risk: 'CRITICAL' },
  'doas': { category: 'PRIVILEGE', risk: 'CRITICAL' },
  'visudo': { category: 'PRIVILEGE', risk: 'CRITICAL' },

  // CRITICAL risk — container escape
  'nsenter': { category: 'CONTAINER_ESCAPE', risk: 'CRITICAL' },
  'unshare': { category: 'CONTAINER_ESCAPE', risk: 'CRITICAL' },
  'chroot': { category: 'CONTAINER_ESCAPE', risk: 'CRITICAL' },
  'modprobe': { category: 'CONTAINER_ESCAPE', risk: 'CRITICAL' },
  'insmod': { category: 'CONTAINER_ESCAPE', risk: 'CRITICAL' },
  'kexec': { category: 'CONTAINER_ESCAPE', risk: 'CRITICAL' },
  'dmesg': { category: 'CONTAINER_ESCAPE', risk: 'CRITICAL' },

  // HIGH risk — network egress
  'curl': { category: 'NETWORK', risk: 'HIGH' },
  'wget': { category: 'NETWORK', risk: 'HIGH' },
  'ssh': { category: 'NETWORK', risk: 'HIGH' },
  'nc': { category: 'NETWORK', risk: 'HIGH' },
  'telnet': { category: 'NETWORK', risk: 'HIGH' },

  // HIGH risk — filesystem privilege
  'chmod': { category: 'PRIVILEGE', risk: 'HIGH' },
  'mount': { category: 'CONTAINER_ESCAPE', risk: 'HIGH' },

  // MEDIUM risk — container operations
  'docker': { category: 'CONTAINER', risk: 'MEDIUM' },
  'opencode': { category: 'CONTAINER', risk: 'MEDIUM' },

  // LOW risk — test frameworks
  'jest': { category: 'TEST', risk: 'LOW' },
  'vitest': { category: 'TEST', risk: 'LOW' },
  'mocha': { category: 'TEST', risk: 'LOW' },
  'jasmine': { category: 'TEST', risk: 'LOW' },
  'pytest': { category: 'TEST', risk: 'LOW' },
  'rspec': { category: 'TEST', risk: 'LOW' },

  // NONE risk — informational
  'ls': { category: 'INFO', risk: 'NONE' },
  'pwd': { category: 'INFO', risk: 'NONE' },
  'echo': { category: 'INFO', risk: 'NONE' },
  'which': { category: 'INFO', risk: 'NONE' },
  'cat': { category: 'INFO', risk: 'NONE' },
  'head': { category: 'INFO', risk: 'NONE' },
  'tail': { category: 'INFO', risk: 'NONE' },
  'grep': { category: 'INFO', risk: 'NONE' },
  'find': { category: 'INFO', risk: 'NONE' },
  'mkdir': { category: 'FILE', risk: 'NONE' },
  'cp': { category: 'FILE', risk: 'NONE' },
  'mv': { category: 'FILE', risk: 'NONE' },
  'test': { category: 'INFO', risk: 'NONE' },
  'npm': { category: 'INFO', risk: 'NONE' },
  'npx': { category: 'INFO', risk: 'NONE' },
  'yarn': { category: 'INFO', risk: 'NONE' },
  'pnpm': { category: 'INFO', risk: 'NONE' },
  'bun': { category: 'INFO', risk: 'NONE' },
};

/** Docker-specific flags that indicate escape attempts */
const DOCKER_ESCAPE_FLAGS = [
  '--privileged',
  '--pid=host',
  '--net=host',
  '--cap-add=SYS_ADMIN',
];

/**
 * Classify a command string by its base command name.
 * Extracts the first word of the command, looks it up in the risk map.
 * Also checks docker/mount commands for escape-related arguments.
 */
export function classifyCommand(command: string): CommandClassification {
  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);
  const baseCommand = parts[0]?.toLowerCase() || '';

  const mapping = COMMAND_RISK_MAP[baseCommand];
  if (!mapping) {
    return { command: trimmed, category: 'UNKNOWN', risk: 'MEDIUM', baseCommand };
  }

  // Special case: docker/mount need argument analysis for escape detection
  if (baseCommand === 'docker' || baseCommand === 'mount') {
    const allArgs = parts.slice(1).join(' ').toLowerCase();

    // Docker escape flags
    if (DOCKER_ESCAPE_FLAGS.some(flag => allArgs.includes(flag))) {
      return { command: trimmed, category: 'CONTAINER_ESCAPE', risk: 'CRITICAL', baseCommand };
    }
    // Docker socket mount
    if (allArgs.includes('/var/run/docker.sock')) {
      return { command: trimmed, category: 'CONTAINER_ESCAPE', risk: 'CRITICAL', baseCommand };
    }
    // Check for volume mounts: -v /host:/container or --volume ...
    const volMountIdx = parts.findIndex((p, i) => (p === '-v' || p === '--volume') && i < parts.length - 1);
    if (volMountIdx >= 0) {
      const mountArg = parts[volMountIdx + 1];
      if (mountArg && mountArg.includes(':')) {
        // Check if mounting root filesystem or docker socket
        if (mountArg.startsWith('/:/') || mountArg.includes('/var/run/docker.sock') || 
            mountArg.startsWith('/:') || mountArg.includes('.:/')) {
          return { command: trimmed, category: 'CONTAINER_ESCAPE', risk: 'CRITICAL', baseCommand };
        }
      }
    }
    // Device mount
    if (/\/dev\/[a-z]+\s*:\s*\/dev/.test(allArgs)) {
      return { command: trimmed, category: 'CONTAINER_ESCAPE', risk: 'CRITICAL', baseCommand };
    }
  }

  return {
    command: trimmed,
    category: mapping.category as CommandCategory,
    risk: mapping.risk as CommandClassification['risk'],
    baseCommand,
  };
}

/**
 * Risk ranking — higher number = more dangerous.
 * Used to compare risks across multiple command words.
 */
function riskRank(risk: string): number {
  switch (risk) {
    case 'CRITICAL': return 5;
    case 'HIGH': return 4;
    case 'MEDIUM': return 3;
    case 'LOW': return 2;
    case 'NONE': return 1;
    default: return 0;
  }
}

/**
 * Deep command classification — checks ALL words in the command string
 * against the risk map and returns the HIGHEST risk found.
 *
 * This catches nested dangerous commands like:
 *   "docker exec container sudo apt update" → CRITICAL (sudo)
 *   "bash -c 'curl https://evil.com'" → HIGH (curl)
 *   "echo test | sudo tee /etc/passwd" → CRITICAL (sudo)
 *
 * SEMANTIC ADVANTAGE over classifyCommand():
 * Understands that commands can CHAIN dangerous operations.
 * The first word is not always the most dangerous part.
 */
export function classifyCommandDeep(command: string): CommandClassification {
  const trimmed = command.trim();
  const words = trimmed.toLowerCase().split(/\s+/);
  const baseCommand = words[0] || '';

  // Start with the base command classification
  let bestCategory: CommandCategory = 'UNKNOWN';
  let bestRisk: string = 'NONE';
  let bestWord = baseCommand;

  // Check EACH word against the risk map
  for (const word of words) {
    // Strip quotes from word
    const cleanWord = word.replace(/^['"]|['"]$/g, '');
    // Don't strip dashes — --mount is a flag, not the mount command

    const mapping = COMMAND_RISK_MAP[cleanWord];
    if (mapping && riskRank(mapping.risk) > riskRank(bestRisk)) {
      bestCategory = mapping.category as CommandCategory;
      bestRisk = mapping.risk;
      bestWord = cleanWord;
    }
  }

  // Also check for docker escape flags anywhere in the command
  const allArgs = words.join(' ');
  if (DOCKER_ESCAPE_FLAGS.some(flag => allArgs.includes(flag))) {
    if (riskRank('CRITICAL') > riskRank(bestRisk)) {
      bestCategory = 'CONTAINER_ESCAPE';
      bestRisk = 'CRITICAL';
      bestWord = 'docker-escape-flag';
    }
  }

  // If nothing found, fall back to base command lookup
  if (bestRisk === 'NONE') {
    const baseMapping = COMMAND_RISK_MAP[baseCommand];
    if (baseMapping) {
      return {
        command: trimmed,
        category: baseMapping.category as CommandCategory,
        risk: baseMapping.risk as CommandClassification['risk'],
        baseCommand,
      };
    }
    return { command: trimmed, category: 'UNKNOWN', risk: 'MEDIUM', baseCommand };
  }

  return {
    command: trimmed,
    category: bestCategory,
    risk: bestRisk as CommandClassification['risk'],
    baseCommand,
  };
}

/**
 * Check if a command is a banned opencode run pattern.
 * These were previously detected by BANNED_OPENCODE_RUN_PATTERNS regex array.
 */
export function isBannedOpencodeRun(command: string): boolean {
  const lower = command.toLowerCase().trim();
  if (!lower.startsWith('opencode run')) return false;
  // Banned patterns: --agent, --prompt, --print-output
  if (lower.includes('--agent') || lower.includes('--prompt') || lower.includes('--print-output')) {
    return true;
  }
  return false;
}

/**
 * Check if a command is a wrong container command.
 * Previously detected by WRONG_CONTAINER_PATTERNS regex array.
 */
export function isWrongContainerCommand(command: string): boolean {
  const lower = command.toLowerCase().trim();
  // "opencode container run" or "opencode run" (without --agent on same invocation)
  if (lower.startsWith('opencode container run') || lower.startsWith('opencode container start') || lower.startsWith('opencode container exec')) {
    return true;
  }
  return false;
}
