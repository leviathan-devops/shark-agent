# V4.9.9 BUILD SPEC: 3-Lobe Planning Brain Architecture

## Overview

The Planning Brain is the intelligence layer for Shark v4.9.9. It parallels the Execution Brain (which polices TOOL CALLS) by policing THOUGHT STREAMS — ensuring the agent thinks correctly, doesn't drift, doesn't take shortcuts, doesn't lie about verification, and self-corrects before needing user intervention.

## Three Lobes

### Lobe 1: Common Sense Lobe (Verification Matrix)
- **File:** `src/shark/planning-brain/common-sense-lobe.ts`
- **Wiring:** `tool.execute.before` + `tool.execute.after` + gate transitions
- **Purpose:** Prevents the agent from testing plumbing and claiming behavioral victory. Maps every action to a behavioral requirement. Checks claim vs reality after execution.
- **Bible Principle:** Order 5 — Claim vs Reality Verification

### Lobe 2: Context Management Lobe (Context Integration)
- **File:** `src/shark/planning-brain/context-management-lobe.ts`
- **Wiring:** `messages.transform` + `tool.execute.before` + `tool.execute.after` + `compacting`
- **Purpose:** The "subconscious" — always running, always updating 9 context docs WHEN RELEVANT, detects drift by comparing tool trajectory against task queue, injects precision context bullets at the right moment.
- **Bible Principle:** Order 2-3 — Structural + Type-level awareness of conversation

### Lobe 3: Frontal Lobe (Problem Solving / PSM)
- **Already exists as Trident Problem Solving Mode**
- **Wiring:** `tool.execute.before` — activates after 5 loop attempts
- **Purpose:** Structured reasoning framework when the agent is stuck. 6-layer pipeline: Assumption → Action → Observation → Gap Analysis → Meta-Reflection → Verification

## Loop Escalation Ladder
- Loops 1-2: Context Management injects precision context bullet
- Loops 3-4: Common Sense fires evaluateBeforeExecution with stronger signal
- Loop 5+: Frontal Lobe (PSM) activated, tool.execute.before BLOCKS

## Key Design Constraints (from Runtime Grade Bible)
1. No regex as macro architecture — macro architecture is REAL INTELLIGENCE (structural, type-level, behavioral measurement)
2. Regex permitted as 5-10% subset of triggers within a group of more advanced triggers
3. All measurements in tokens/words first, lines second, filesize third
4. Context doc updates only WHEN RELEVANT — building on existing mechanical architecture
5. Watch the anti-patterns: regex-in-AST-clothing, branding illusion, type theater

## File Manifest

### New Files (6)
| File | Lines | Purpose |
|------|-------|---------|
| `src/shared/verification-matrix.ts` | ~300 | Data structures + mechanical status detection |
| `src/shark/planning-brain/common-sense-lobe.ts` | ~250 | Lobe 2: before/after enforcement |
| `src/shark/planning-brain/context-management-lobe.ts` | ~350 | Lobe 3: context integration + drift |
| `src/shark/planning-brain/index.ts` | ~200 | Orchestration + hook wiring |
| `src/shark/planning-brain/types.ts` | ~100 | Shared types for all lobes |
| `identity/planning-brain/WORKFLOW.md` | ~80 | T2 planning brain workflow |

### Modified Files (5)
| File | Change |
|------|--------|
| `src/hooks/v4.1/index.ts` | Wire planning brain into tool.execute.before/after |
| `src/hooks/v4.1/gate-hook.ts` | Delivery gate verification matrix check |
| `src/hooks/v4.1/system-transform-hook.ts` | Inject matrix status + warm context |
| `src/hooks/v4.1/messages-transform-hook.ts` | Context management reads message stream |
| `src/hooks/v4.1/compacting-hook.ts` | Save/restore planning brain state |
