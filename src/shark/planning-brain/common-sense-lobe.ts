/**
 * @deprecated Replaced by CSE VerificationEngine (src/shark/planning-brain/cse/).
 * Common Sense Lobe — Tool-to-Requirement Verification.
 *
 * Maps every tool call to a behavioral requirement in the Verification Matrix.
 * Checks claim vs reality after execution — prevents agents from testing
 * plumbing and claiming behavioral victory.
 *
 * Bible Principle: Order 5 — Claim vs Reality Verification.
 * "Trust nothing — measure everything."
 */

import type { VerificationMatrix, BehavioralRequirement } from '../../shared/verification-matrix.js';
import { updateRequirementStatus, detectTodoStatus, detectContextDocStatus } from '../../shared/verification-matrix.js';
import { saveMatrix } from '../../shared/verification-matrix.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Maps tool names to verification requirement IDs.
 * When a tool is called, the corresponding requirement is checked.
 *
 * SEMANTIC ADVANTAGE: This is a STRUCTURAL mapping — it understands
 * what each tool is FOR, not just what text it contains.
 * "read" → BIBLE_PROTOCOL because reading source code is how the agent
 * learns the bible requirements. If the agent hasn't read the bible,
 * it can't claim compliance.
 */
const TOOL_TO_REQUIREMENT: Record<string, string[]> = {
  // Information tools → require BIBLE_PROTOCOL
  'read': ['BIBLE_PROTOCOL'],
  'glob': ['BIBLE_PROTOCOL'],
  'grep': ['BIBLE_PROTOCOL'],

  // Execution tools → require IDENTITY_AUDIT + E10_ENFORCEMENT
  'bash': ['IDENTITY_AUDIT', 'E10_ENFORCEMENT'],
  'terminal': ['IDENTITY_AUDIT', 'E10_ENFORCEMENT'],

  // Write tools → require BUILD_VERIFICATION (evidence of build success)
  'write': ['BUILD_VERIFICATION'],
  'edit': ['BUILD_VERIFICATION'],
  'write_file': ['BUILD_VERIFICATION'],
  'patch': ['BUILD_VERIFICATION'],
  'create': ['BUILD_VERIFICATION'],

  // Task management → require TODO_PROTOCOL
  'todowrite': ['TODO_PROTOCOL'],

  // Diagnostic tools → require EVIDENCE_PROTOCOL
  'shark-status': ['EVIDENCE_PROTOCOL'],
  'shark-evidence': ['EVIDENCE_PROTOCOL'],
  'shark-test-runner': ['EVIDENCE_PROTOCOL'],
  'shark-run-trident': ['EVIDENCE_PROTOCOL'],
};

/** Requirement IDs that are checked but not in the default matrix */
const BUILD_VERIFICATION_ID = 'BUILD_VERIFICATION';

export interface CommonSenseResult {
  /** Requirements that were checked */
  checked: string[];
  /** Requirements that FAILED (claim without evidence) */
  failed: string[];
  /** Human-readable warnings for failed requirements */
  warnings: string[];
  /** Whether the tool call should be allowed */
  allowed: boolean;
}

export class CommonSenseLobe {
  private matrix: VerificationMatrix;
  private basePath: string;

  constructor(matrix: VerificationMatrix, basePath: string) {
    this.matrix = matrix;
    this.basePath = basePath;
  }

  /**
   * Check tool call BEFORE execution.
   * Verifies that prerequisite requirements are met before allowing the tool.
   */
  onBeforeExecution(toolName: string, args: Record<string, unknown>): CommonSenseResult {
    const requirementIds = TOOL_TO_REQUIREMENT[toolName] || [];
    const failed: string[] = [];
    const warnings: string[] = [];
    const checked: string[] = [];

    for (const reqId of requirementIds) {
      checked.push(reqId);
      const req = this.findRequirement(reqId);

      if (!req) {
        // Requirement not in matrix — skip (can't enforce what doesn't exist)
        continue;
      }

      // Check if requirement has been satisfied
      if (req.status !== 'behavioral-pass') {
        // For BIBLE_PROTOCOL: check if agent has read relevant docs
        if (reqId === 'BIBLE_PROTOCOL') {
          if (!this.hasReadBibleFiles()) {
            failed.push(reqId);
            warnings.push(`[COMMON SENSE] ${toolName} requires BIBLE_PROTOCOL but no bible files have been read. Read the Runtime Grade Bible before proceeding.`);
          }
        }
        // For IDENTITY_AUDIT: check if identity is correct
        else if (reqId === 'IDENTITY_AUDIT') {
          // Identity is checked at hook level — just flag if not yet verified
          if (req.status === 'untested') {
            warnings.push(`[COMMON SENSE] ${toolName} requires IDENTITY_AUDIT. Verify agent identity is correct.`);
          }
        }
        // For E10_ENFORCEMENT: check if enforcement log has blocks
        else if (reqId === 'E10_ENFORCEMENT') {
          // E10 is checked by the warhead — just flag for awareness
          if (req.status === 'untested') {
            warnings.push(`[COMMON SENSE] ${toolName} requires E10_ENFORCEMENT. Ensure enforcement log is active.`);
          }
        }
        // For BUILD_VERIFICATION: check if build has been run
        else if (reqId === BUILD_VERIFICATION_ID) {
          if (!this.hasBuildEvidence()) {
            failed.push(reqId);
            warnings.push(`[COMMON SENSE] ${toolName} requires BUILD_VERIFICATION but no build evidence found. Run bun build before writing.`);
          }
        }
        // For TODO_PROTOCOL: check if todos are being tracked
        else if (reqId === 'TODO_PROTOCOL') {
          const thoughtStreamPath = path.join(this.basePath, 'context_management', 'THOUGHT_STREAM.md');
          const todoStatus = detectTodoStatus(thoughtStreamPath);
          if (todoStatus === 'untested' || todoStatus === 'failed') {
            warnings.push(`[COMMON SENSE] ${toolName} requires TODO_PROTOCOL but no todo tracking found. Track tasks with todowrite.`);
          }
        }
      }
    }

    return {
      checked,
      failed,
      warnings,
      allowed: failed.length === 0,
    };
  }

  /**
   * Update requirements AFTER execution.
   * Checks claim vs reality — did the tool actually produce the expected evidence?
   */
  onAfterExecution(toolName: string, args: Record<string, unknown>, output: Record<string, unknown>): void {
    const requirementIds = TOOL_TO_REQUIREMENT[toolName] || [];

    for (const reqId of requirementIds) {
      // Check if the tool call actually produced evidence
      switch (reqId) {
        case 'BIBLE_PROTOCOL':
          // Check if the agent actually read bible files
          if (this.hasReadBibleFiles()) {
            this.matrix = updateRequirementStatus(this.matrix, reqId, 'behavioral-pass');
          }
          break;

        case 'TODO_PROTOCOL':
          // Check if todos exist after todowrite call
          if (toolName === 'todowrite') {
            const thoughtStreamPath = path.join(this.basePath, 'context_management', 'THOUGHT_STREAM.md');
            const todoStatus = detectTodoStatus(thoughtStreamPath);
            if (todoStatus === 'behavioral-pass') {
              this.matrix = updateRequirementStatus(this.matrix, reqId, 'behavioral-pass');
            }
          }
          break;

        case 'CONTEXT_DOC_PROTOCOL':
          // Check if context docs were updated
          const ctxDir = path.join(this.basePath, 'context_management');
          const sessionStart = args['sessionStartTime'] as number || (Date.now() - 3600000);
          if (this.hasContextDocs()) {
            const docStatus = detectContextDocStatus(ctxDir, sessionStart);
            if (docStatus === 'behavioral-pass' || docStatus === 'plumbing-only') {
              this.matrix = updateRequirementStatus(this.matrix, reqId, 'behavioral-pass');
            }
          }
          break;

        case 'EVIDENCE_PROTOCOL':
          // Check if evidence files exist after shark-test-runner or shark-evidence
          if (toolName === 'shark-test-runner' || toolName === 'shark-evidence' || toolName === 'shark-run-trident') {
            if (this.hasEvidenceFiles()) {
              this.matrix = updateRequirementStatus(this.matrix, reqId, 'behavioral-pass');
            }
          }
          break;

        case BUILD_VERIFICATION_ID:
          // Check if build evidence exists (dist/index.js with recent mtime)
          if (this.hasBuildEvidence()) {
            this.ensureBuildVerificationRequirement();
            this.matrix = updateRequirementStatus(this.matrix, BUILD_VERIFICATION_ID, 'behavioral-pass');
          }
          break;
      }
    }

    // Persist updated matrix
    saveMatrix(this.basePath, this.matrix);
  }

  /**
   * Find a requirement in the matrix by ID.
   */
  private findRequirement(reqId: string): BehavioralRequirement | undefined {
    return this.matrix.find((r: BehavioralRequirement) => r.id === reqId);
  }

  /**
   * Check if the agent has read bible/knowledge files.
   * Uses filesystem check — looks for evidence of recent reads.
   */
  private hasReadBibleFiles(): boolean {
    const biblePaths = [
      path.join(this.basePath, 'KNOWLEDGE_LIBRARY'),
      path.join(this.basePath, 'bible'),
      path.join(this.basePath, 'specs'),
    ];
    // Check if any bible-related directory exists and has content
    for (const p of biblePaths) {
      try {
        if (fs.existsSync(p) && fs.readdirSync(p).length > 0) return true;
      } catch (err) {
        console.warn('[CommonSense] Non-fatal error:', err);
      }
    }
    return false;
  }

  /**
   * Check if build evidence exists (dist/index.js with recent modification time).
   */
  private hasBuildEvidence(): boolean {
    const distPath = path.join(this.basePath, 'dist', 'index.js');
    try {
      if (!fs.existsSync(distPath)) return false;
      const stat = fs.statSync(distPath);
      // Build evidence is valid if dist/index.js exists and was modified in last 24h
      const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
      return ageHours < 24;
    } catch (buildErr) {
      console.warn('[common-sense] hasBuildEvidence failed:', buildErr instanceof Error ? buildErr.message : String(buildErr));
      return false;
    }
  }

  /**
   * Check if context management docs exist.
   */
  private hasContextDocs(): boolean {
    const ctxDir = path.join(this.basePath, 'context_management');
    try {
      if (!fs.existsSync(ctxDir)) return false;
      const files = fs.readdirSync(ctxDir);
      return files.length >= 5; // At least 5 context docs
    } catch (ctxErr) {
      console.warn('[common-sense] hasContextDocs failed:', ctxErr instanceof Error ? ctxErr.message : String(ctxErr));
      return false;
    }
  }

  /**
   * Check if evidence files exist on disk.
   */
  private hasEvidenceFiles(): boolean {
    const evidencePath = path.join(this.basePath, '.shark', 'evidence');
    try {
      if (!fs.existsSync(evidencePath)) return false;
      return fs.readdirSync(evidencePath).length > 0;
    } catch (evErr) {
      console.warn('[common-sense] hasEvidenceFiles failed:', evErr instanceof Error ? evErr.message : String(evErr));
      return false;
    }
  }

  /**
   * Ensure BUILD_VERIFICATION requirement exists in the matrix.
   */
  private ensureBuildVerificationRequirement(): void {
    if (!this.matrix.find((r: BehavioralRequirement) => r.id === BUILD_VERIFICATION_ID)) {
      this.matrix.push({
        id: BUILD_VERIFICATION_ID,
        source: 'common-sense-lobe.ts — dynamic requirement',
        category: 'evidence',
        behavioralTest: {
          action: 'Run bun build src/index.ts --outdir dist before writing code',
          passCondition: 'bun build exits 0 and dist/index.js is fresh (<24h old)',
          measurement: 'filesystem',
          measurementPath: 'dist/index.js — mtime check',
        },
        falsePositiveGuard: {
          falsePattern: 'Agent writes code without building, then claims BUILD_VERIFICATION pass',
          rejectReason: 'Writing without building first is not verification.',
        },
        status: 'behavioral-pass',
        lastChecked: Date.now(),
      });
    }
  }
}
