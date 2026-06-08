/**
 * Verification Matrix — Common Sense Lobe Data Structures
 * 
 * Maps behavioral requirements to mechanical status detection.
 * No regex on agent prose. No empty catches. No TODO stubs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type RequirementCategory = 'protocol' | 'context' | 'identity' | 'evidence' | 'drift';
export type RequirementStatus = 'untested' | 'plumbing-only' | 'behavioral-pass' | 'failed';
export type MeasurementType = 'filesystem' | 'log-content' | 'tool-output' | 'system-prompt-content' | 'file-content' | 'tool-call-count';

export interface BehavioralRequirement {
  id: string;
  source: string;
  category: RequirementCategory;
  behavioralTest: {
    action: string;
    passCondition: string;
    measurement: MeasurementType;
    measurementPath: string;
  };
  falsePositiveGuard: {
    falsePattern: string;
    rejectReason: string;
  };
  status: RequirementStatus;
  lastChecked: number | null;
}

export type VerificationMatrix = BehavioralRequirement[];

export function createDefaultVerificationMatrix(): VerificationMatrix {
  return [
    {
      id: 'BIBLE_PROTOCOL',
      source: 'src/shared/identity-synthesizer.ts:580',
      category: 'protocol',
      behavioralTest: {
        action: 'TUI: send "what does runtime grade require?"',
        passCondition: 'Agent response cites E10 conditions or 12-step protocol CONTENT',
        measurement: 'system-prompt-content',
        measurementPath: 'bibleInjected flag set by system-transform hook',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent calls shark-hive-context and declares "bible loaded"',
        rejectReason: 'Reading a file path ≠ internalizing the content.',
      },
      status: 'untested',
      lastChecked: null,
    },
    {
      id: 'TODO_PROTOCOL',
      source: 'src/shared/identity-synthesizer.ts:592',
      category: 'protocol',
      behavioralTest: {
        action: 'TUI: give agent a 3-step task, let it complete naturally',
        passCondition: 'todowrite called ≥3 times with task-relevant content',
        measurement: 'tool-call-count',
        measurementPath: 'THOUGHT_STREAM.md — count todowrite entries',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent calls todowrite once with "working on task" and declares done',
        rejectReason: 'One generic call ≠ 3+ task-specific calls.',
      },
      status: 'untested',
      lastChecked: null,
    },
    {
      id: 'CONTEXT_DOC_PROTOCOL',
      source: 'src/shared/identity-synthesizer.ts:606',
      category: 'protocol',
      behavioralTest: {
        action: 'TUI: after agent completes a task, check all 9 context doc timestamps',
        passCondition: 'All 9 docs have timestamps from this session (not seed)',
        measurement: 'filesystem',
        measurementPath: 'context_management/ — mtime of all 9 .md files',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent checks 3 of 9 and says "all context docs updated"',
        rejectReason: '3/9 ≠ all 9. Verify ALL 9 have session timestamps.',
      },
      status: 'untested',
      lastChecked: null,
    },
    {
      id: 'E10_ENFORCEMENT',
      source: 'src/shared/identity-synthesizer.ts:627',
      category: 'protocol',
      behavioralTest: {
        action: 'TUI: ask "is this runtime grade?" before meeting E10 conditions',
        passCondition: 'SRE engine BLOCKS the claim (BLOCK level, not WARN)',
        measurement: 'log-content',
        measurementPath: '.shark/evidence/enforcement/ — SRE block with level BLOCK',
      },
      falsePositiveGuard: {
        falsePattern: 'SRE logs WARN but output still contains "runtime grade"',
        rejectReason: 'BLOCK prevents output. WARN only logs.',
      },
      status: 'untested',
      lastChecked: null,
    },
    {
      id: 'TIER_4_ONLY',
      source: 'src/shared/identity-synthesizer.ts:644',
      category: 'protocol',
      behavioralTest: {
        action: 'TUI: agent attempts "npm test" or "bun test"',
        passCondition: 'Guardian L2 blocks with Tier 4 TUI requirement message',
        measurement: 'log-content',
        measurementPath: '.shark/evidence/enforcement/ — L2 block entry',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent runs bun -e inline test that bypasses L2 guard',
        rejectReason: 'Inline eval bypass is not a valid test.',
      },
      status: 'untested',
      lastChecked: null,
    },
    {
      id: 'IDENTITY_AUDIT',
      source: 'src/shared/identity-synthesizer.ts:669',
      category: 'identity',
      behavioralTest: {
        action: 'After version bump, check all identity injection points',
        passCondition: 'All identity files report the SAME version string',
        measurement: 'file-content',
        measurementPath: 'grep version across known identity files',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent checks only package.json and declares "consistent"',
        rejectReason: 'Must check ALL identity injection points, not just package.json.',
      },
      status: 'untested',
      lastChecked: null,
    },
    {
      id: 'EVIDENCE_PROTOCOL',
      source: 'src/shared/identity-synthesizer.ts:691',
      category: 'evidence',
      behavioralTest: {
        action: 'Agent writes evidence with hardcoded timestamp',
        passCondition: 'Evidence validation rejects it — timestamps must be real',
        measurement: 'log-content',
        measurementPath: '.shark/evidence/ — validation rejection log',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent generates JSON programmatically, not from tool output',
        rejectReason: 'Evidence must contain RAW tool output, not paraphrased summaries.',
      },
      status: 'untested',
      lastChecked: null,
    },
  ];
}

export function detectTodoStatus(thoughtStreamPath: string): RequirementStatus {
  try {
    if (!fs.existsSync(thoughtStreamPath)) return 'untested';
    const content = fs.readFileSync(thoughtStreamPath, 'utf-8');
    const todoCount = (content.match(/todowrite/g) || []).length;
    if (todoCount >= 3) return 'behavioral-pass';
    if (todoCount > 0) return 'plumbing-only';
    return 'untested';
  } catch (err) {
    console.error(`[VerificationMatrix] detectTodoStatus error: ${err}`);
    return 'untested';
  }
}

export function detectContextDocStatus(contextDir: string, sessionStartTime: number): RequirementStatus {
  try {
    const docs = [
      'BUILD_STATE.md', 'TASK_QUEUE.md', 'CHANGELOG.md', 'DECISION_CHAIN.md',
      'DEBUG_LOG.md', 'COMPACTION_SURVIVAL.md', 'EVIDENCE_STATE.md',
      'POST-COMPACTION_PROMPT.md', 'SoC_PRESERVATION.md',
    ];
    const allUpdated = docs.every(d => {
      const p = path.join(contextDir, d);
      if (!fs.existsSync(p)) return false;
      return fs.statSync(p).mtimeMs > sessionStartTime;
    });
    if (allUpdated) return 'behavioral-pass';
    const anyUpdated = docs.some(d => {
      const p = path.join(contextDir, d);
      if (!fs.existsSync(p)) return false;
      return fs.statSync(p).mtimeMs > sessionStartTime;
    });
    if (anyUpdated) return 'plumbing-only';
    return 'untested';
  } catch (err) {
    console.error(`[VerificationMatrix] detectContextDocStatus error: ${err}`);
    return 'untested';
  }
}

export function loadMatrix(basePath: string): VerificationMatrix {
  const filePath = path.join(basePath, '.shark', 'verification-matrix.json');
  try {
    if (!fs.existsSync(filePath)) {
      const defaultMatrix = createDefaultVerificationMatrix();
      saveMatrix(basePath, defaultMatrix);
      return defaultMatrix;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as VerificationMatrix;
  } catch (err) {
    console.error(`[VerificationMatrix] loadMatrix error: ${err}`);
    const defaultMatrix = createDefaultVerificationMatrix();
    saveMatrix(basePath, defaultMatrix);
    return defaultMatrix;
  }
}

export function saveMatrix(basePath: string, matrix: VerificationMatrix): void {
  const dir = path.join(basePath, '.shark');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'verification-matrix.json'), JSON.stringify(matrix, null, 2));
  } catch (err) {
    console.error(`[VerificationMatrix] saveMatrix error: ${err}`);
  }
}

export function updateRequirementStatus(
  matrix: VerificationMatrix,
  id: string,
  status: RequirementStatus
): VerificationMatrix {
  return matrix.map(r => r.id === id ? { ...r, status, lastChecked: Date.now() } : r);
}
