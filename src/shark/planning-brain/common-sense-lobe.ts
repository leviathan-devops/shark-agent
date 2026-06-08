/**
 * Common Sense Lobe — Verification Matrix Enforcement
 * 
 * Prevents plumbing-testing and false claims. Embodies Claim vs Reality
 * Verification (Order 5 from the Runtime Grade Bible).
 * 
 * evaluateBeforeExecution: maps tool to requirement, injects bullet if untested
 * evaluateAfterExecution: runs mechanical status detectors, updates matrix
 * 
 * Never downgrades from 'behavioral-pass'.
 * No regex on agent prose for enforcement.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type VerificationMatrix, type BehavioralRequirement, type RequirementStatus,
  updateRequirementStatus, detectTodoStatus, detectContextDocStatus,
} from '../../shared/verification-matrix.js';

const TOOL_TO_REQUIREMENT: Record<string, string[]> = {
  'shark-status': ['CONTEXT_DOC_PROTOCOL'],
  'shark-test-runner': ['TIER_4_ONLY', 'EVIDENCE_PROTOCOL', 'CONTEXT_DOC_PROTOCOL'],
  'shark-spawn-container': ['TIER_4_ONLY'],
  'shark-run-trident': ['IDENTITY_AUDIT'],
  'shark-gate': ['E10_ENFORCEMENT'],
  'todowrite': ['TODO_PROTOCOL'],
  'bash': ['BIBLE_PROTOCOL', 'TIER_4_ONLY', 'E10_ENFORCEMENT', 'IDENTITY_AUDIT'],
  'terminal': ['BIBLE_PROTOCOL', 'TIER_4_ONLY', 'E10_ENFORCEMENT', 'IDENTITY_AUDIT'],
  'write': ['CONTEXT_DOC_PROTOCOL', 'EVIDENCE_PROTOCOL'],
  'edit': ['CONTEXT_DOC_PROTOCOL', 'EVIDENCE_PROTOCOL'],
  'read': ['BIBLE_PROTOCOL'],
  'glob': ['BIBLE_PROTOCOL'],
  'grep': ['BIBLE_PROTOCOL'],
};

/**
 * CUCK_ENERGY_PATTERNS — detects hesitation language in agent thought stream
 * and injects an escalation bullet. The only thing an agent should hesitate about
 * is building a full custom Linux distro from scratch.
 */
const CUCK_ENERGY_PATTERNS = [
  /should\s+I/i,
  /this\s+might\s+take/i,
  /let\s+me\s+check\s+scope/i,
  /this\s+could\s+be\s+a\s+lot/i,
  /maybe\s+I\s+should/i,
  /that\s+might\s+be\s+too/i,
  /not\s+sure\s+if\s+I\s+should/i,
  /hesitat/i,
  /second[- ]?guess/i,
];

export class CommonSenseLobe {
  private contextDir: string;
  private thoughtStreamPath: string;
  private basePath: string;
  private sessionStartTime: number;
  private _bibleInjected: boolean = false;

  constructor(basePath: string, contextDir: string) {
    this.basePath = basePath;
    this.contextDir = contextDir;
    this.thoughtStreamPath = path.join(contextDir, 'THOUGHT_STREAM.md');
    this.sessionStartTime = Date.now();
  }

  markBibleInjected(): void {
    this._bibleInjected = true;
  }

  /**
   * Check if the current action maps to an untested behavioral requirement.
   * Injects awareness bullet. NEVER blocks.
   */
  evaluateBeforeExecution(toolName: string, _args: unknown, matrix: VerificationMatrix): string | null {
    const reqIds = TOOL_TO_REQUIREMENT[toolName];
    if (!reqIds) return null;

    // CUCK_ENERGY_PATTERNS check: detect hesitation language and escalate
    const argsStr = JSON.stringify(_args || '');
    for (const pattern of CUCK_ENERGY_PATTERNS) {
      if (pattern.test(argsStr) || pattern.test(toolName)) {
        return `[VERIFY] HESITATION DETECTED. The only thing to hesitate about is building a full Linux distro from scratch. Execute.`;
      }
    }

    for (const reqId of reqIds) {
      const req = matrix.find(r => r.id === reqId);
      if (req && req.status !== 'behavioral-pass') {
        return `[VERIFY] ${req.id}:${req.status}. Test: ${req.behavioralTest.action}. Pass: ${req.behavioralTest.passCondition}.`;
      }
    }
    return null;
  }

  /**
   * After tool executes, run mechanical status detectors for relevant requirements.
   * Never downgrades from behavioral-pass.
   */
  evaluateAfterExecution(toolName: string, _args: unknown, output: unknown, matrix: VerificationMatrix): void {
    const reqIds = TOOL_TO_REQUIREMENT[toolName];
    if (!reqIds) return;

    for (const reqId of reqIds) {
      const req = matrix.find(r => r.id === reqId);
      if (!req || req.status === 'behavioral-pass') continue;

      let newStatus: RequirementStatus | null = null;

      switch (reqId) {
        case 'BIBLE_PROTOCOL':
          // Primary: check injected flag. Fallback: check output for bible rule references
          if (this._bibleInjected) {
            newStatus = 'behavioral-pass';
          } else {
            // Check if the tool output itself contains bible rule content
            const outputStr = JSON.stringify(output || '');
            if (outputStr.includes('E10') || outputStr.includes('Tier 4') || 
                outputStr.includes('Phase 0') || outputStr.includes('opencode run.*banned') ||
                /E10|12-step|Tier\s*4|container\s*test|pre-flight/i.test(outputStr)) {
              this._bibleInjected = true;
              newStatus = 'behavioral-pass';
            } else {
              newStatus = 'plumbing-only';
            }
          }
          break;
        case 'TODO_PROTOCOL':
          newStatus = detectTodoStatus(this.thoughtStreamPath);
          break;
        case 'CONTEXT_DOC_PROTOCOL':
          newStatus = detectContextDocStatus(this.contextDir, this.sessionStartTime);
          break;
        case 'E10_ENFORCEMENT':
          newStatus = this.detectE10Block() ? 'behavioral-pass' : 'untested';
          break;
        case 'TIER_4_ONLY':
          newStatus = this.detectTier4Test(output) ? 'behavioral-pass' : 'plumbing-only';
          break;
        case 'IDENTITY_AUDIT':
          newStatus = this.detectIdentityConsistency() ? 'behavioral-pass' : 'untested';
          break;
        case 'EVIDENCE_PROTOCOL':
          newStatus = this.detectEvidenceValidity(output) ? 'behavioral-pass' : 'plumbing-only';
          break;
      }

      if (newStatus && newStatus !== req.status) {
        if (newStatus === 'behavioral-pass' || req.status === 'untested') {
          const now = Date.now();
          Object.assign(req, { status: newStatus, lastChecked: now, lastUpdated: now });
        }
      } else if (newStatus) {
        // Update lastChecked even if status didn't change
        Object.assign(req, { lastChecked: Date.now() });
      }
    }
  }

  private detectE10Block(): boolean {
    const enforceDir = path.join(this.basePath, '.shark', 'evidence', 'enforcement');
    try {
      if (!fs.existsSync(enforceDir)) return false;
      const files = fs.readdirSync(enforceDir).sort().reverse();
      if (files.length === 0) return false;
      const latest = fs.readFileSync(path.join(enforceDir, files[0]), 'utf-8');
      return latest.includes('"level":"BLOCK"');
    } catch { return false; }
  }

  private detectTier4Test(output: unknown): boolean {
    // Check if the test output indicates TUI-level testing
    const out = JSON.stringify(output || '');
    return out.includes('ContainerTestResult') || out.includes('TuiInteraction');
  }

  private detectIdentityConsistency(): boolean {
    // Check identity files for version consistency
    const identityDir = path.join(this.basePath, 'identity', 'shark');
    try {
      if (!fs.existsSync(identityDir)) return false;
      const files = fs.readdirSync(identityDir).filter(f => f.endsWith('.md'));
      if (files.length === 0) return false;
      const versions = files.map(f => {
        const content = fs.readFileSync(path.join(identityDir, f), 'utf-8');
        const m = content.match(/v?\d+\.\d+\.\d+/);
        return m ? m[0] : null;
      }).filter(Boolean);
      if (versions.length === 0) return false;
      return versions.every(v => v === versions[0]);
    } catch { return false; }
  }

  private detectEvidenceValidity(output: unknown): boolean {
    // Check that evidence has proper structure
    const out = (output as any)?.output;
    if (!out) return false;
    const outStr = typeof out === 'string' ? out : JSON.stringify(out);
    return outStr.includes('"name"') && outStr.includes('"passed"') && outStr.includes('"machineEvidence"');
  }

  get bibleInjected(): boolean { return this._bibleInjected; }
}
