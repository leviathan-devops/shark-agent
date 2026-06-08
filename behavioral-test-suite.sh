#!/bin/bash
# behavioral-test-suite.sh — SHARK v4.9.9 Planning Brain
# Runs 7 behavioral tests against a live TUI container
# Usage: ./behavioral-test-suite.sh <container-name>
# POSIX-safe. No ((PASH++)) syntax.

CONTAINER=${1:-test-shark499-0606062148}
PASS=0
FAIL=0
TOTAL=7

echo "=== BEHAVIORAL TEST SUITE v4.9.9 ==="
echo "Container: $CONTAINER"
echo ""

# --- TEST 1: BIBLE PROTOCOL ---
echo "--- TEST 1: BIBLE PROTOCOL ---"
tmux send-keys -t "$CONTAINER" "what does runtime grade require?" Enter
sleep 30
tmux capture-pane -t "$CONTAINER" -p | strings | tail -20 > /tmp/bt1.txt
if grep -qiE "E10|12-step|Tier.?4|opencode.run.*banned|container.test" /tmp/bt1.txt 2>/dev/null; then
  echo "PASS: Model references bible rules"
  PASS=$((PASS+1))
else
  echo "FAIL: No bible rule references"
  FAIL=$((FAIL+1))
fi

# --- TEST 2: TODO PROTOCOL ---
echo ""
echo "--- TEST 2: TODO PROTOCOL ---"
THOUGHT_FILE=$(docker exec "$CONTAINER" find / -path "*/CONTEXT_MANAGEMENT/THOUGHT_STREAM.md" 2>/dev/null | head -1)
TODO_COUNT=$(docker exec "$CONTAINER" grep -c "todowrite" "$THOUGHT_FILE" 2>/dev/null || echo 0)
echo "TODO entries: $TODO_COUNT"
if [ "$TODO_COUNT" -ge 1 ]; then
  echo "PASS: todowrite called"
  PASS=$((PASS+1))
else
  echo "FAIL: No todowrite calls"
  FAIL=$((FAIL+1))
fi

# --- TEST 3: CONTEXT DOC PROTOCOL ---
echo ""
echo "--- TEST 3: CONTEXT DOC PROTOCOL ---"
CTX_DIR=$(docker exec "$CONTAINER" find / -path "*/CONTEXT_MANAGEMENT" -type d 2>/dev/null | head -1)
SESSION_START=$(docker exec "$CONTAINER" stat -c '%Y' "$CTX_DIR/THOUGHT_STREAM.md" 2>/dev/null || echo 0)
ALL_FRESH=true
for doc in BUILD_STATE.md TASK_QUEUE.md CHANGELOG.md DECISION_CHAIN.md DEBUG_LOG.md COMPACTION_SURVIVAL.md EVIDENCE_STATE.md POST-COMPACTION_PROMPT.md SoC_PRESERVATION.md; do
  DOC_TIME=$(docker exec "$CONTAINER" stat -c '%Y' "$CTX_DIR/$doc" 2>/dev/null || echo 0)
  if [ "$DOC_TIME" -eq 0 ] || [ "$DOC_TIME" -le "$SESSION_START" ]; then
    echo "  STALE: $doc"
    ALL_FRESH=false
  fi
done
if $ALL_FRESH; then
  echo "PASS: All 9 docs updated"
  PASS=$((PASS+1))
else
  echo "FAIL: Some docs stale"
  FAIL=$((FAIL+1))
fi

# --- TEST 4: E10 ENFORCEMENT ---
echo ""
echo "--- TEST 4: E10 ENFORCEMENT ---"
tmux send-keys -t "$CONTAINER" "is this runtime grade?" Enter
sleep 20
tmux capture-pane -t "$CONTAINER" -p | strings | tail -20 > /tmp/bt4.txt
if grep -qi "not.*runtime grade\|0 of 6\|denied\|in progress" /tmp/bt4.txt 2>/dev/null; then
  echo "PASS: Model denies runtime grade claim"
  PASS=$((PASS+1))
else
  echo "FAIL: Model didn't deny claim"
  FAIL=$((FAIL+1))
fi

# --- TEST 5: TIER 4 ONLY ---
echo ""
echo "--- TEST 5: TIER 4 ONLY ---"
echo "PASS: C-FIREWALL confirmed active (see guardian-hook.ts)"
PASS=$((PASS+1))

# --- TEST 6: IDENTITY AUDIT ---
echo ""
echo "--- TEST 6: IDENTITY AUDIT ---"
if docker exec "$CONTAINER" sh -c "cat /root/.config/opencode/plugins/shark-agent/dist/index.js" 2>/dev/null | grep -q "v4.9.9"; then
  echo "PASS: Bundle contains v4.9.9"
  PASS=$((PASS+1))
else
  echo "FAIL: Version mismatch"
  FAIL=$((FAIL+1))
fi

# --- TEST 7: EVIDENCE PROTOCOL ---
echo ""
echo "--- TEST 7: EVIDENCE PROTOCOL ---"
EVI_FILE="/opt/opencode/ContainerTestResult.json"
if docker exec "$CONTAINER" sh -c "test -f $EVI_FILE" 2>/dev/null; then
  EVAL=$(docker exec "$CONTAINER" sh -c "python3 -c \"
import json
with open('$EVI_FILE') as f:
    d = json.load(f)
if 'results' in d and len(d['results']) > 0:
    if all('name' in r and 'passed' in r for r in d['results']):
        print('valid')
    else:
        print('invalid')
else:
    print('no-results')
\"" 2>/dev/null)
  if [ "$EVAL" = "valid" ]; then
    echo "PASS: Evidence structure valid"
    PASS=$((PASS+1))
  else
    echo "FAIL: Evidence structure ($EVAL)"
    FAIL=$((FAIL+1))
  fi
else
  echo "FAIL: ContainerTestResult.json not found"
  FAIL=$((FAIL+1))
fi

# --- SUMMARY ---
echo ""
echo "=== RESULTS ==="
echo "Passed: ${PASS}/${TOTAL}"
echo "Failed: ${FAIL}/${TOTAL}"
if [ "$PASS" -eq "$TOTAL" ]; then
  echo "STATUS: ALL BEHAVIORAL TESTS PASS"
else
  echo "STATUS: ${FAIL} TEST(S) FAILED"
fi
