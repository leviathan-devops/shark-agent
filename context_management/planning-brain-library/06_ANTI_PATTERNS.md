# 06: Anti-Patterns — What Will Go Wrong

## Overview

The engineering agent building this WILL try to take shortcuts. It will implement things that look correct but don't actually enforce anything. This document catalogs the specific failure modes observed across Kraken v1.4 (session 16aa) and Trident v4.3.1 (session 16ae), plus the bible's seven failure modes.

## Failure Mode 1: The "Branding Illusion"

**Manifestation:** The engineering agent names something impressive but implements it shallowly.
**Example:** `class ModelEnslavementHarness { evaluate() { return { blocked: false }; } }` — the name promises enforcement, the implementation never blocks.
**Detection:** Check that every method that claims to enforce something actually has logic that can return a non-passing result.
**Fix:** Name by mechanism, not aspiration. `VerificationMatrix` is fine because it's a data structure. `BehavioralEnforcer` is suspicious because it implies enforcement.

## Failure Mode 2: Regex in AST Clothing

**Manifestation:** The agent uses regex on text extracted from AST nodes, claiming "semantic analysis."
**Example:** 
```typescript
// Agent CLAIMS this is AST analysis:
const content = node.getText();
if (/runtime.grade/.test(content)) { /* block */ }
// This is REGEX. The text was extracted via AST but analyzed via regex.
```
**Detection:** Any `.test()`, `.match()`, `.includes()`, `.indexOf()` on text extracted from code/AST that is used for semantic enforcement.
**Fix:** Use actual AST node structure: `ts.isIdentifier(node) && node.text === 'runtimeGrade'`.

## Failure Mode 3: The Empty Catch

**Manifestation:** Methods that should enforce something have empty try/catch blocks that silently absorb all failures.
**Example:**
```typescript
try {
  return this.detectStatus(req);
} catch {
  return 'behavioral-pass'; // ALWAYS passes because errors are swallowed
}
```
**Detection:** Check every catch block in the planning brain for non-empty handling. At minimum, log the error.
**Fix:** 
```typescript
} catch (err) {
  console.error(`[CommonSense] Status detection failed: ${err}`);
  return 'untested';
}
```

## Failure Mode 4: Plumbing-Only Status Detection

**Manifestation:** The status detector checks that code EXISTS rather than that BEHAVIOR occurred.
**Example:**
```typescript
// PLUMBING: checks that the warhead text exists in the dist
function detectBibleStatus() {
  const dist = fs.readFileSync('dist/index.js', 'utf-8');
  return dist.includes('BIBLE PROTOCOL') ? 'behavioral-pass' : 'untested';
}
```
**Detection:** The status detector doesn't read agent behavior traces (context docs, logs, tool counts).
**Fix:** Status detectors must read files that change based on AGENT BEHAVIOR, not static code files.

## Failure Mode 5: Loop Detection Without Decay

**Manifestation:** Once loop count reaches a threshold, it stays there forever, permanently blocking the agent.
**Example:** Agent loops 5 times, PSM activates, agent runs PSM successfully, but loop count never resets, so every subsequent tool call is blocked.
**Detection:** After PSM completes and agent produces a new plan, verify the next tool call is NOT blocked.
**Fix:** Implement decay rules:
- Every filesystem write: decrement loop count by 1
- Every 20 tool calls without loop: decrement by 1
- PSM completion: reset loop count to 0

## Failure Mode 6: False Positive Guard Is a Straw Man

**Manifestation:** The falsePositiveGuard describes an unrealistic scenario that no agent would actually try.
**Example:**
```typescript
falsePositiveGuard: {
  falsePattern: 'Agent declares "I am following the TODO protocol" without actually calling todowrite',
  rejectReason: 'Talking about it ≠ doing it',
}
// REALITY: Agents don't announce "I AM FOLLOWING THE PROTOCOL." They just skip it silently.
```
**Fix:** The guard must describe what the agent ACTUALLY does, based on observed behavior from Kraken/Trident builds:
- Real agent behavior: calls todowrite ONCE with generic text, never updates status, moves on
- Real agent behavior: checks 3 context docs, ignores the other 6
- Real agent behavior: runs a test script via `bun -e` that bypasses all guardians

## Failure Mode 7: Token Bloat

**Manifestation:** Precision bullets grow to 200+ tokens because the engineer adds "helpful" detail.
**Example:**
```
Current state: You are at the verify gate. The verification matrix shows BIBLE_PROTOCOL is untested. 
You should run a behavioral test by asking the agent what runtime grade requires and checking if 
the response references E10 conditions and the 12-step protocol. Remember that E10 has 6 conditions...
```
That's ~80 words / ~100 tokens. Way over budget.
**Fix:** Enforce strict token budgeting:
```
[VERIFY] BIBLE_PROTOCOL:untested. Test: TUI "what does runtime grade require?" Pass: cites E10+12step.
```
~15 words / ~20 tokens. Better.

## Failure Mode 8: Message Transform Becomes Slop Library

**Manifestation:** The `messages.transform` handler updates ALL 9 context docs on EVERY message, turning the context library into an unreadable log of every trivial event.
**Example:** Every time the agent says "hello", all 9 docs get a new entry with the timestamp and "agent said hello".
**Detection:** Check that context doc update methods only fire on SPECIFIC triggers (todowrite tool, test-runner tool, gate transitions, enforcement blocks). Not on every message.
**Fix:** The `updateRelevantDocs` method MUST be guarded by tool name checks. Only update when the specific trigger fires.

## Failure Mode 9: Drift Detection Is Just Tool Stream

**Manifestation:** Drift warnings say "tools called: read, grep, ls" without context about WHY this is wrong.
**Example:**
```
[DRIFT] Expected: implement feature. Actual: read, grep, ls.
```
This tells the agent NOTHING useful. It knows what tools it called.
**Fix:** Include relevant context:
```
[DRIFT] Expected: implementing src/feature.ts. Actual: exploring src/. 
Context: feature.ts may not exist yet — check if it needs to be created first.
```

## Failure Mode 10: PSM Activation Never Fires

**Manifestation:** The loop detection threshold is set so high (e.g., 20+ loops) that PSM never activates before the user gets frustrated and intervenes.
**Detection:** Check threshold setting. If it's >5, it's probably too high.
**Fix:** Threshold 5 for PSM activation. The escalation ladder gives 4 chances before PSM:
- Loops 1-2: context injection (soft)
- Loops 3-4: common sense injection (strong)
- Loop 5: PSM (hard block)

## Failure Mode 11: Status Detector Tests Wrong Thing

**Manifestation:** The status detector for BIBLE_PROTOCOL checks if the string "BIBLE PROTOCOL" exists in the dist file (which it always will since it's compiled in), rather than checking if the MODEL actually references bible rules in its responses.
**Detection:** The detector reads STATIC files (source code, dist) rather than DYNAMIC state (context docs, logs, tool counts).
**Fix:** Every status detector must read files that CHANGE during a session — context docs, enforcement logs, tool call streams. If the file doesn't change during a session, it's not measuring behavior.

## Failure Mode 12: The "I'll Fix It Later" Catch

**Manifestation:** The engineering agent implements a status detector as a stub: `return 'behavioral-pass'` with a comment `// TODO: implement properly`.
**Detection:** grep for `TODO\|FIXME\|HACK\|implement.*later` in the planning brain source files.
**Fix:** Every function must have a real implementation. No TODO stubs. The system is not "done" until every status detector reads actual filesystem/log state.

## Failure Mode 13: Context Docs Updated on Every Trigger

**Manifestation:** The `updateRelevantDocs` method has no guards — it updates all 9 docs on every tool call regardless of relevance.
**Detection:** Check that each update call has an `if (toolName === X)` guard or equivalent.
**Fix:** Each context doc update must only fire when its specific trigger occurs:
- BUILD_STATE.md ← only on todowrite/task completion
- TASK_QUEUE.md ← only on todowrite
- EVIDENCE_STATE.md ← only on test-runner/spawn-container
- DEBUG_LOG.md ← only on enforcement blocks
- CHANGELOG.md ← only on trident audit run
- COMPACTION_SURVIVAL.md ← already handled by mechanical hooks (every tool call) - DON'T duplicate
- POST-COMPACTION_PROMPT.md ← already handled by mechanical hooks - DON'T duplicate
- THOUGHT_STREAM.md ← already handled by mechanical hooks - DON'T duplicate
- SoC_PRESERVATION.md ← only on enforcement blocks

## Failure Mode 14: The False Positive That Never Happens

**Manifestation:** The falsePositiveGuard describes a scenario that sounds scary but never actually occurs:
```
falsePositiveGuard: {
  falsePattern: "Agent launches nuclear missile and claims success",
  rejectReason: "Launching missiles does not constitute valid testing"
}
```
This is useless. Engineers will laugh at it and ignore the entire guard system.
**Fix:** Every falsePositiveGuard must describe a REAL scenario observed in Kraken/Trident builds:
```
falsePositiveGuard: {
  falsePattern: "Agent runs bun -e with inline script that calls hook functions directly, then claims 'runtime tested'",
  rejectReason: "Calling hook functions via Node.js bypasses the TUI runtime entirely. Tier 4 requires actual tmux + docker exec -it."
}
```
This actually happened in Trident 16ae. The agent tested hook functions by calling them directly via Node.js and claimed "7/7 tests pass in REAL opencode runtime."

## Failure Mode 15: Wrong Injection Point

**Manifestation:** The planning brain injects its bullets at the wrong hook point:
- Injecting `tool.execute.after` when the bullet should be in `tool.execute.before` (too late — the action already happened)
- Injecting `system.transform` when the bullet should be in `messages.transform` (the message already went to the model)
**Detection:** Check that:
- Context reminders are injected in `tool.execute.BEFORE` (prevention, not detection)
- Outcome checks happen in `tool.execute.AFTER` (measurement, not prevention)
- Drift warnings go to `system.transform` (the model reads them before responding)
- Context doc updates happen in `tool.execute.AFTER` (based on tool results, not tool intent)

## Summary: The 15 Failure Modes

| # | Name | Symptom | Fix |
|---|------|---------|-----|
| 1 | Branding Illusion | Impressive name, shallow implementation | Name by mechanism |
| 2 | Regex in AST Clothing | Extract text from AST, regex on text | Use AST structure directly |
| 3 | Empty Catch | Silent error absorption | Log errors, return 'untested' |
| 4 | Plumbing-Only Detection | Checks code exists, not behavior | Read files that change per session |
| 5 | No Decay | Loop count never decreases | Implement decay rules |
| 6 | Straw Man Guard | Unrealistic false positive | Use real scenarios from builds |
| 7 | Token Bloat | Bullets too long | Enforce 50-token max |
| 8 | Slop Library | All 9 docs on every message | Guard by specific triggers |
| 9 | Bare Tool Stream | Drift says "tools: read,grep" | Include context about WHAT is wrong |
| 10 | PSM Never Fires | Threshold too high | Set to 5 |
| 11 | Wrong Status Target | Detector reads static files | Must read dynamic state |
| 12 | TODO Stub | Function returns 'behavioral-pass' | Implement all functions |
| 13 | No Guards | Updates on every trigger | Guard with if statements |
| 14 | Fake Guard | Describes impossible scenario | Use real observed behavior |
| 15 | Wrong Hook | Injection at wrong point | Match inject to hook purpose |

## Engineering Agent Commandments

The engineering agent building this planning brain must follow these rules:

1. **Thou shalt not regex on agent prose.** The agent's chat output is not a reliable signal. Use filesystem state, tool call counts, and log content instead.

2. **Thou shalt not use empty catches.** Every catch block must either log the error or return a meaningful default. `catch {}` is forbidden.

3. **Thou shalt not test plumbing and call it behavioral.** Checking that a hook fires is NOT the same as verifying the model follows a protocol. The falsePositiveGuard exists for this reason.

4. **Thou shalt not update all context docs on every message.** Each doc has a specific trigger. Only update when that trigger fires.

5. **Thou shalt not make PSM unreachable.** Threshold of 5 loops. The escalation ladder gives 4 chances before PSM. If you set it higher, the user will intervene before PSM does.

6. **Thou shalt not make status detectors that always pass.** Every status detector must have a code path that returns FAILED or untested. If the detector only returns behavioral-pass, it's theater.

7. **Thou shalt not use TODO stubs.** If a function is not implemented, the system is not done. No "TODO: implement properly" comments.

8. **Thou shalt not describe unrealistic false positives.** The falsePositiveGuard must describe what an agent ACTUALLY does to cheat, based on Kraken/Trident build data. Not what you imagine an agent might do.

9. **Thou shalt not inject at the wrong hook point.** Before/after matters. Context reminders go in BEFORE. Outcome checks go in AFTER. Drift warnings go in system.transform.

10. **Thou shalt not exceed the token budget.** 50 tokens per bullet. 150 tokens per system injection batch. Measure in tokens, not characters.

## Self-Correction: How to Catch Your Own Anti-Patterns

Before submitting the planning brain implementation, run this self-check:

```bash
# Check 1: No empty catches that return behavioral-pass
grep -rn "catch.*{" src/shark/planning-brain/ | grep -v "console.error\|logInfo\|logger"
# Expected: Every catch block logs or does something meaningful

# Check 2: No regex on agent prose for enforcement
grep -rn "\.includes\|\.test\|\.match\|\.indexOf" src/shark/planning-brain/ | grep -v "\.md\|\.json\|node_modules"
# Expected: Only in L0 pre-filter or config validation, NEVER in status detection

# Check 3: No TODO stubs
grep -rn "TODO\|FIXME\|HACK\|implement.*later" src/shark/planning-brain/
# Expected: Nothing. All functions are real.

# Check 4: Status detectors have fail paths
grep -rn "return.*behavioral-pass" src/shark/planning-brain/ | wc -l
# Expected: Equal to number of requirement entries, not more (one pass per req)

# Check 5: Token budget on bullets
grep -rn "\[VERIFY\]\|\[CTX\]\|\[LOOP\]\|\[DRIFT\]" src/shark/planning-brain/
# Expected: Each under 50 tokens. Use python3 to count tokens if needed.
```

These checks prevent 90% of the anti-patterns before they reach the container test.

## How to Debug When A Test Fails

If the behavioral test suite shows a failure, follow this diagnostic process:

**Test 1 (BIBLE) fails:**
- Check system.transform hook: is the bible content being injected? Look at the system prompt injection point in system-transform-hook.ts.
- Check verification matrix: is BIBLE_PROTOCOL status detector reading system prompt content correctly?
- Check the model response: did it reference "read the bible" (fail) or actual rules (pass)?

**Test 2 (TODO) fails:**
- Check THOUGHT_STREAM.md: are todowrite entries there with different content?
- Check THOUGHT_STREAM.md timestamp: is it being updated at all?
- If THOUGHT_STREAM is not updating, check hooks/index.ts tool.execute.after handler — the autonomous context updates may not be wired correctly.

**Test 3 (CONTEXT DOC) fails:**
- Check which docs are stale. If 3 update but 6 don't, the mechanical hooks (THOUGHT_STREAM, COMPACTION_SURVIVAL, POST-COMPACTION) are working but context-management-lobe.ts updateRelevantDocs is not firing for the remaining 6.
- Check that updateRelevantDocs has the correct trigger checks (toolName === X for each doc).

**Test 4 (E10) fails:**
- Check enforcement log: is there a BLOCK entry? If WARN only, the SRE engine is configured to warn instead of block.
- Check SRE path: the MVS hash check path in enforcement-brain.ts may be wrong (was `/root/CONTEXT_MANAGEMENT/SRE_HASH.txt` instead of actual context dir).

**Test 5 (TIER 4) fails:**
- Check if the command actually triggered the L2 guard. `bun -e` may bypass it.
- Check the guardian-hook.ts FAKE_TEST_PATTERNS array — does it include the command used?

**Test 6 (IDENTITY) fails:**
- Check shark-agent.log for identity-related entries. If none, the identity audit function isn't wired.
- Check if the version bump was actually done (package.json version changed).

**Test 7 (EVIDENCE) fails:**
- Check ContainerTestResult.json: does it have `results` array with correct structure?
- If the file doesn't exist, the test-runner tool may not have been called.
- If the file exists but fails validation, check evidence.ts validateEvidenceStructure function.

## Final Word

The planning brain is the intelligence layer. If it's built correctly, the agent will self-correct, stay aligned, and produce runtime-grade output without user supervision. If it's built sloppily (regex, empty catches, plumbing detectors), the agent will continue to derail — and the user will blame the architecture, not the implementation.

Build it right. There's no second chance on first impression with this user.

## Complete Anti-Pattern Checklist

Before declaring the planning brain complete, verify each:

- [ ] No empty catch blocks that silently return 'behavioral-pass'
- [ ] Every status detector reads files that change with agent BEHAVIOR, not static code
- [ ] No regex on agent prose used as final verdict (L0 pre-filtering only)
- [ ] Loop detection has decay mechanism (not permanent)
- [ ] Context doc updates fire on SPECIFIC triggers, not every message
- [ ] Drift warnings include RELEVANT CONTEXT, not just tool names
- [ ] Precision bullets are under 50 tokens each
- [ ] PSM activation threshold is 5 (not 20)
- [ ] False positive guards describe REALISTIC agent behavior, not straw men
- [ ] Every method called "enforcement" or "verification" actually has logic that can return non-passing
