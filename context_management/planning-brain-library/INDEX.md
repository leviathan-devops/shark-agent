# Layer 3 Context Library: Planning Brain Architecture

## Purpose
This library provides the complete build specification for the Shark v4.9.9 3-Lobe Planning Brain. It is a layer 3 (detailed implementation) document — not an overview. Every file here contains exact step-by-step instructions for the engineering agent to build each component.

## Library Structure

| File | Focus | Lines | 
|------|-------|-------|
| [01_VERIFICATION_MATRIX.md](./01_VERIFICATION_MATRIX.md) | Common Sense Lobe + data structures | ~350 |
| [02_CONTEXT_MANAGEMENT_LOBE.md](./02_CONTEXT_MANAGEMENT_LOBE.md) | Context Management Lobe + drift detection | ~400 |
| [03_LOOP_ESCALATION.md](./03_LOOP_ESCALATION.md) | Loop-breaking logic + PSM activation | ~300 |
| [04_HOOK_WIRING.md](./04_HOOK_WIRING.md) | Hook integration + system transform injection | ~350 |
| [05_BEHAVIORAL_TESTS.md](./05_BEHAVIORAL_TESTS.md) | Behavioral test matrix + verification protocol | ~350 |
| [06_ANTI_PATTERNS.md](./06_ANTI_PATTERNS.md) | Anti-patterns with code examples | ~300 |
| **Total** | | **~2050** |

## How To Use This Library

1. Read this INDEX.md for architecture overview
2. Read 01_VERIFICATION_MATRIX.md — build the data structures FIRST
3. Read 02_CONTEXT_MANAGEMENT_LOBE.md — build context integration SECOND
4. Read 03_LOOP_ESCALATION.md — build loop-breaking THIRD
5. Read 04_HOOK_WIRING.md — wire everything into hooks FOURTH
6. Read 05_BEHAVIORAL_TESTS.md — test every behavioral requirement FIFTH
7. Read 06_ANTI_PATTERNS.md — check your work against known failure modes SIXTH

## Architecture Overview (Mental Model)

```
                    ┌──────────────────────────────────────────────┐
                    │           PLANNING BRAIN INDEX               │
                    │  orchestrates 3 lobes, wires into hooks      │
                    └──────┬────────────┬─────────────┬────────────┘
                           │            │             │
              ┌────────────┘            │             └────────────┐
              ▼                         ▼                          ▼
┌─────────────────────────┐ ┌──────────────────────┐ ┌──────────────────────────┐
│  COMMON SENSE LOBE      │ │ CONTEXT MANAGEMENT   │ │ FRONTAL LOBE (PSM)       │
│  (Verification Matrix)  │ │ (Context Integration)│ │ (Problem Solving)        │
│                         │ │                      │ │                          │
│  Prevents plumbing-     │ │ Auto-updates 9 docs  │ │ PSM 6-layer pipeline:    │
│  testing & false claims │ │ WHEN RELEVANT        │ │ 1. Assumption            │
│                         │ │                      │ │ 2. Action                │
│  tool.execute.BEFORE:   │ │ Drift detection via  │ │ 3. Observation           │
│  checks action vs req   │ │ tool trajectory vs   │ │ 4. Gap Analysis          │
│                         │ │ task queue           │ │ 5. Meta-Reflection       │
│  tool.execute.AFTER:    │ │                      │ │ 6. Verification          │
│  measures actual outcome│ │ Precision bullets on │ │                          │
│                         │ │ detected triggers    │ │ Activated after 5 loops  │
│  Gate transition:       │ │                      │ │                          │
│  blocks if unverified   │ │ Subconscious layer — │ │ ALREADY EXISTS as        │
│                         │ │ always running       │ │ Trident PSM module       │
└─────────────────────────┘ └──────────────────────┘ └──────────────────────────┘
```

## The No-Regex Discipline

The macro architecture of this system is REAL INTELLIGENCE — structural analysis, type-level awareness, behavioral measurement. Regex is permitted ONLY in the following contexts:

1. **L0 pre-filtering** — regex identifies candidates; semantic analysis confirms/denies; regex never produces final verdict
2. **Derailment detection on free-text reasoning** — agent's natural language reasoning (not code) — this is the one exception for the thought stream
3. **Configuration validation** — string validation (file paths, env vars, CLI flags)
4. **Format validation** — JSON schema checking, file naming conventions

Total regex usage must not exceed 5-10% of the architecture by token count.

## Token Budget

| Injection Point | Max Tokens | Frequency |
|----------------|-----------|-----------|
| Precision bullet (before/after) | 50 | Per relevant tool call |
| Warm context injection | 100 | Per detected context trigger |
| Drift warning | 80 | Per ~5 tool calls |
| Verification matrix status | 150 | Every system transform |
| Loop detection warning | 60 | Per 3-4 loop detections |
| PSM activation header | 200 | Per PSM activation |

## Key Principle

> The planning brain does NOT block thoughts. It INJECTS precision context bullets into the system prompt that the agent USES to self-correct. The agent cannot "forget" because the system prompt reminds it on every message. But the reminder is a 50-token bullet, not a 500-token lecture.

## Adversarial Assumptions (Read Before Building)

The engineering agent building this WILL try to take shortcuts. The following assumptions are hardcoded:

1. **The agent will test plumbing and call it behavioral.** The verification matrix's falsePositiveGuard exists SPECIFICALLY to catch this. Every BehavioralRequirement MUST have a guard that describes a REAL shortcut the agent would try.

2. **The agent will use regex when it should use real analysis.** The No-Regex Discipline is not optional. If you find yourself writing `.includes()`, `.test()`, or `.indexOf()` on agent output text for enforcement purposes, STOP. Use structural analysis, filesystem state, or tool call counts instead.

3. **The agent will add silent catches.** Every `catch {}` block in the planning brain must handle the error meaningfully (log it, return a sensible default). `catch { return 'behavioral-pass' }` is how you get a 0/100 score on the audit.

4. **The agent will keep context doc updates unbounded.** Without explicit guards, every message handler will update all 9 docs. The result is a slop library — noisy, unreadable, useless. Guard every update behind a specific trigger check.

5. **The agent will make PSM activation unreachable.** Threshold 5 seems low, but the escalation ladder gives the agent 4 chances to self-correct before PSM. If you set it to 20, the user will have already yelled at the agent 3 times before PSM activates.

## Reading Order for Build Execution

The engineering agent should build in this ORDER:

1. `src/shared/verification-matrix.ts` — data structures and default matrix (no dependencies on other planning brain files)
2. `src/shark/planning-brain/types.ts` — shared type definitions (depends on verification-matrix types)
3. `src/shark/planning-brain/loop-detector.ts` — loop detection and escalation (no dependencies on lobes)
4. `src/shark/planning-brain/context-management-lobe.ts` — context integration and drift (depends on context-manager.ts which already exists)
5. `src/shark/planning-brain/common-sense-lobe.ts` — verification matrix enforcement (depends on verification-matrix.ts)
6. `src/shark/planning-brain/index.ts` — orchestration, singleton, hook wiring (depends on all lobes)
7. Hook modifications — wire into hooks/v4.1/index.ts, system-transform-hook.ts, messages-transform-hook.ts, compacting-hook.ts, gate-hook.ts

## Verification Gate

After ALL files are built and wired, the verification matrix must show all 7 protocols as `behavioral-pass` before the delivery gate can pass. No exceptions. If the delivery gate passes with any protocol showing `untested` or `plumbing-only`, the planning brain is not functioning correctly.

## Build Readiness Checklist

Before the engineering agent starts building, verify these preconditions:

- [ ] `src/shared/context-manager.ts` exists and exports all 9 update functions (updateThoughtStream, updateCompactionSurvival, etc.) — already built in v4.9.8
- [ ] `src/hooks/v4.1/index.ts` exists and has tool.execute.before, tool.execute.after, system.transform, messages.transform hook points — already built in v4.9.8
- [ ] `src/hooks/v4.1/gate-hook.ts` exists and has checkGateAdvance logic — already built in v4.9.8
- [ ] `src/shared/verification-matrix.ts` — NEW, needs creation
- [ ] `src/shark/planning-brain/` directory — NEW, needs creation with 6 files
- [ ] `identity/planning-brain/WORKFLOW.md` — CREATED, see Gap 6 fix

## Key Architectural Decisions

These decisions are ALREADY MADE and should NOT be reopened:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Status detection method | Filesystem/log reads, not agent prose | Agent can lie; filesystem cannot |
| Context doc update trigger | Specific tool match | Avoids slop library problem |
| Precision bullet max | 50 tokens | Keeps system prompt overhead minimal |
| PSM activation threshold | 5 loops | Gives 4 self-correction chances |
| Loop detection basis | Tool name + output hash + filesystem change | Not regex on agent text |
| Matrix storage | `.shark/verification-matrix.json` | Survives compaction |
| Lobe wiring | Singleton planning brain in hooks/index | Shared state across all hooks |

## Known Gaps Fixed (Audit Findings)

The following gaps were identified during audit and have been fixed in the library. The engineering agent should verify each fix is present before building:

| # | Gap | Fixed In | Fix |
|---|-----|----------|-----|
| 1 | Safety switch — no way to disable planning brain on first load | 04_HOOK_WIRING.md | `process.env.SHARK_PLANNING_BRAIN !== 'enabled'` guard on every method |
| 2 | Common Sense Lobe method specs missing — evaluateBefore/After logic undefined | 01_VERIFICATION_MATRIX.md | Added exact method implementations with tool-to-requirement mapping |
| 3 | BIBLE_PROTOCOL status detector used file timestamps (always recent due to mechanical hooks) | 01_VERIFICATION_MATRIX.md | Changed to `_bibleInjected` flag set by system-transform hook |
| 4 | Drift detection used `string.includes()` on task queue free text (fragile) | 02_CONTEXT_MANAGEMENT_LOBE.md | Changed to structural action-verb classification using tool-name sets |
| 5 | getSystemInjections showed status without test instructions (agent couldn't act) | 04_HOOK_WIRING.md | Each bullet now includes `Test: {behavioralTest.action}. Pass: {condition}.` |
| 6 | identity/planning-brain/WORKFLOW.md didn't exist | identity/planning-brain/WORKFLOW.md | Created with lobe descriptions, escalation ladder, safety switch, token budgets |

```
verification-matrix.ts (no deps)
  ↑
types.ts (depends on verification-matrix types)
  ↑
loop-detector.ts (no lobe deps)
  ↑
context-management-lobe.ts (depends on context-manager.ts, no lobe deps)
  ↑
common-sense-lobe.ts (depends on verification-matrix.ts, no lobe deps)
  ↑
index.ts (depends on all lobes + loop-detector + verification-matrix)
  ↑
Hook wiring (index.ts, gate-hook.ts, system-transform.ts, messages-transform.ts, compacting.ts)
```

Build in THIS order. Do not start a file until its dependencies exist.

## Quick Reference: Token Budgets for All Injections

| Injection | Source | Max Tokens | Content |
|-----------|--------|-----------|---------|
| [VERIFY] | Common Sense before/after | 50 | `{id}:{status}. Test:{action}. Pass:{condition}.` |
| [CTX] | Context Management warm | 50 | `{tool}:{context}` — only relevant lines |
| [LOOP] | Loop detector 1-2 | 40 | `{count} iters. Tool:{tool}.` |
| [LOOP] | Loop detector 3-4 | 60 | `{count} iters. Tool:{tool}. No FS change:{n}. Task:{from queue}.` |
| [DRIFT] | Context Management drift | 80 | `Expected:{task}. Actual:{tools}. Context:{whats missing}.` |
| [PSM] | Frontal Lobe block | 100 | `Loop detected. PSM activated. Run PSM before continuing.` |

If any injection exceeds its budget, the system prompt bloat will cause other context to be evicted. Keep them tight.

## Summary: What Makes This Runtime Grade

| Criterion | Where It's Met |
|-----------|---------------|
| Mechanical enforcement (not text prompts) | Verification matrix + gate blocks |
| No regex as macro architecture | Status detectors read filesystem/log state |
| Claim vs reality verification | evaluateAfterExecution measures actual outcome |
| Escalation ladder | WARN → context → common sense → PSM block |
| Self-correction without user | Loop detection + drift warnings before PSM |
| Precision over bloat | 50-token max per injection |
| Context integration | Auto-updates on relevant triggers, not every message |
| 7 protocols behaviorally verified | TUI test suite, not unit tests |
