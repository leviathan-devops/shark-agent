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
import * as path from 'node:path';
import type { GateName } from './evidence.js';
import { GATE_CHAIN } from './gates.js';

const SHIP_BASE = '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Shark Agent/SHIP APPROVED';

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
        const logFiles = fs.readdirSync(debugLogsDir).filter(f => f.endsWith('.md')).sort();
        for (const logFile of logFiles) {
          try {
            logs.push(fs.readFileSync(path.join(debugLogsDir, logFile), 'utf-8'));
          } catch {
            // skip unreadable
          }
        }
      }
    }
  } catch {
    // directory read failure
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
            const evidence = JSON.parse(content);
            timeline.push({
              gate: evidence.gate || gate,
              timestamp: evidence.timestamp || 0,
              passed: evidence.passed || false,
              files: evidence.files || [],
            });
          } catch {
            // skip invalid
          }
        }
      }
    } catch {
      // directory read failure
    }
  }

  return timeline.sort((a, b) => a.timestamp - b.timestamp);
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
    } catch {
      // directory read failure
    }
  }

  if (fs.existsSync(srcDir)) {
    walkDir(srcDir);
  }

  const totalBytes = files.reduce((sum, f) => {
    try {
      return sum + fs.statSync(path.join(srcDir, f)).size;
    } catch {
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
    'Shark v4.9.9 — Triple-Brain Parallel Architecture Plugin for OpenCode.',
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
    } catch {
      lines.push(`| ${f} | ? |`);
    }
  }

  lines.push('', `## Total`, `${files.length} files, ${(totalBytes / 1024).toFixed(1)} KB`, '');
  lines.push('## Gate Recovery Loops', '- VERIFY fail → BUILD (max 3)', '- TEST fail → PLAN (max 3)', '- AUDIT fail → PLAN (unlimited)', '');
  lines.push('## Test Protocol', 'T2 TUI Testing Bible 12-step protocol via tmux + docker exec -it.', 'opencode run BANNED — hooks never fire.', 'Container: opencode-test:1.14.34', '');

  return lines.join('\n');
}

export function generateDelivery(config: DeliveryConfig): DeliveryResult {
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
  } catch {
    // evidence write failure — non-fatal
  }

  const predecessorGates: GateName[] = ['plan', 'build', 'verify', 'test', 'audit'];
  const evidenceBase = config.evidenceBase;
  for (const gate of predecessorGates) {
    const gateDir = path.join(evidenceBase, gate);
    if (!fs.existsSync(gateDir)) {
      return {
        success: false,
        shipDir,
        changelogPath,
        debugLogPath,
        buildReportPath,
        identityStripped: false,
        error: 'Cannot deliver: predecessor gate "' + gate + '" has no evidence directory',
      };
    }
    const entries = fs.readdirSync(gateDir);
    let gatePassed = false;
    for (const entry of entries) {
      const evidencePath = path.join(gateDir, entry, 'evidence.json');
      if (fs.existsSync(evidencePath)) {
        try {
          const raw = fs.readFileSync(evidencePath, 'utf-8');
          const data = JSON.parse(raw);
          if (data.passed === true) { gatePassed = true; break; }
        } catch { /* skip invalid */ }
      }
    }
    if (!gatePassed) {
      return {
        success: false,
        shipDir,
        changelogPath,
        debugLogPath,
        buildReportPath,
        identityStripped: false,
        error: 'Cannot deliver: predecessor gate "' + gate + '" has no passing evidence',
      };
    }
  }

  return {
    success: true,
    shipDir,
    changelogPath,
    debugLogPath,
    buildReportPath,
    identityStripped: false,
  };
}
