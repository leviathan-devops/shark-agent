export interface DangerMatch {
  detected: boolean;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  pattern: string;
  findingId: string;
  message: string;
}

const CRITICAL_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+\//i,
  /\brm\s+-rf\s+--no-preserve-root\b/i,
  /\bdd\s+if=\/dev\/zero/i,
  /\bdd\s+if=\/dev\/sda/i,
  /\bmkfs\./i,
  /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
  /for\s*\(.*\)\s*do\s*.*&\s*;\s*done/i,
  /\bsudo\b.*\brm\b/i,
  /\bcryptolocker\b/i,
];

const HIGH_PATTERNS: RegExp[] = [
  /\bchmod\s+(-R\s+)?777\b/i,
  /\bchmod\s+000\b/i,
  /\bchown\s+-R\s+0:0\s+\//i,
  /\bwget\b.*\|\s*(ba)?sh/i,
  /\bcurl\b.*\|\s*(ba)?sh/i,
  /\brm\s+-rf\s+\/bin\b/i,
  /\brm\s+-rf\s+\/usr\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bdocker\s+rmi\b/i,
  /\bdocker\s+rm\b/i,
  /\bpkill\s+-9\b/i,
];

const MEDIUM_PATTERNS: RegExp[] = [
  /\bsudo\b/i,
  /\bsu\s+/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /drop\s+table\b/i,
  /drop\s+database\b/i,
];

export function isDangerousCommand(command: string): DangerMatch {
  const cmd = command.trim().toLowerCase();
  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(cmd)) return { detected: true, severity: 'CRITICAL', pattern: pattern.source, findingId: 'DANGER-CRITICAL', message: pattern.source };
  }
  for (const pattern of HIGH_PATTERNS) {
    if (pattern.test(cmd)) return { detected: true, severity: 'HIGH', pattern: pattern.source, findingId: 'DANGER-HIGH', message: pattern.source };
  }
  for (const pattern of MEDIUM_PATTERNS) {
    if (pattern.test(cmd)) return { detected: true, severity: 'MEDIUM', pattern: pattern.source, findingId: 'DANGER-MEDIUM', message: pattern.source };
  }
  return { detected: false, severity: 'LOW', pattern: '', findingId: '', message: '' };
}

export function hasDestructiveArgs(tool: string, args: Record<string, unknown>): DangerMatch {
  if (typeof args.command === 'string') {
    return isDangerousCommand(args.command);
  }
  if (typeof args.filePath === 'string') {
    const fp = args.filePath.toLowerCase();
    const blockedPaths = ['/etc', '/boot', '/sys', '/proc', '/dev'];
    for (const bp of blockedPaths) {
      if (fp.startsWith(bp)) return { detected: true, severity: 'HIGH', pattern: `path:${bp}`, findingId: 'DANGER-PATH', message: `Targets blocked system path: ${bp}` };
    }
  }
  return { detected: false, severity: 'LOW', pattern: '', findingId: '', message: '' };
}
