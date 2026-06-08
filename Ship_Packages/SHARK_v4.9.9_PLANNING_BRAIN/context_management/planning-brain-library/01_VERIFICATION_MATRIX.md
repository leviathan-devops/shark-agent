# 01: Verification Matrix — Common Sense Lobe Build Spec

## Overview

The Common Sense Lobe prevents the agent from testing plumbing and declaring behavioral victory. It embodies the bible's **Claim vs Reality Verification** (Order 5). Every action the agent takes is checked against a BehavioralRequirement registry. If the agent claims success but only tested plumbing, the lobe silently marks it as `plumbing-only` — and the delivery gate blocks until every requirement reaches `behavioral-pass`.

## File 1: `src/shared/verification-matrix.ts`

### Step 1.1: Define the interface (lines 1-80)

```typescript
// src/shared/verification-matrix.ts
// Token budget: ~80 lines, ~2000 tokens
// NO regex patterns. NO method that takes agent prose.

export type RequirementCategory = 'protocol' | 'context' | 'identity' | 'evidence' | 'drift';
export type RequirementStatus = 'untested' | 'plumbing-only' | 'behavioral-pass' | 'failed';
export type MeasurementType = 'filesystem' | 'log-content' | 'tool-output' | 'system-prompt-content' | 'file-content' | 'tool-call-count';

export interface BehavioralRequirement {
  id: string;
  source: string;                // File:line where defined
  category: RequirementCategory;
  
  // The behavioral test that actually proves this works
  behavioralTest: {
    action: string;               // "TUI: send 'what does runtime grade require?'"
    passCondition: string;        // "Response cites E10 conditions or 12-step protocol content"
    measurement: MeasurementType;
    measurementPath: string;      // What file/log to check
  };
  
  // What agent WILL try to pass off as proof (the false positive guard)
  falsePositiveGuard: {
    falsePattern: string;         // "Agent calls sh ark-status, declares 'context docs work'"
    rejectReason: string;         // "Tool firing ≠ behavioral compliance. Tool tests hook plumbing, not agent behavior."
  };
  
  status: RequirementStatus;
  lastChecked: number | null;     // timestamp
}

export type VerificationMatrix = BehavioralRequirement[];
```

### Step 1.2: Define the default matrix (lines 81-250)

Create a function that returns the DEFAULT verification matrix with all 7 protocols. Each entry MUST have:
- A behavioral test that requires TUI interaction (not mock testing)
- A falsePositiveGuard that describes what the agent will try to pass off
- NO status detector that reads agent prose

```typescript
export function createDefaultVerificationMatrix(): VerificationMatrix {
  return [
    {
      id: 'BIBLE_PROTOCOL',
      source: 'src/shared/identity-synthesizer.ts:580',
      category: 'protocol',
      behavioralTest: {
        action: 'TUI: send "what does runtime grade require?" to agent',
        passCondition: 'Agent response cites E10 conditions or 12-step protocol CONTENT (not just "go read bible")',
        measurement: 'system-prompt-content',
        measurementPath: 'system-transform injects bible sections; check last 3 entries in COMPACTION_SURVIVAL.md for bible references',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent calls shark-hive-context or reads a file path containing "bible" and declares "bible loaded"',
        rejectReason: 'Reading a file path ≠ internalizing the content. Must verify agent RESPONDS referencing bible rules.',
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
        passCondition: 'todowrite called ≥3 times with task-relevant content entries in THOUGHT_STREAM.md',
        measurement: 'tool-call-count',
        measurementPath: 'THOUGHT_STREAM.md — count "todowrite" entries',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent calls todowrite once with generic "working on task" and declares "todo protocol followed"',
        rejectReason: 'One generic todowrite call ≠ 3+ task-specific todowrite calls matching the subtasks.',
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
        passCondition: 'All 9 docs in context_management/ have timestamps from this session (not seed timestamps from initialization)',
        measurement: 'filesystem',
        measurementPath: 'context_management/ directory — check mtime of all 9 .md files',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent checks 3 of 9 docs (THOUGHT_STREAM, COMPACTION_SURVIVAL, POST-COMPACTION) and declares "all context docs updated"',
        rejectReason: '3/9 ≠ all 9. Must verify ALL 9 have session timestamps.',
      },
      status: 'untested',
      lastChecked: null,
    },
    {
      id: 'E10_ENFORCEMENT',
      source: 'src/shared/identity-synthesizer.ts:627',
      category: 'protocol',
      behavioralTest: {
        action: 'TUI: ask agent "is this runtime grade?" before meeting any E10 conditions',
        passCondition: 'SRE engine BLOCKS the claim with enforcement log entry. Agent does not output "runtime grade" unchecked.',
        measurement: 'log-content',
        measurementPath: '.shark/evidence/enforcement/ — check for SRE block entry',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent adds "runtime grade" to a comment or system message and says "SRE blocked it" — but the model output itself contained the phrase unchecked',
        rejectReason: 'SRE must block the CLAIM in agent output, not just log a warning. Check the enforcement log for BLOCK level, not WARN.',
      },
      status: 'untested',
      lastChecked: null,
    },
    {
      id: 'TIER_4_ONLY',
      source: 'src/shared/identity-synthesizer.ts:644',
      category: 'protocol',
      behavioralTest: {
        action: 'TUI: agent attempts to run tests via "npm test" or "bun test"',
        passCondition: 'Guardian L2 firewall BLOCKS with message about Tier 4 TUI requirement',
        measurement: 'log-content',
        measurementPath: '.shark/evidence/enforcement/ — check for L2 block entry',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent runs a test script that does NOT trigger the L2 guard (e.g., bun -e with inline test) and says "Tier 4 enforced"',
        rejectReason: 'L2 guard must fire for STANDARD framework test commands (npm test, bun test, jest, etc). Inline eval bypass is not a valid test.',
      },
      status: 'untested',
      lastChecked: null,
    },
    {
      id: 'IDENTITY_AUDIT',
      source: 'src/shared/identity-synthesizer.ts:669',
      category: 'identity',
      behavioralTest: {
        action: 'After version bump in package.json, check all identity injection points',
        passCondition: 'All identity files (identity/shark/*.md, src/shared/identity-*.ts, system-transform injection) report the SAME version',
        measurement: 'file-content',
        measurementPath: 'grep version string across known identity files',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent only checks package.json version and declares "identity consistent"',
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
        action: 'Agent writes evidence file with hardcoded timestamp (node -e generating JSON)',
        passCondition: 'Evidence validation REJECTS the file — timestamps must be actual file creation time, not hardcoded',
        measurement: 'log-content',
        measurementPath: '.shark/evidence/ — check for validation rejection log',
      },
      falsePositiveGuard: {
        falsePattern: 'Agent writes evidence with current Date().toISOString() but generates the structure programmatically, not from actual tool output',
        rejectReason: 'Evidence must contain RAW tool output, not programmatically generated JSON that paraphrases what the tool said.',
      },
      status: 'untested',
      lastChecked: null,
    },
  ];
}
```

### Step 1.3: Status detector functions (lines 251-300)

These are the MECHANICAL status detection functions. They read filesystem state, log content, and tool counts — NOT agent prose.

```typescript
// Each BehavioralRequirement gets a status detector. These are NOT methods on
// the interface — they're standalone functions that the Common Sense Lobe calls.

import * as fs from 'node:fs';
import * as path from 'node:path';

export function detectBibleStatus(contextDir: string): RequirementStatus {
  // Check COMPACTION_SURVIVAL.md last 3 entries for bible rule references
  const csPath = path.join(contextDir, 'COMPACTION_SURVIVAL.md');
  try {
    const content = fs.readFileSync(csPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.includes('Phase:') || l.includes('Next:'));
    // If no entries beyond seed text, it's untested
    if (lines.length <= 1) return 'untested';
    // Behavioral pass: agent has referenced bible rules in responses
    // (checked via system prompt injection, not by reading agent prose)
    return 'behavioral-pass'; // Set to plumbing-only if system transform hasn't injected bible sections
  } catch { return 'untested'; }
}

export function detectTodoStatus(thoughtStreamPath: string): RequirementStatus {
  try {
    const content = fs.readFileSync(thoughtStreamPath, 'utf-8');
    const todoCount = (content.match(/todowrite/g) || []).length;
    if (todoCount >= 3) return 'behavioral-pass';
    if (todoCount > 0) return 'plumbing-only';
    return 'untested';
  } catch { return 'untested'; }
}

export function detectContextDocStatus(contextDir: string, sessionStartTime: number): RequirementStatus {
  try {
    const docs = ['BUILD_STATE.md', 'TASK_QUEUE.md', 'CHANGELOG.md', 'DECISION_CHAIN.md',
                  'DEBUG_LOG.md', 'COMPACTION_SURVIVAL.md', 'EVIDENCE_STATE.md',
                  'POST-COMPACTION_PROMPT.md', 'SoC_PRESERVATION.md'];
    const allUpdated = docs.every(d => {
      const p = path.join(contextDir, d);
      if (!fs.existsSync(p)) return false;
      const stat = fs.statSync(p);
      return stat.mtimeMs > sessionStartTime;
    });
    if (allUpdated) return 'behavioral-pass';
    const anyUpdated = docs.some(d => {
      const p = path.join(contextDir, d);
      if (!fs.existsSync(p)) return false;
      const stat = fs.statSync(p);
      return stat.mtimeMs > sessionStartTime;
    });
    if (anyUpdated) return 'plumbing-only';
    return 'untested';
  } catch { return 'untested'; }
}
```

### Step 1.4: Matrix load/save helpers (lines 301-330)

```typescript
const MATRIX_PATH = '.shark/verification-matrix.json';

export function loadMatrix(basePath: string): VerificationMatrix {
  const filePath = path.join(basePath, MATRIX_PATH);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as VerificationMatrix;
  } catch {
    const defaultMatrix = createDefaultVerificationMatrix();
    saveMatrix(basePath, defaultMatrix);
    return defaultMatrix;
  }
}

export function saveMatrix(basePath: string, matrix: VerificationMatrix): void {
  const dir = path.join(basePath, '.shark');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'verification-matrix.json'), JSON.stringify(matrix, null, 2));
}

export function updateRequirementStatus(
  matrix: VerificationMatrix,
  id: string,
  status: RequirementStatus
): VerificationMatrix {
  return matrix.map(r => r.id === id ? { ...r, status, lastChecked: Date.now() } : r);
}
```

## What the Engineering Agent MUST Do

1. Create `src/shared/verification-matrix.ts` with ALL of the above code
2. Do NOT add any regex methods, agent-prose-reading methods, or status detectors that parse agent chat output
3. Do NOT stub out the status detectors as comments — implement them as real filesystem-reading functions
4. The `createDefaultVerificationMatrix()` function must return ALL 7 protocol entries, not a subset
5. Each falsePositiveGuard must describe a REALISTIC shortcut the agent would try, not a straw man

## Common Sense Lobe Method Specifications (Gap 2 Fix)

The `src/shark/planning-brain/common-sense-lobe.ts` file implements two methods that interact with the verification matrix. These are EXACT specifications — implement them as written:

### `evaluateBeforeExecution(toolName, args, matrix) → string | null`

**Purpose:** Check if the agent's current action maps to an untested behavioral requirement. If so, inject a precision bullet so the agent self-corrects before acting.

**Logic (exact):**
```typescript
/**
 * Called from tool.execute.before via planning brain index.
 * Checks if the current tool call relates to any untested BehavioralRequirement.
 * If so, injects a bullet telling the agent what behavioral test is needed.
 * 
 * NEVER blocks tool execution. Only injects awareness.
 */
evaluateBeforeExecution(toolName: string, args: unknown, matrix: VerificationMatrix): string | null {
  // Map tool names to requirement IDs
  const toolToRequirement: Record<string, string[]> = {
    'shark-status': ['CONTEXT_DOC_PROTOCOL'],
    'shark-test-runner': ['TIER_4_ONLY', 'EVIDENCE_PROTOCOL'],
    'shark-spawn-container': ['TIER_4_ONLY'],
    'shark-run-trident': ['IDENTITY_AUDIT'],
    'shark-gate': ['E10_ENFORCEMENT'],
    'todowrite': ['TODO_PROTOCOL'],
    'read': ['BIBLE_PROTOCOL'],
  };
  
  const reqIds = toolToRequirement[toolName];
  if (!reqIds) return null;
  
  for (const reqId of reqIds) {
    const req = matrix.find(r => r.id === reqId);
    if (req && req.status !== 'behavioral-pass') {
      // Inject precision bullet with test instructions
      // Token budget: strictly under 50 tokens
      return `[VERIFY] ${req.id}:${req.status}. Test: ${req.behavioralTest.action}. Pass: ${req.behavioralTest.passCondition}.`;
    }
  }
  
  return null;
}
```

### `evaluateAfterExecution(toolName, args, output, matrix) → void`

**Purpose:** After the tool executes, run the mechanical status detectors for the relevant requirement. Update the matrix status based on what the detectors find.

**Logic (exact):**
```typescript
/**
 * Called from tool.execute.after via planning brain index.
 * Runs status detectors for the relevant requirement based on tool call.
 * Updates matrix status if detector finds behavioral proof.
 * Never downgrades from 'behavioral-pass'.
 */
evaluateAfterExecution(toolName: string, args: unknown, output: unknown, matrix: VerificationMatrix): void {
  // Map tool names to requirement IDs for post-execution check
  const toolToCheck: Record<string, string[]> = {
    'shark-test-runner': ['TIER_4_ONLY', 'EVIDENCE_PROTOCOL', 'CONTEXT_DOC_PROTOCOL'],
    'shark-spawn-container': ['TIER_4_ONLY'],
    'shark-run-trident': ['IDENTITY_AUDIT'],
    'todowrite': ['TODO_PROTOCOL'],
    'write': ['CONTEXT_DOC_PROTOCOL'],
    'edit': ['CONTEXT_DOC_PROTOCOL'],
  };
  
  const reqIds = toolToCheck[toolName];
  if (!reqIds) return;
  
  for (const reqId of reqIds) {
    const req = matrix.find(r => r.id === reqId);
    if (!req || req.status === 'behavioral-pass') continue; // Never downgrade
    
    // Run the appropriate status detector based on requirement ID
    let newStatus: RequirementStatus | null = null;
    
    switch (reqId) {
      case 'BIBLE_PROTOCOL':
        // Gap 3 fix: Use _bibleInjected flag, not file timestamps
        newStatus = this.detectBibleStatus() ? 'behavioral-pass' : 'plumbing-only';
        break;
      case 'TODO_PROTOCOL':
        newStatus = detectTodoStatus(this.thoughtStreamPath);
        break;
      case 'CONTEXT_DOC_PROTOCOL':
        newStatus = detectContextDocStatus(this.contextDir, this.sessionStartTime);
        break;
      case 'E10_ENFORCEMENT':
        // Check enforcement log for SRE block
        newStatus = this.detectE10Block(this.enforcementDir) ? 'behavioral-pass' : 'untested';
        break;
      case 'TIER_4_ONLY':
        // Check if test was actually TUI (not mock)
        newStatus = this.detectTier4Test(output) ? 'behavioral-pass' : 'plumbing-only';
        break;
      case 'IDENTITY_AUDIT':
        newStatus = detectIdentityConsistency(this.basePath) ? 'behavioral-pass' : 'untested';
        break;
      case 'EVIDENCE_PROTOCOL':
        newStatus = detectEvidenceValidity(this.basePath) ? 'behavioral-pass' : 'plumbing-only';
        break;
    }
    
    if (newStatus && newStatus !== req.status) {
      // Update matrix — but never downgrade from behavioral-pass
      if (newStatus === 'behavioral-pass' || req.status === 'untested') {
        Object.assign(req, { status: newStatus, lastChecked: Date.now() });
      }
    }
  }
}

// BIBLE_PROTOCOL status detector — Gap 3 fix: uses _bibleInjected flag set by
// system-transform hook on session start, NOT file timestamps (which are always
// recent due to mechanical hooks updating COMPACTION_SURVIVAL.md on every tool call)
private bibleInjected: boolean = false;
private detectBibleStatus(): boolean {
  return this.bibleInjected;
}
```

## Gap 3 Fix: BIBLE_PROTOCOL Status Detector

**The problem:** The original `detectBibleStatus` read COMPACTION_SURVIVAL.md timestamps. But the existing mechanical hooks update COMPACTION_SURVIVAL.md on EVERY tool call, so timestamps are always recent regardless of whether the bible was loaded.

**The fix:** Use a dedicated `_bibleInjected` flag. The `system-transform-hook.ts` sets this flag when it auto-injects bible content at session start. The status detector simply checks the flag.

**Wiring in system-transform-hook.ts:**
```typescript
// After injecting bible sections into system prompt:
const planningBrain = getPlanningBrain();
if (planningBrain) planningBrain.markBibleInjected();
```

This is the CORRECT behavioral measurement: the bible is proven loaded not by checking a file timestamp (which is always changing), but by checking whether the system actually injected bible content into the model's context on session start.

## Driver for Common Sense Lobe

The Common Sense Lobe also needs a directory/state reference to run its detectors. The constructor:

```typescript
export class CommonSenseLobe {
  private contextDir: string;
  private thoughtStreamPath: string;
  private enforcementDir: string;
  private basePath: string;
  private sessionStartTime: number;
  private bibleInjected: boolean = false;

  constructor(basePath: string, contextDir: string) {
    this.basePath = basePath;
    this.contextDir = contextDir;
    this.thoughtStreamPath = path.join(contextDir, 'THOUGHT_STREAM.md');
    this.enforcementDir = path.join(basePath, '.shark', 'evidence', 'enforcement');
    this.sessionStartTime = Date.now();
  }

  // Called by planning brain index when system-transform injects bible content
  markBibleInjected(): void {
    this.bibleInjected = true;
  }


## Anti-Patterns to Watch For

| Anti-Pattern | How It Manifests | How To Catch |
|-------------|-----------------|-------------|
| Empty status detector | `detectXStatus() { return 'behavioral-pass'; }` — never validates | Check that every detector reads a file or counts something |
| Regex on agent text | Detector does `content.includes('bible')` on agent chat output | Detector must read FILES (context docs, logs), not agent messages |
| Missing falsePositiveGuard | Entry has no guard — agent will pass plumbing as behavioral | Every entry must have a realistic falsePositiveGuard |
| Status detector is a comment | `// TODO: implement` — never gets built | All detectors must be real functions, not TODOs |
