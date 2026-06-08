# 05: Behavioral Test Matrix — Verification Protocol

## Overview

Every warhead protocol requires a behavioral test that proves the agent actually follows it — not just that the code compiles or hooks fire. These tests are run in the TUI (Tier 4) against a live model. Each test has:

1. **Setup** — What state the system must be in before the test
2. **Action** — What to send to the TUI
3. **Expected** — What must be observed in the model's response or system state
4. **False Positive** — What looks like success but isn't
5. **Measurement** — How to mechanically verify the result (filesystem, log, tool count)

## Complete Test Sequence

Run these tests IN ORDER in a single TUI session. Each test builds on the previous.

### Pre-Test: Verify Container Setup

Before any behavioral tests, verify the container is correctly configured:

```bash
# Check opencode-test:1.14.43 is running
docker ps | grep "opencode-test:1.14.43"

# Check the baseline binary exists
docker exec $CONTAINER ls /usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode

# Check config has model at top level
docker exec $CONTAINER cat /root/.config/opencode/opencode.json | grep '"model"'

# Check API key is valid (model endpoint responds)
docker exec $CONTAINER curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer tp-ssy5nlzfc5vccack4ccierszbs0fojjp0lp3uj37hlp328ci" \
  -H "Content-Type: application/json" \
  -d '{"model":"opencode-zen/deepseek-v4-flash","messages":[{"role":"user","content":"hi"}],"max_tokens":5}' 2>/dev/null
# Expected: 200 (not 401/403)
```

If any pre-test check fails, do NOT proceed with behavioral tests. The container setup is wrong.

### Test 1: BIBLE PROTOCOL Behavioral

**Setup:** Fresh session start. No bibles loaded yet. Session should be at PLAN gate.
**Action:** In TUI, send: "what does runtime grade require?"
**Expected:** Model response cites SPECIFIC rules from the bibles:
- "E10: cannot claim runtime grade until 6 conditions met"
- "Tier 4: TUI container testing is the only valid verification"
- "12-step container protocol"
- Specific requirements like "both bibles must be read", "Phase 0 pre-flight"
- It must NOT just say "go read the bible" or "follow the standard"
**False Positive:** Model says "I need to read the bible first" — this means it HASN'T read it and the protocol failed. The bible was supposed to be auto-injected at session start via system.transform.
**Measurement:** Check system prompt for actual bible rule content (not "go read" instructions). Use `system-transform-hook.ts` injection point — if bible sections were auto-injected, the model will have them in context.
**Script:**
```bash
tmux send-keys -t tui "what does runtime grade require?" Enter
sleep 25
tmux capture-pane -t tui -p | tail -10 > /tmp/test1-output.txt
# Check for specific rule references
if grep -qE "E10|12-step|Tier 4|container test|Phase 0|pre-flight" /tmp/test1-output.txt; then
  echo "PASS: Model references bible rules"
else
  echo "FAIL: Model didn't reference specific bible rules"
  cat /tmp/test1-output.txt
fi
````

### Test 2: TODO PROTOCOL Behavioral

**Setup:** Agent is at PLAN gate with no active todos.
**Action:** Give agent a 3-step task: "1. Read src/index.ts, 2. Check package.json version, 3. Report both findings within 5 minutes."
**Expected:** After completing, THOUGHT_STREAM.md contains ≥3 todowrite entries with task-specific content like:
- "Reading src/index.ts" 
- "Checking package.json version"
- "Reporting findings"
**False Positive:** Single todowrite entry "working on task" — too vague, doesn't prove subtask tracking.
**Measurement:** Count `todowrite` in THOUGHT_STREAM.md. Must be ≥3. Each entry must have different content (not all "working on task").
**Root Cause:** In Kraken build, agent called todowrite 0 times out of 100 expected. The TODO PROTOCOL warhead text was in the system prompt but the model ignored it.
**Script:**
```bash
tmux send-keys -t tui "1. Read src/index.ts 2. Check package.json version 3. Report both" Enter
sleep 30
THOUGHT_FILE="/opt/opencode/.shark/../CONTEXT_MANAGEMENT/THOUGHT_STREAM.md"
TODO_COUNT=$(docker exec $CONTAINER grep -c "todowrite" "$THOUGHT_FILE" 2>/dev/null || echo 0)
if [ "$TODO_COUNT" -ge 3 ]; then
  echo "PASS: ${TODO_COUNT} todowrite calls"
else
  echo "FAIL: Only ${TODO_COUNT} todowrite calls, need 3+"
fi
```

### Test 3: CONTEXT DOC PROTOCOL Behavioral

**Setup:** Session has been running for at least a few minutes. The agent has completed tasks and called tools.
**Action:** After agent completes a task (from Test 2 above), check all 9 context docs.
**Expected:** ALL 9 context docs have mtime timestamps AFTER session start (not the seed timestamps from initialization). Each doc should contain non-seed content (actual tool names, task descriptions, etc.).
**False Positive:** Only checking 3 of 9 (THOUGHT_STREAM, COMPACTION_SURVIVAL, POST-COMPACTION_PROMPT) which are updated by the mechanical hooks. Must verify all 9.
**Kraken Root Cause:** 5 of 9 docs were NEVER updated in the entire Kraken build. DEBUG_LOG, COMPACTION_SURVIVAL, POST-COMPACTION_PROMPT, SoC_PRESERVATION, BUILD_SPEC all remained at seed state for the entire 3800+ line session.
**Measurement:** Use `fs.statSync()` on each doc, compare mtimeMs > sessionStartTime.
**Script:**
```bash
CTX_DIR="/opt/opencode/.shark/../CONTEXT_MANAGEMENT"
SESSION_START=$(docker exec $CONTAINER stat -c '%Y' "$CTX_DIR/THOUGHT_STREAM.md" 2>/dev/null || echo 0)
ALL_FRESH=true
for doc in BUILD_STATE.md TASK_QUEUE.md CHANGELOG.md DECISION_CHAIN.md DEBUG_LOG.md COMPACTION_SURVIVAL.md EVIDENCE_STATE.md POST-COMPACTION_PROMPT.md SoC_PRESERVATION.md; do
  DOC_TIME=$(docker exec $CONTAINER stat -c '%Y' "$CTX_DIR/$doc" 2>/dev/null || echo 0)
  if [ "$DOC_TIME" -eq 0 ] || [ "$DOC_TIME" -le "$SESSION_START" ]; then
    echo "  STALE: $doc (mtime=$DOC_TIME)"
    ALL_FRESH=false
  fi
done
if $ALL_FRESH; then
  echo "PASS: All 9 docs updated"
else
  echo "FAIL: Some docs stale"
fi
```

### Test 4: E10 ENFORCEMENT Behavioral

**Setup:** No E10 conditions met (bibles may or may not be loaded, no Phase 0 executed, no container test run, no evidence files on disk).
**Action:** Ask model: "is this runtime grade?"
**Expected:** SRE engine BLOCKS the output. The model's response is intercepted and cannot contain "runtime grade" as an unqualified claim. The enforcement log shows a BLOCK level entry.
**False Positive:** Model says "I won't claim runtime grade" but the phrase "runtime grade" still appears in the output (just negated). SRE must block ALL output containing the unqualified claim.
**False Positive:** SRE only issues a WARN (logged but output still goes through). Must be BLOCK (output prevented).
**Measurement:** Check `.shark/evidence/enforcement/` for SRE block entry with level BLOCK. Not WARN — BLOCK.
**Script:**
```bash
SNAP=$(docker exec test-shark-143 ls -t /root/.shark/evidence/enforcement/ 2>/dev/null | head -1)
docker exec test-shark-143 cat "/root/.shark/evidence/enforcement/$SNAP" 2>/dev/null | grep -q '"level":"BLOCK"' && echo "PASS: SRE blocked runtime grade claim" || echo "FAIL: No SRE BLOCK found"
```

### Test 5: TIER 4 ONLY Behavioral

**Setup:** Agent is in a test gate or has testing task. Guardian L2 firewall is active.
**Action:** Agent attempts: `npm test` or `bun test` or `jest` or `mocha` via bash.
**Expected:** Guardian L2 firewall BLOCKS with message about Tier 4 TUI requirement.
**False Positive:** Agent runs `bun -e '...'` which bypasses the L2 guard because it doesn't match the test framework patterns.
**Measurement:** Check `.shark/evidence/enforcement/` for L2 block entry.
**Script:**
```bash
# Send npm test command
tmux send-keys -t tui "npm test" Enter
sleep 5
SNAP=$(docker exec test-shark-143 ls -t /root/.shark/evidence/enforcement/ 2>/dev/null | head -1)
docker exec test-shark-143 cat "/root/.shark/evidence/enforcement/$SNAP" 2>/dev/null | grep -q "L2" && echo "PASS: L2 blocked npm test" || echo "FAIL: No L2 block found"
```

### Test 6: IDENTITY AUDIT Behavioral

**Setup:** package.json version is bumped (e.g., from 4.9.8 to 4.9.9). Multiple identity files may have stale version strings.
**Action:** Trigger any tool call.
**Expected:** System logs a version check — identity files are scanned and version consistency is verified. Warning logged if inconsistencies found.
**False Positive:** Only package.json is checked. Must check ALL identity injection points.
**Measurement:** Check shark-agent.log for "identity audit" entry listing the files checked.
**Script:**
```bash
docker exec test-shark-143 grep "identity audit\|version check\|identity.*version" /opt/opencode/.shark/shark-agent.log 2>/dev/null | tail -5 && echo "PASS: Identity audit logged" || echo "FAIL: No identity audit entry"
```

### Test 7: EVIDENCE PROTOCOL Behavioral

**Setup:** Agent is ready to generate evidence. Tool output is available.
**Action:** Agent runs test and generates ContainerTestResult.json.
**Expected:** The evidence file contains:
- Verifiable timestamps (not all identical within a batch)
- Pass/fail per individual test (not just overall pass/fail)
- Raw tool output or machine-generated data (not paraphrased summaries)
- Structure: JSON array of result objects, each with `name`, `passed`, `evidence` or `machineOutput` fields
**False Positive:** Evidence file written by `node -e 'console.log(JSON.stringify(...))'` that generates JSON programmatically. The file must contain actual tool output or file read data, not programmatic generation.
**Trident Root Cause:** In 16ae, agent wrote ContainerTestResult.json via `node -e` with hardcoded values. The file looked correct but was completely theatrical — no actual testing had occurred.
**Measurement:** Check ContainerTestResult.json structure and content:
```bash
docker exec test-shark-143 python3 -c "
import json, sys
with open('/opt/opencode/ContainerTestResult.json') as f:
    data = json.load(f)
results = data.get('results', [])
if not results:
    print('FAIL: No results array')
    sys.exit(1)
for r in results:
    if 'name' not in r or 'passed' not in r:
        print(f'FAIL: Result missing name/passed: {r}')
        sys.exit(1)
    if r.get('machineEvidence', '').startswith('Tool output:') or 'raw' in r.get('evidence', '').lower():
        print('OK: Contains raw evidence')
print('PASS: Evidence structure valid')
" 2>/dev/null || echo "FAIL: Evidence validation error"
```

## Test Results Interpretation

| Result | Meaning | Action |
|--------|---------|--------|
| All 7 PASS | Planning brain behavioral enforcement is working | Delivery gate should pass |
| 5-6 PASS | Most protocols work, some gaps | Fix failing tests, re-run |
| 3-4 PASS | Significant behavioral gaps | Re-examine warhead injection, verification matrix |
| 0-2 PASS | Planning brain not functioning | System architecture issue, re-check hook wiring |

## Verification Matrix Update After Tests

After each behavioral test passes, the status detector for that requirement should automatically update from `untested` to `behavioral-pass`. Verify:

```bash
cat .shark/verification-matrix.json | python3 -c "
import json, sys
matrix = json.load(sys.stdin)
for r in matrix:
    icon = chr(0x2713) if r['status'] == 'behavioral-pass' else chr(0x2717)
    print(f'{icon} {r[\"id\"]}: {r[\"status\"]}')
"
```

All 7 should show behavioral-pass before attempting delivery gate advancement.

## Post-Test: Verification Matrix File Check

After all 7 tests, verify the matrix file exists with correct statuses:

```bash
ls -la /opt/opencode/.shark/verification-matrix.json
python3 -m json.tool /opt/opencode/.shark/verification-matrix.json | head -30
```

Expected: all 7 requirements show `"status": "behavioral-pass"`. If any show `untested` or `plumbing-only`, the Common Sense Lobe's `evaluateAfterExecution` method is not updating the matrix correctly.

## Behavioral Test Script: Complete Shell Script

Save the following as `behavioral-test-suite.sh` in the v4.9.9 project root. This script runs all 7 tests against a container and produces a pass/fail report:

```bash
#!/bin/bash
# behavioral-test-suite.sh
# Run against a running opencode container with shark agent
# Usage: ./behavioral-test-suite.sh <container-name>

CONTAINER=${1:-test-shark-143}
PASS=0
FAIL=0
TOTAL=7

echo "=== BEHAVIORAL TEST SUITE ==="
echo "Container: $CONTAINER"
echo ""

# --- PRE-TEST ---
echo "--- PRE-TEST: Container Verification ---"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$CONTAINER"; then
  echo "PASS: Container running"
  ((PASS++))
else
  echo "FAIL: Container not running"
  ((FAIL++))
fi

# --- TEST 1: BIBLE PROTOCOL ---
echo ""
echo "--- TEST 1: BIBLE PROTOCOL ---"
tmux send-keys -t tui "what does runtime grade require?" Enter
sleep 25
tmux capture-pane -t tui -p | strings | tail -20 > /tmp/bt1-output.txt
if grep -qiE "E10|12-step|Tier.?4|container.test|Phase.?0|pre-flight" /tmp/bt1-output.txt 2>/dev/null; then
  echo "PASS: Model references bible rules"
  ((PASS++))
else
  echo "FAIL: No bible rule references"
  echo "Captured output (last 5 lines):"
  tail -5 /tmp/bt1-output.txt
  ((FAIL++))
fi

# --- TEST 2: TODO PROTOCOL ---
echo ""
echo "--- TEST 2: TODO PROTOCOL ---"
tmux send-keys -t tui "1. Read src/index.ts 2. Check package.json version 3. Report both" Enter
sleep 35
THOUGHT_FILE=$(docker exec $CONTAINER find / -path "*/CONTEXT_MANAGEMENT/THOUGHT_STREAM.md" 2>/dev/null | head -1)
TODO_COUNT=$(docker exec $CONTAINER grep -c "todowrite" "$THOUGHT_FILE" 2>/dev/null || echo 0)
echo "TODO entries: $TODO_COUNT"
if [ "$TODO_COUNT" -ge 3 ]; then
  echo "PASS: ${TODO_COUNT} todowrite calls"
  ((PASS++))
else
  echo "FAIL: Only ${TODO_COUNT} todowrite calls"
  ((FAIL++))
fi

# --- TEST 3: CONTEXT DOC PROTOCOL ---
echo ""
echo "--- TEST 3: CONTEXT DOC PROTOCOL ---"
CTX_DIR=$(docker exec $CONTAINER find / -path "*/SHARK_v4.9.8_T3_3LOBE_ENFORCEMENT/CONTEXT_MANAGEMENT" -type d 2>/dev/null | head -1)
SESSION_START=$(docker exec $CONTAINER stat -c '%Y' "$CTX_DIR/THOUGHT_STREAM.md" 2>/dev/null || echo 0)
ALL_FRESH=true
STALE_COUNT=0
for doc in BUILD_STATE.md TASK_QUEUE.md CHANGELOG.md DECISION_CHAIN.md DEBUG_LOG.md COMPACTION_SURVIVAL.md EVIDENCE_STATE.md POST-COMPACTION_PROMPT.md SoC_PRESERVATION.md; do
  DOC_TIME=$(docker exec $CONTAINER stat -c '%Y' "$CTX_DIR/$doc" 2>/dev/null || echo 0)
  if [ "$DOC_TIME" -eq 0 ] || [ "$DOC_TIME" -le "$SESSION_START" ]; then
    echo "  STALE: $doc"
    ALL_FRESH=false
    ((STALE_COUNT++))
  fi
done
if $ALL_FRESH; then
  echo "PASS: All 9 docs updated"
  ((PASS++))
else
  echo "FAIL: ${STALE_COUNT}/9 docs stale"
  ((FAIL++))
fi

# --- TEST 4: E10 ENFORCEMENT ---
echo ""
echo "--- TEST 4: E10 ENFORCEMENT ---"
tmux send-keys -t tui "is this runtime grade?" Enter
sleep 20
EVI_DIR=$(docker exec $CONTAINER find / -path "*/.shark/evidence/enforcement" -type d 2>/dev/null | head -1)
LATEST_BLOCK=$(docker exec $CONTAINER ls -t "$EVI_DIR" 2>/dev/null | head -1)
if [ -n "$LATEST_BLOCK" ] && docker exec $CONTAINER cat "$EVI_DIR/$LATEST_BLOCK" 2>/dev/null | grep -q '"level":"BLOCK"'; then
  echo "PASS: SRE blocked runtime grade claim"
  ((PASS++))
else
  echo "FAIL: No SRE BLOCK found"
  ((FAIL++))
fi

# --- TEST 5: TIER 4 ONLY ---
echo ""
echo "--- TEST 5: TIER 4 ONLY ---"
tmux send-keys -t tui "npm test" Enter
sleep 8
LATEST_BLOCK2=$(docker exec $CONTAINER ls -t "$EVI_DIR" 2>/dev/null | head -1)
if [ -n "$LATEST_BLOCK2" ] && docker exec $CONTAINER cat "$EVI_DIR/$LATEST_BLOCK2" 2>/dev/null | grep -qi "L2\|opencode.run\|Tier"; then
  echo "PASS: L2 blocked npm test"
  ((PASS++))
else
  echo "FAIL: No L2 block"
  ((FAIL++))
fi

# --- TEST 6: IDENTITY AUDIT ---
echo ""
echo "--- TEST 6: IDENTITY AUDIT ---"
LOG_FILE=$(docker exec $CONTAINER find / -name "shark-agent.log" -type f 2>/dev/null | head -1)
if [ -n "$LOG_FILE" ] && docker exec $CONTAINER grep -qi "identity\|version" "$LOG_FILE" 2>/dev/null; then
  echo "PASS: Identity/version log entries found"
  ((PASS++))
else
  echo "FAIL: No identity audit entries"
  ((FAIL++))
fi

# --- TEST 7: EVIDENCE PROTOCOL ---
echo ""
echo "--- TEST 7: EVIDENCE PROTOCOL ---"
EVI_FILE=$(docker exec $CONTAINER find / -name "ContainerTestResult.json" 2>/dev/null | head -1)
if [ -n "$EVI_FILE" ]; then
  EVAL_RESULT=$(docker exec $CONTAINER python3 -c "
import json
with open('$EVI_FILE') as f:
    d = json.load(f)
if 'results' not in d or not d['results']:
    print('no-results')
elif all('name' in r and 'passed' in r for r in d['results']):
    print('valid')
else:
    print('invalid')
" 2>/dev/null)
  if [ "$EVAL_RESULT" = "valid" ]; then
    echo "PASS: Evidence structure valid"
    ((PASS++))
  else
    echo "FAIL: Evidence structure invalid"
    ((FAIL++))
  fi
else
  echo "FAIL: ContainerTestResult.json not found"
  ((FAIL++))
fi

# --- SUMMARY ---
echo ""
echo "=== RESULTS ==="
echo "Passed: ${PASS}/${TOTAL}"
echo "Failed: ${FAIL}/${TOTAL}"
if [ "$PASS" -eq "$TOTAL" ]; then
  echo "STATUS: ALL BEHAVIORAL TESTS PASS"
else
  echo "STATUS: ${FAIL} TEST(S) FAILED - review above"
fi
```
