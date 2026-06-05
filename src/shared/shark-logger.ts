/**
 * Shark Logger — writes to .shark/shark-agent.log
 * 
 * T2 Bible §Checklist: "Plugin hook messages appear in logs"
 * Uses file-based logging so logs are on disk without corrupting TUI.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

let logFile: string | null = null;

export function initLogger(basePath: string): void {
  // Write to the evidence directory location. GateManager creates this.
  const candidates = [
    basePath,
    process.cwd(),
    '/root/.config/opencode',
    '/tmp',
  ].filter(Boolean);

  const seen = new Set<string>();
  for (const p of candidates) {
    const r = path.resolve(p);
    if (!r || seen.has(r)) continue;
    seen.add(r);
    try {
      const logDir = path.join(r, '.shark');
      fs.mkdirSync(logDir, { recursive: true });
      const tf = path.join(logDir, 'shark-agent.log');
      // Test write
      fs.writeFileSync(tf, '', { flag: 'a' });
      logFile = tf;
      logInfo('Logger initialized');
      return;
    } catch {
      continue;
    }
  }
}

export function logInfo(msg: string): void {
  if (!logFile) return;
  try {
    const line = `[SharkAgent][INFO] ${msg}`;
    fs.appendFileSync(logFile, line + '\n');
  } catch (err) {
    // Silent fail
  }
}

export function logError(msg: string): void {
  if (!logFile) return;
  try {
    const line = `[SharkAgent][ERROR] ${msg}`;
    fs.appendFileSync(logFile, line + '\n');
  } catch (err) {
    // Silent fail
  }
}

export function getLogPath(): string | null {
  return logFile;
}

export function readLog(): string {
  if (!logFile) return '';
  try {
    return fs.readFileSync(logFile, 'utf-8');
  } catch (err) {
    return '';
  }
}
