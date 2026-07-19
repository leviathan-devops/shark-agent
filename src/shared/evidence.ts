/**
 * Evidence System
 *
 * Mandatory evidence collection for every gate.
 * Evidence is archived to .shark/evidence/{gate}/{timestamp}/
 *
 * Gate chain: PLAN → BUILD → VERIFY → TEST → AUDIT → DELIVERY
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeParseJSON } from './type-guards.js';

export type GateName = 'plan' | 'build' | 'verify' | 'test' | 'audit' | 'delivery';

export interface GateEvidence {
  gate: GateName;
  timestamp: number;
  passed: boolean;
  files: string[];
  id?: string;
  metadata?: Record<string, unknown>;
  debugLog?: string;
}

export interface IterationEvidence {
  iteration: string;
  timestamp: number;
  debugLogs: string[];
  gateAttempts: Record<GateName, number>;
}

const EVIDENCE_DIR = 'evidence';
const ITERATIONS_DIR = 'iterations';

export class EvidenceCollector {
  private basePath: string;

  constructor(basePath: string = '.shark') {
    this.basePath = basePath;
  }

  collectEvidence(evidence: GateEvidence): void {
    const gateDir = path.join(this.basePath, EVIDENCE_DIR, evidence.gate);
    const timestampDir = path.join(gateDir, String(evidence.timestamp));

    this.ensureDir(timestampDir);

    const metaPath = path.join(timestampDir, 'evidence.json');
    fs.writeFileSync(metaPath, JSON.stringify(evidence, null, 2));

    if (evidence.debugLog) {
      fs.writeFileSync(path.join(timestampDir, 'debug.log'), evidence.debugLog);
    }
  }

  /**
   * Collect evidence by gate/id/passed triple.
   * Convenience method for GateEngine.submitEvidence() persistence.
   * Constructs a GateEvidence with the given id so hasRequiredEvidence() can match it.
   * Uses a unique directory (timestamp-id) to prevent collisions when multiple
   * evidence items are collected within the same millisecond.
   */
  collectEvidenceById(gate: GateName, id: string, passed: boolean): void {
    const ts = Date.now();
    const gateDir = path.join(this.basePath, EVIDENCE_DIR, gate);
    const evidenceDir = path.join(gateDir, `${ts}-${id}`);
    this.ensureDir(evidenceDir);

    const evidence: GateEvidence = {
      gate,
      timestamp: ts,
      passed,
      files: [],
      id,
      metadata: { id, source: 'gate-engine' },
    };
    fs.writeFileSync(path.join(evidenceDir, 'evidence.json'), JSON.stringify(evidence, null, 2));
  }

  collectDebugLog(iteration: string, attempt: number, debugLog: string): void {
    const iterDir = path.join(this.basePath, ITERATIONS_DIR, iteration, 'debug-logs');
    this.ensureDir(iterDir);

    const logPath = path.join(iterDir, `attempt-${attempt}.md`);
    fs.writeFileSync(logPath, debugLog);
  }

  recordIteration(evidence: IterationEvidence): void {
    const iterDir = path.join(this.basePath, ITERATIONS_DIR, evidence.iteration);
    this.ensureDir(iterDir);

    const metaPath = path.join(iterDir, 'iteration.json');
    fs.writeFileSync(metaPath, JSON.stringify(evidence, null, 2));
  }

  getGateEvidence(gate: GateName): GateEvidence[] {
    const gateDir = path.join(this.basePath, EVIDENCE_DIR, gate);
    if (!fs.existsSync(gateDir)) return [];

    const evidences: GateEvidence[] = [];
    try {
      const entries = fs.readdirSync(gateDir);

      for (const entry of entries) {
        const fullPath = path.join(gateDir, entry);

        // Try subdirectory format first: {gate}/{timestamp}-{id}/evidence.json
        const subDirEvidence = path.join(fullPath, 'evidence.json');
        if (fs.existsSync(subDirEvidence)) {
          try {
            const content = fs.readFileSync(subDirEvidence, 'utf-8');
            const parsed = safeParseJSON(content);
            if (parsed) evidences.push(parsed as GateEvidence);
          } catch {
            console.warn('[evidence] invalid evidence file skipped');
          }
          continue;
        }

        // Also try flat .json file format: {gate}/{id}-evidence.json
        // Auto-detect writes evidence as flat files (e.g. spec-evidence.json)
        if (entry.endsWith('.json')) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const parsed = safeParseJSON(content);
              if (parsed && (parsed as GateEvidence).id !== undefined && (parsed as GateEvidence).passed !== undefined) {
                evidences.push(parsed as GateEvidence);
              }
            }
          } catch {
            // invalid flat JSON — skip silently
          }
        }
      }
    } catch {
      console.warn('[evidence] getGateEvidence directory read failed');
    }

    return evidences.sort((a: GateEvidence, b: GateEvidence) => b.timestamp - a.timestamp);
  }

  getLatestEvidence(gate: GateName): GateEvidence | null {
    const evidences = this.getGateEvidence(gate);
    return evidences[0] || null;
  }

  getIterationLogs(iteration: string): string[] {
    const logsDir = path.join(this.basePath, ITERATIONS_DIR, iteration, 'debug-logs');
    if (!fs.existsSync(logsDir)) return [];

    try {
      return fs.readdirSync(logsDir)
        .filter((f: string) => f.endsWith('.md'))
        .sort()
        .map((f: string) => fs.readFileSync(path.join(logsDir, f), 'utf-8'));
    } catch {
      console.warn('[evidence] getIterationLogs failed');
      return [];
    }
  }

  hasRequiredEvidence(gate: string): { passed: boolean; missing: string[] } {
    const gateName = gate as GateName;
    const evidence = this.getGateEvidence(gateName);
    const required = this.getRequiredEvidenceIds(gate);
    const missing: string[] = [];

    for (const req of required) {
      const found = evidence.some((e: GateEvidence) => e.id === req && e.passed === true);
      if (!found) missing.push(req);
    }

    return { passed: missing.length === 0, missing };
  }

  private getRequiredEvidenceIds(gate: string): string[] {
    const requirements: Record<string, string[]> = {
      plan: ['spec', 'architecture', 'error-strategy'],
      build: ['compiled', 'source-verified', 'deps-installed'],
      test: ['container-test', 'unit-test', 'browser-test'],
      // FIX: VERIFY was incorrectly requiring AUDIT-gate evidence (trident-report,
      // semantic-firewall-pass, no-critical), which is impossible to satisfy — that
      // evidence is only produced AT the AUDIT gate. VERIFY should require the same
      // build-evidence as BUILD. AUDIT was missing 3 of its 6 required evidence IDs.
      verify: ['compiled', 'source-verified', 'deps-installed'],
      audit: ['trident-report', 'semantic-firewall-pass', 'no-critical', 'spec-alignment', 'test-authenticity', 'theatrical-scan'],
      delivery: ['ship-package', 'checksum', 'evidence-archive'],
    };
    return requirements[gate] || [];
  }

  hasCompleteEvidence(): boolean {
    const gates: GateName[] = ['plan', 'build', 'verify', 'test', 'audit', 'delivery'];
    return gates.every((gate: GateName) => this.getGateEvidence(gate).length > 0);
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export interface DebugLogFormat {
  issue: string;
  location: string;
  rootCause: string;
  fix: string;
  iteration: string;
}

export function formatDebugLog(data: DebugLogFormat): string {
  return `╔══════════════════════════════════════════════════════════════════════════╗
║ SHARK DEBUG LOG — ${data.iteration}
╚══════════════════════════════════════════════════════════════════════════╝

ISSUE: ${data.issue}

LOCATION: ${data.location}

ROOT CAUSE: ${data.rootCause}

FIX: ${data.fix}

ITERATION: ${data.iteration}
`;
}
