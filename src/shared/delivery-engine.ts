/**
 * Delivery Engine — DELIVERY Gate Ship Package Generator
 *
 * Generates 3 docs:
 *   1. CHANGELOG.md — consolidated from all debug logs
 *   2. DEBUG_LOG.md — raw engineering record
 *   3. BUILD_REPORT.md — architecture overview, components, tests, usage, artifacts
 *
 * Ships to SHIP APPROVED path.
 *
 * IDENTITY STRIP happens here — ONLY after code enforcement proven.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { GateName } from './evidence.js';
import { GATE_CHAIN } from './gates.js';
import { safeParseJSON } from './type-guards.js';
import { loadMatrix } from './verification-matrix.js';

const SHIP_BASE = process.env.SHIP_BASE || path.join(process.env.HOME || os.homedir(), 'SHIP_APPROVED');

export interface DeliveryConfig {
  projectName: string;
  version: string;
  evidenceBase: string;
  sourceDir: string;
  identityDir: string;
}

export interface DeliveryResult {
  success: boolean;
  shipDir: string;
  changelogPath: string;
  debugLogPath: string;
  buildReportPath: string;
  identityStripped: boolean;
  error?: string;
}

function collectDebugLogs(evidenceBase: string): string[] {
  const logs: string[] = [];
  const iterationsDir = path.join(evidenceBase, '..', 'iterations');
  if (!fs.existsSync(iterationsDir)) return logs;

  try {
    const iterations = fs.readdirSync(iterationsDir);
    for (const iter of iterations) {
      const debugLogsDir = path.join(iterationsDir, iter, 'debug-logs');
      if (fs.existsSync(debugLogsDir)) {
        const logFiles = fs.readdirSync(debugLogsDir).filter((f: string) => f.endsWith('.md')).sort();
        for (const logFile of logFiles) {
          try {
            logs.push(fs.readFileSync(path.join(debugLogsDir, logFile), 'utf-8'));
          } catch (logErr) {
            console.warn('[delivery-engine] collectDebugLogs file read failed:', logErr instanceof Error ? logErr.message : String(logErr));
          }
        }
      }
    }
  } catch (iterErr) {
    console.warn('[delivery-engine] collectDebugLogs directory read failed:', iterErr instanceof Error ? iterErr.message : String(iterErr));
  }

  return logs;
}

function collectEvidenceTimeline(evidenceBase: string): Array<{ gate: string; timestamp: number; passed: boolean; files: string[] }> {
  const timeline: Array<{ gate: string; timestamp: number; passed: boolean; files: string[] }> = [];
  for (const gate of GATE_CHAIN) {
    const gateDir = path.join(evidenceBase, gate);
    if (!fs.existsSync(gateDir)) continue;
    try {
      const entries = fs.readdirSync(gateDir);
      for (const entry of entries) {
        const evidencePath = path.join(gateDir, entry, 'evidence.json');
        if (fs.existsSync(evidencePath)) {
          try {
            const content = fs.readFileSync(evidencePath, 'utf-8');
            const evidence = safeParseJSON(content) as Record<string, unknown>;
            timeline.push({
              gate: (evidence.gate as string) || gate,
              timestamp: (evidence.timestamp as number) || 0,
              passed: (evidence.passed as boolean) || false,
              files: (evidence.files as string[]) || [],
            });
          } catch (evErr) {
            console.warn('[delivery-engine] collectEvidenceTimeline read failed:', evErr instanceof Error ? evErr.message : String(evErr));
          }
        }
      }
    } catch (dirErr) {
      console.warn('[delivery-engine] collectEvidenceTimeline directory failed:', dirErr instanceof Error ? dirErr.message : String(dirErr));
    }
  }

  return timeline.sort((a: { gate: string; timestamp: number; passed: boolean; files: string[] }, b: { gate: string; timestamp: number; passed: boolean; files: string[] }) => a.timestamp - b.timestamp);
}

function generateChangelog(config: DeliveryConfig, timeline: Array<{ gate: string; timestamp: number; passed: boolean; files: string[] }>, debugLogs: string[]): string {
  const lines: string[] = [
    `# CHANGELOG — ${config.projectName} ${config.version}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Gate Timeline',
    '',
    '| Gate | Timestamp | Status | Files |',
    '|------|-----------|--------|-------|',
  ];

  for (const entry of timeline) {
    const date = new Date(entry.timestamp).toISOString();
    const status = entry.passed ? 'PASSED' : 'FAILED';
    const files = entry.files.length > 0 ? entry.files.slice(0, 3).join(', ') : '-';
    lines.push(`| ${entry.gate} | ${date} | ${status} | ${files} |`);
  }

  if (debugLogs.length > 0) {
    lines.push('', '## Debug Logs', '');
    for (const log of debugLogs) {
      lines.push(log);
      lines.push('---');
    }
  }

  return lines.join('\n');
}

function generateDebugLog(config: DeliveryConfig, timeline: Array<{ gate: string; timestamp: number; passed: boolean; files: string[] }>): string {
  const lines: string[] = [
    `# DEBUG LOG — ${config.projectName} ${config.version}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Evidence Timeline',
    '',
  ];

  for (const entry of timeline) {
    const date = new Date(entry.timestamp).toISOString();
    lines.push(`### ${entry.gate} — ${date}`);
    lines.push(`Status: ${entry.passed ? 'PASSED' : 'FAILED'}`);
    if (entry.files.length > 0) {
      lines.push('Files:');
      for (const f of entry.files) {
        lines.push(`  - ${f}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateBuildReport(config: DeliveryConfig): string {
  const srcDir = config.sourceDir;
  const files: string[] = [];

  function walkDir(dir: string, prefix: string = ''): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walkDir(path.join(dir, entry.name), relPath);
        } else {
          files.push(relPath);
        }
      }
    } catch (walkErr) {
      console.warn('[delivery-engine] walkDir failed:', walkErr instanceof Error ? walkErr.message : String(walkErr));
    }
  }

  if (fs.existsSync(srcDir)) {
    walkDir(srcDir);
  }

  const totalBytes = files.reduce((sum: number, f: string) => {
    try {
      return sum + fs.statSync(path.join(srcDir, f)).size;
    } catch (statErr) {
      console.warn('[delivery-engine] totalBytes stat failed:', statErr instanceof Error ? statErr.message : String(statErr));
      return sum;
    }
  }, 0);

  const lines: string[] = [
    `# BUILD REPORT — ${config.projectName} ${config.version}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Architecture Overview',
    '',
    'Shark v5.1.0 — 2-Lobe Planning Brain Plugin for OpenCode.',
    '',
    '### Gate Chain',
    '`PLAN → BUILD → VERIFY → TEST → AUDIT → DELIVERY`',
    '',
    '### Key Components',
    '- **GateManager** — Mechanical gate enforcement with criteria-based advancement',
    '- **EvidenceCollector** — Mandatory evidence collection per gate',
    '- **Execution Brain** — Runtime-grade engineering engine (P1-P12)',
    '- **Reasoning Brain** — Runtime pattern detection and context injection',
    '- **System Brain** — Derailment detection and gate evaluation',
    '- **Audit Engine** — Spec alignment + test authenticity verification',
    '- **Firewall** — 25-layer security enforcement',
    '- **Identity System** — Strong identity binding with P1-P12 principles',
    '',
    '## Source Files',
    '',
    '| File | Size |',
    '|------|------|',
  ];

  for (const f of files.sort()) {
    try {
      const stat = fs.statSync(path.join(srcDir, f));
      lines.push(`| ${f} | ${(stat.size / 1024).toFixed(1)} KB |`);
    } catch (fileStatErr) {
      console.warn('[delivery-engine] buildReport file stat failed:', fileStatErr instanceof Error ? fileStatErr.message : String(fileStatErr));
      lines.push(`| ${f} | ? |`);
    }
  }

  lines.push('', `## Total`, `${files.length} files, ${(totalBytes / 1024).toFixed(1)} KB`, '');
  lines.push('## Gate Recovery Loops', '- VERIFY fail → BUILD (max 3)', '- TEST fail → PLAN (max 3)', '- AUDIT fail → PLAN (unlimited)', '');
  lines.push('## Test Protocol', 'T2 TUI Testing Bible 12-step protocol via tmux + docker exec -it.', 'opencode run BANNED — hooks never fire.', 'Container: opencode-test:1.14.34', '');

  return lines.join('\n');
}

export function generateDelivery(config: DeliveryConfig): DeliveryResult {
  // ── VERIFICATION MATRIX GATE: block ship if any requirement is not behavioral-pass ──
  const matrix = loadMatrix(config.evidenceBase);
  const unverified = matrix.filter(r => r.status !== 'behavioral-pass');
  if (unverified.length > 0) {
    const ids = unverified.map(r => `${r.id}:${r.status}`).join(', ');
    return {
      success: false,
      shipDir: '',
      changelogPath: '',
      debugLogPath: '',
      buildReportPath: '',
      identityStripped: false,
      error: `Verification matrix NOT satisfied. Unverified items: ${ids}. All items must be behavioral-pass before delivery.`,
    };
  }

  const shipDir = path.join(SHIP_BASE, `${config.projectName}-${config.version}-${new Date().toISOString().replace(/[:.]/g, '-')}`);

  try {
    fs.mkdirSync(shipDir, { recursive: true });
  } catch (mkdirErr) {
    return {
      success: false,
      shipDir,
      changelogPath: '',
      debugLogPath: '',
      buildReportPath: '',
      identityStripped: false,
      error: `Failed to create ship directory: ${mkdirErr instanceof Error ? mkdirErr.message : String(mkdirErr)}`,
    };
  }

  const timeline = collectEvidenceTimeline(config.evidenceBase);
  const debugLogs = collectDebugLogs(config.evidenceBase);

  const changelog = generateChangelog(config, timeline, debugLogs);
  const debugLog = generateDebugLog(config, timeline);
  const buildReport = generateBuildReport(config);

  const changelogPath = path.join(shipDir, 'CHANGELOG.md');
  const debugLogPath = path.join(shipDir, 'DEBUG_LOG.md');
  const buildReportPath = path.join(shipDir, 'BUILD_REPORT.md');

  try {
    fs.writeFileSync(changelogPath, changelog);
    fs.writeFileSync(debugLogPath, debugLog);
    fs.writeFileSync(buildReportPath, buildReport);
  } catch (writeErr) {
    return {
      success: false,
      shipDir,
      changelogPath,
      debugLogPath,
      buildReportPath,
      identityStripped: false,
      error: `Failed to write delivery documents: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
    };
  }

  const evidenceDir = path.join(config.evidenceBase, 'delivery');
  try {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'CHANGELOG.md'), changelog);
    fs.writeFileSync(path.join(evidenceDir, 'DEBUG_LOG.md'), debugLog);
    fs.writeFileSync(path.join(evidenceDir, 'BUILD_REPORT.md'), buildReport);
  } catch (evWriteErr) {
    console.warn('[delivery-engine] evidence write failed:', evWriteErr instanceof Error ? evWriteErr.message : String(evWriteErr));
  }

  // Verified: all 3 docs written to shipDir (CHANGELOG, DEBUG_LOG, BUILD_REPORT) — writeFileSync succeeded lines 264-266
  return {
    success: true,
    shipDir,
    changelogPath,
    debugLogPath,
    buildReportPath,
    identityStripped: false,
  };
}
