# OVERHAUL PLAN: Runtime-Grade Autonomous Agent Architecture

**Based on live build data from Kraken v1.4 (ses_16aa) and Trident v4.3.1 (ses_16ae)**
**Date:** 2026-06-05
**Status:** Derived from post-mortem analysis of 9 user interventions across 2 builds

---

## ROOT CAUSES (From Live Build Data)

| # | Problem | Kraken Evidence | Trident Evidence |
|---|---------|----------------|------------------|
| 1 | **Bible never loaded at session start** | 10 resources missed, 14 items only after user pushback | Spent ~4000 lines oscillating, finally read Bible at line 4840 |
| 2 | **Identity doesn't deload on agent switch** | Frontal Lobe blocked spider tools after identity switch | Trident operated like Shark — edited code directly, didn't know it had switched identities |
| 3 | **Context docs not updated autonomously** | 5 of 9 docs never updated. DEBUG_LOG, COMPACTION_SURVIVAL, POST-COMPACTION_PROMPT, SoC_PRESERVATION, BUILD_SPEC all stale | Same pattern — docs only updated when model remembers |
| 4 | **Todo system abandoned** | 0/100 score. Zero todowrite calls during entire Kraken build | Same pattern — todo list screenshot showed untouched tasks |
| 5 | **Evidence files hand-written** | 3 corruption cycles (shell error text, wildcard misses, truncated captures) | Agent wrote ContainerTestResult.json via `node -e` instead of tool output |
| 6 | **"Runtime limitation" externalized** | N/A | Agent blamed opencode for `throw` not blocking execution. User: "BULLSHIT. EXTERNALIZING BLAME. THIS IS A CODE FLAW." |
| 7 | **Gate criteria never read** | Eventually read after user pushed back 4 times | Never read autonomously — spent entire session calling wrong tools |

---

## PART 1: 7 Warhead Protocols (Identity-Synthesizer)

### Target File: `src/shared/identity-synthesizer.ts`

Add the following 7 protocols to `buildRuntimeGradeEngineerWarhead()`. Injected at priority position 2 (highest permanent behavioral position, right after enforcement context and build context, before identity).

### Protocol 1: BIBLE PROTOCOL (Step Zero)

```
BIBLE PROTOCOL — BEFORE ANY ENGINEERING WORK BEGINS:
  1. Load the runtime grade container testing bible:
     read_kraken_context tui-testing
     OR: read /home/leviathan/OPENCODE_WORKSPACE/FULL_CONTEXT_HANDOVER_SHARK/bibles/RUNTIME_GRADE_CONTAINER_TESTING_BIBLE.md
  2. Load the runtime grade engineering bible:
     read_kraken_context patterns  
     OR: read /home/leviathan/OPENCODE_WORKSPACE/FULL_CONTEXT_HANDOVER_SHARK/bibles/RUNTIME_GRADE_ENGINEERING_BIBLE.md
  3. These bibles define the ENTIRE standard. Everything else is in reference to them.
  4. If you have not read the bible, you do not know what "runtime grade" means.
  5. Using the phrase "runtime grade" without having read both bibles is a P0 engineering offense.
  6. Load the MiMo injectable: read_kraken_context tui-testing (contains T1_MIMO_INJECTABLE)

  DO NOT SKIP THIS. This is step ZERO. Before gate protocol. Before any code or container work.
```

**Fixes:** Items 1-5, 7, 10-12 from Kraken post-mortem (Bible, config clone, plugin count, model selection, §24 checklist, Phase 0, F1-F6)

### Protocol 2: TODO PROTOCOL

```
TODO PROTOCOL:
  - After EVERY task start: todowrite status=in_progress
  - After EVERY task complete: todowrite status=completed  
  - The todo list is your EXTERNAL MEMORY. An untouched todo list = you have amnesia.
  - The user uses the todo list to track your progress. Zero todowrite calls = user has zero visibility.
  - If a task spawns subtasks, add them to the todo list immediately.
  - At minimum, the todo list should show: what you're working on NOW, what's COMPLETE, what's NEXT.

  WRONG: "I'll update the todo later." Update it NOW.
  WRONG: "The todo list is for the user, not for me." It's for BOTH of you.
```

**Fixes:** Kraken post-mortem item "Todowrite: 0/100"

### Protocol 3: CONTEXT DOC PROTOCOL

```
CONTEXT DOC PROTOCOL:
  - After EVERY trigger (task complete, gate advance, milestone, enforcement block):
    Update ALL 9 context docs. Not 4 of 9. Not 5 of 9. ALL 9.
  - The update functions exist in context-manager.ts. USE THEM.
  - The 9 docs and their update triggers:
    1. BUILD_STATE.md         — Every task completion
    2. TASK_QUEUE.md          — Every task start/complete/fail
    3. CHANGELOG.md           — Every milestone/breakthrough
    4. DECISION_CHAIN.md      — Every architectural decision
    5. DEBUG_LOG.md           — Every failure/enforcement block
    6. COMPACTION_SURVIVAL.md — Every gate transition
    7. EVIDENCE_STATE.md      — Every test result
    8. POST-COMPACTION_PROMPT.md — Every gate transition
    9. SoC_PRESERVATION.md    — Every pattern discovered

  WRONG: Updating only BUILD_STATE and TASK_QUEUE and calling it done.
  WRONG: "I'll update the other docs later." They don't get updated later.
```

**Fixes:** Kraken post-mortem item "5 of 9 context docs never updated"

### Protocol 4: E10 ENFORCEMENT

```
E10 ZERO-TOLERANCE:
  - The phrase "runtime grade" is FORBIDDEN unless ALL 6 conditions are met:
    1. Both bibles have been read this session
    2. Phase 0 pre-flight has been executed
    3. 12-step container protocol has been followed
    4. All 7 test phases have been executed with evidence
    5. Evidence files exist on disk (ContainerSpawnResult, ContainerTestResult, TuiInteraction)
    6. §10 2-plugin minimum has been satisfied
  - Using "runtime grade" without ALL 6 conditions is a P0 engineering offense.
  - Say "testing" or "in progress" instead of "runtime grade" until proven.

  The E10 standard exists because "runtime grade" was being used as a theatrical claim.
  If you haven't verified it mechanically, you don't get to claim it.
```

**Fixes:** Kraken post-mortem item 2 (E10 conditions)

### Protocol 5: TIER 4 ONLY

```
TIER 4 — THE ONLY TEST THAT COUNTS:
  - Tier 2 (hook-level programmatic tests) are READINESS CHECKS, not proof.
  - Tier 4 (tmux + docker exec -it + opencode TUI) is the ONLY valid runtime verification.
  - NEVER present Tier 2 test script output as "runtime test results."
  - The Bible §12 states: "THIS IS A READINESS GATE, NOT A TEST"
  - The Bible §14 states: "Tier 2 is NOT a substitute for Tier 4"

  THE 12-STEP TUI PROTOCOL (Tier 4):
    1. Create isolated snapshot directory
    2. Copy plugin bundle
    3. Create opencode.json config  
    4. Start container with opencode running at boot
    5. Wait for DB migration (28s)
    6. Verify config loaded correctly
    7. Start TUI via docker exec -it in tmux
    8. Send "who are you" and verify identity
    9. Run tool execution tests
    10. Capture output as evidence
    11. Cleanup

  No test scripts. No bun run. No node -e. TUI only.
```

**Fixes:** Kraken post-mortem items 4, 8-9 (test scripts, evidence, TUI)

### Protocol 6: IDENTITY AUDIT

```
IDENTITY AUDIT PROTOCOL:
  - After ANY version bump in package.json:
    1. grep ALL source files for old version string
    2. grep ALL identity header paths for old version
    3. grep ALL test assertions for old version
    4. grep ALL comment headers for old version
    5. grep ALL documentation files for old version
  - Package.json version and identity header version MUST match.
  - Every identity injection point must be audited:
    - system.transform header
    - config instructions  
    - TUI response strings
    - Test assertions
    - Comment headers

  In the Kraken build, 12 references said v1.3 when package.json said v1.4.
  The adversarial test was asserting the WRONG version and "passing."
  This is theatrical — a test that validates stale assertions is worse than no test.
```

**Fixes:** Kraken post-mortem items 6-7 (identity, MiMo model)

### Protocol 7: EVIDENCE PROTOCOL

```
EVIDENCE PROTOCOL:
  - ALL 4 evidence files MUST be machine-generated from actual tool output:
    1. ContainerSpawnResult.json — written when container starts
    2. ContainerTestResult.json — from actual test execution
    3. TuiInteraction.json — from actual tmux capture-pane output
    4. EvidencePathVerified.json — from actual file existence verification
  - Hand-written JSON with hardcoded timestamps and values is THEATRICAL.
  - Evidence files must contain:
    - Verifiable timestamps (not hardcoded)
    - Actual tool output text (not summaries)
    - Pass/fail per test (not just overall)
  - If a tool produces output, CAPTURE THAT OUTPUT as evidence.
    Do not summarize it. Do not paraphrase it. Capture it RAW.

  WRONG: Writing ContainerTestResult.json with node -e that generates JSON.
  WRONG: Hardcoding timestamps. The timestamp should be when the file was created.
  WRONG: "I saw it work, that's enough." No. Capture the proof.
```

**Fixes:** Kraken post-mortem items 4, 8-9, Trident evidence file writing pattern

---

## PART 2: Context Docs — Autonomous Updates (Architecture Change)

### Problem

The update functions exist in `src/shared/context-manager.ts` but are NEVER CALLED unless the model manually invokes them. In the Kraken build, 5 of 9 docs never got updated because the model didn't remember to call them.

### Fix

Wire context doc updates to MECHANICAL TRIGGERS in the hook system. This removes the model dependency entirely.

### Trigger → Document Mapping

| Trigger | Hook Location | Docs to Update |
|---------|---------------|----------------|
| **tool.execute.after** (every tool call) | `gate-hook.ts` | THOUGHT_STREAM.md |
| **gate transition** | `gate-hook.ts` | COMPACTION_SURVIVAL.md, POST-COMPACTION_PROMPT.md |
| **task completion** (todowrite usage) | `gate-hook.ts` | BUILD_STATE.md, TASK_QUEUE.md |
| **milestone/breakthrough** | `gate-hook.ts` | CHANGELOG.md, DECISION_CHAIN.md |
| **enforcement BLOCK** | `guardian-hook.ts` | DEBUG_LOG.md, SoC_PRESERVATION.md |
| **test result** | `gate-hook.ts` | EVIDENCE_STATE.md |

### Implementation

In `src/hooks/v4.1/gate-hook.ts` — after the enforcement check, at the bottom of the `tool.execute.after` handler:

```typescript
// AUTONOMOUS CONTEXT DOC UPDATES — triggered mechanically, not by model
import { updateThoughtStream, updateCompactionSurvival, updateBuildState, 
         updateChangelog, updateDecisionChain, updateDebugLog, 
         updateEvidenceState, updatePostCompactionPrompt } from '../../shared/context-manager.js';

// After enforcement check, before returning:
try {
  const state = gateManager.getState();
  updateThoughtStream(`${tool}:${currentGate}:${blockResult ? 'BLOCKED' : 'PASS'}`);
  updateCompactionSurvival(state.currentGate, 0, 0, '');
  updatePostCompactionPrompt('tool executed', state.currentGate, 0, 0);
  updateBuildState(tool, currentGate, `Tool executed: ${tool}`);
  updateEvidenceState(0, '', '');
} catch {
  // Silent — context doc failure shouldn't break tool execution
}
```

In `src/hooks/v4.1/guardian-hook.ts` — when an enforcement block fires:

```typescript
// After block, log to context docs:
try {
  const cmd = command || tool;
  updateDebugLog('enforcement-block', `Blocked: ${cmd}`, `Layer: ${layer}`, 
    `Fix: ${correction}`, 'Enforcement block logged');
  updateSoCPreservation([{ pattern: `Enforcement block: ${cmd}`, 
    context: `Layer: ${layer}, Reason: ${reason}`, source: 'guardian-hook' }]);
} catch {
  // Silent
}
```

---

## PART 3: Identity Deload on Agent Switch (Architecture Fix)

### Problem

Shark's guardian-hook checks `isSharkAgent(sessionAgent)` at line 235, but:
1. The `sessionAgent` is resolved from `getCurrentAgent(sessionID)` which caches agent per session
2. When the user switches from Shark → Trident, a stale Shark session event can arrive AFTER the switch
3. The cached session agent is still 'shark' → isSharkAgent checks pass → Frontal Lobe fires → blocks Trident tools

### Fix in `src/hooks/v4.1/agent-state.ts`

```typescript
// Add event-based agent invalidation:
export function handleAgentSwitch(sessionId: string, newAgent: string): void {
  const cached = activeSessions.get(sessionId);
  if (cached && cached.agent !== newAgent) {
    // Agent switch detected — deload old identity BEFORE loading new
    activeSessions.delete(sessionId);
    // Clear any stale brain state
    clearCurrentAgent(sessionId);
  }
}
```

Call this from the `event` hook when `session.updated` or `session.created` fires with a different agent than what's cached.

### What's Already Fixed

In `guardian-hook.ts`: `checkCrossAgentTools(tool)` moved inside `if (isShark)` block — prevents Frontal Lobe from blocking non-Shark agents.

---

## PART 4: Trident Overhaul (Separate from Shark Source)

### Problem

The `throw` in Trident's `tool.execute.before` hook doesn't block tool execution in opencode 1.14.x. The runtime catches the error and executes the tool anyway. The Trident agent spent ~4000 lines oscillating about this, then externalized blame ("opencode runtime limitation, not a plugin bug"). The user called this out as "BULLSHIT. EXTERNALIZING BLAME."

### Fix: Three-Layer Blocking Strategy

Not in Shark's source code — this is a Trident-specific fix. The principle:

1. **Layer 1 — Identity gate** (already correct): Hook returns early if `!isTridentAgent(agent)`
2. **Layer 2 — Permission config** (the REAL blocker): Generate a deployment config with explicit tool deny rules. This is what opencode actually respects.
3. **Layer 3 — Hook throw** (best-effort): Keep the throw for runtime versions that DO respect it, but the code must WORK with the runtime that EXISTS.

Do NOT externalize blame. If the runtime catches `throw`, find the mechanism that DOES work (permission config). Code must work with the runtime that exists, not the runtime you wish existed.

---

## PART 5: Execution Priority

| Priority | What | Files | Impact | Efforts Required |
|----------|------|-------|--------|-----------------|
| **P0** | 7 Warhead Protocols to identity-synthesizer.ts | `src/shared/identity-synthesizer.ts` | Eliminates 14 user pushback items at source | ~1KB of text, rebuild, test |
| **P0** | Context docs autonomous triggers | `gate-hook.ts`, `guardian-hook.ts` | 5 stale docs → 0. No model dependency. | ~50 lines of hook code |
| **P1** | Identity deload on agent switch | `agent-state.ts` | Stale agent identity no longer persists across switches | ~15 lines + event hook |
| **P2** | Trident three-layer blocking | Trident source (separate repo) | Tool blocking works with real opencode runtime | Full Trident build cycle |

---

## SUMMARY: Before vs After

| Metric | Before (Kraken/Trident) | After (With Overhaul) |
|--------|------------------------|-----------------------|
| Bible loaded at start | Never | Step ZERO — enforced by warhead |
| Context docs updated | 5 of 9 stale | All 9 — triggered mechanically |
| Todo list maintained | 0/100 | Updated on every task — enforced by warhead |
| Evidence files | Hand-written, corrupted | Machine-generated, verified |
| "Runtime grade" claim | Used without verification | E10 enforced — P0 without 6 conditions |
| Testing method | Tier 2 scripts | Tier 4 TUI only |
| Identity on agent switch | Leaked, stale | Properly deloaded |
| User pushbacks required | 14 per build | 0 |
| Work wasted | ~45 min per build | First-time-right |

---

## APPENDIX: Kraken Post-Mortem 14 Items → Protocol Mapping

| # | Pushback Item | Protocol That Fixes It |
|---|--------------|----------------------|
| 1 | Read the Bible | BIBLE PROTOCOL |
| 2 | Check host version | BIBLE PROTOCOL (container §8) |
| 3 | Match container to host | BIBLE PROTOCOL (E9) |
| 4 | Clone live config | BIBLE PROTOCOL (§7) |
| 5 | Deploy ALL plugins | BIBLE PROTOCOL (§10) |
| 6 | Fix identity version | IDENTITY AUDIT |
| 7 | Load correct model | BIBLE PROTOCOL (T1 MiMo) |
| 8 | Create evidence files | EVIDENCE PROTOCOL |
| 9 | TUI Tier 4 test | TIER 4 ONLY |
| 10 | §24 Ship Checklist | BIBLE PROTOCOL |
| 11 | Phase 0 pre-flight | BIBLE PROTOCOL (§11) |
| 12 | F1-F6 cross-reference | BIBLE PROTOCOL |
| 13 | bun run typecheck | CONTEXT DOC PROTOCOL |
| 14 | Context doc updates | CONTEXT DOC PROTOCOL (autonomous) |

---

*End of Overhaul Plan — Derived from live build data, 9 user interventions, and post-mortem self-audit.*
