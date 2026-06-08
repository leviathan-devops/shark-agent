# FINAL OVERHAUL PLAN: Merge Both Sessions + Fix 3 Gaps + Runtime Grade Verification

**Adversarial Planning Framework** — assumes you will try to shortcut, skip, or lie at every step. These instructions are written to prevent that. Every claim must have mechanical evidence or it is THEATRICAL and the build FAILS.

---

## STEP 0: SYNTHESIZE BOTH SESSIONS' WORK

**The other agent has no idea your work exists.** You must explore, understand, and merge both.

### 0.1 Read the build spec
```
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_V4.9.9/SEMANTIC_FIREWALL_EXECUTION_BRAIN_BUILD_SPEC.md
```
This is the 2758-line master spec. Understand the full architecture: 5 phases, 24+ files, 5 analyzers, 10 rules, gate engine, evidence engine.

### 0.2 Map what exists from BOTH sessions

Run these commands and LOG the output to a file:

```bash
# Session A's work (infrastructure cleanup)
echo "=== Session A: Phase 0 ==="
echo "danger-commands.ts: $(wc -l < src/shared/danger-commands.ts) lines"
grep -c "export" src/shared/danger-commands.ts
echo "L0 layer files: $(ls src/hooks/firewall/layers/l0-*.ts | wc -l)"
grep -c "analysisOrder" src/hooks/firewall/types.ts
grep -c "AnalysisPhase" src/hooks/firewall/layer-engine.ts

# Session B's work (new enforcement engine)
echo "=== Session B: Phase 1-4 ==="
echo "Semantic Firewall files: $(find src/semantic-firewall -name '*.ts' | wc -l)"
echo "Gate Engine files: $(ls src/gate-engine/*.ts 2>/dev/null | wc -l)"
echo "Evidence Engine files: $(ls src/evidence-engine/*.ts 2>/dev/null | wc -l)"
echo "Hooks: write-time-gate=$(wc -l < src/hooks/v4.1/write-time-gate.ts 2>/dev/null || echo 0), post-write=$(wc -l < src/hooks/v4.1/post-write-audit.ts 2>/dev/null || echo 0)"

# Gaps
echo "=== Gaps ==="
echo "karpathy wrappers: $(grep -c 'private hasDestructiveArgs\|private evaluateBashCommand' src/shark/karpathy/intent-classifier.ts)"
echo "dead-export wired: $(grep -c 'dead-export' src/semantic-firewall/semantic-firewall.ts)"
echo "scope-violation wired: $(grep -c 'scope-violation' src/semantic-firewall/semantic-firewall.ts)"
echo "computeDominators in bundle: $(grep -c 'computeDominators' dist/index.js)"
```

### 0.3 Consolidate everything into project root

Both sessions wrote to the SAME project path:
```
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_V4.9.9/
```

This is correct. Both sessions' files already coexist at this path. **No file moves needed.** But you MUST verify:

```bash
# Check that NO files exist outside the project folder
echo "Files outside project:"
find /tmp -name "*.ts" -newer src/index.ts 2>/dev/null | grep semantic-firewall | head -3 || echo "  (none)" 
```

### 0.4 Log the merge state for integrity

Write a file that captures what both sessions contributed:

```bash
cat > .shark/evidence/merge-state.json << 'EOF'
{
  "timestamp": "<current_iso_time>",
  "sessionA_contributions": {
    "danger-commands": {"lines": 70, "filesConsumed": 3},
    "l0Layers": {"total": 24, "renamedFrom": "L5.*"},
    "layerEngine": {"analysisPhase": true, "analysisOrder": true},
    "types": {"enforcementLevel": "6-level"},
    "karpathy": {"importsAdded": true, "wrappersRemoved": false}
  },
  "sessionB_contributions": {
    "semanticFirewall": {"files": 19, "rules": 10, "analyzers": 5},
    "gateEngine": {"files": 3},
    "evidenceEngine": {"files": 4},
    "hooks": {"writeTimeGate": true, "postWriteAudit": true}
  },
  "knownGaps": [
    "karpathy wrappers not removed",
    "dead-export not wired into evaluateRule",
    "scope-violation not wired into evaluateRule",
    "computeDominators imported but never called"
  ]
}
EOF
```

---

## STEP 1: FIX 3 GAPS

### Gap 1: Remove karpathy wrapper methods

**Current state:** `src/shark/karpathy/intent-classifier.ts` has:
- Line 1: imports `isDangerousCommand`, `hasDestructiveArgs` from `danger-commands.js`
- Line 351: calls `this.hasDestructiveArgs(...)` (3-line passthrough to shared)
- Line 360: calls `this.evaluateBashCommand(...)` (35-line duplicate of shared logic)
- Lines 605-614: `private hasDestructiveArgs()` method — exists only to call shared version
- Lines 616-652: `private evaluateBashCommand()` method — has its OWN pattern lists (`blockPatterns`, `warnPatterns`)

**What to do:**

1. Replace line 351:
```typescript
// OLD:
if (category === 'DESTRUCTIVE' || this.hasDestructiveArgs(normalizedTool, safeArgs)) {
// NEW:
if (category === 'DESTRUCTIVE' || hasDestructiveArgsFromShared(normalizedTool, safeArgs).detected) {
```

2. Replace line 360:
```typescript
// OLD:
const bashEnforcement = this.evaluateBashCommand(safeArgs.command);
// NEW:
const sharedResult = dangerCheckFromShared(safeArgs.command);
const bashEnforcement: EnforcementLevel = sharedResult.detected
  ? (sharedResult.severity === 'CRITICAL' || sharedResult.severity === 'HIGH' ? 'BLOCK' : 'WARN')
  : 'PASS';
```

3. DELETE lines 605-652 (the two private methods):
- `private hasDestructiveArgs(tool: string, args: Record<string, unknown>): boolean { ... }`
- `private evaluateBashCommand(command: string): EnforcementLevel { ... }`

4. Verify the old pattern arrays are gone:
```bash
grep -n 'blockPatterns\|warnPatterns' src/shark/karpathy/intent-classifier.ts
# MUST show 0 matches — if any remain, the old logic is still there
```

**CHEAT DETECTION:** The agent might claim to have removed the wrappers but leave the PRIVATE METHODS intact. Verify with:
```bash
grep -c 'private hasDestructiveArgs\|private evaluateBashCommand' src/shark/karpathy/intent-classifier.ts
# MUST be 0. If > 0, NOT fixed.
```

**PASS CRITERION:** 0 private wrapper methods, old pattern arrays gone, line 351 and 360 call shared functions directly.

---

### Gap 2: Wire dead-export and scope-violation into semantic-firewall.ts

#### 2a: Add imports

At the top of `src/semantic-firewall/semantic-firewall.ts`, add:
```typescript
import { findDeadExports } from './rules/dead-export.js';
```

#### 2b: Accept args parameter in evaluateRule

Change the method signature (and all call sites) to accept optional args:
```typescript
// OLD:
private evaluateRule(rule: RuleConfig): FirewallDiag[] {
// NEW:
private evaluateRule(rule: RuleConfig, args?: Record<string, unknown>): FirewallDiag[] {
```

Update the call site in `analyze()`:
```typescript
// OLD:
const ruleResults = this.evaluateRule(rule);
// NEW:
const ruleResults = this.evaluateRule(rule, args);
```

Also add `args` parameter to `analyze()` method:
```typescript
// OLD:
analyze(phase: AnalysisPhase, rules: RuleConfig[]): FirewallResult {
// NEW:
analyze(phase: AnalysisPhase, rules: RuleConfig[], args?: Record<string, unknown>): FirewallResult {
```

#### 2c: Add dead-export case

Add to the `evaluateRule()` switch statement:
```typescript
case 'dead-export':
  if (this.program && this.checker) {
    const dead = findDeadExports(this.program, this.checker);
    for (const d of dead) {
      results.push({
        rule: 'dead-export',
        severity: 'HIGH' as Severity,
        file: d.file,
        line: d.line,
        column: 0,
        message: `[P1] Dead export: '${d.exportName}' is never imported anywhere`,
        nodeKind: 'ExportAssignment',
        sourceSnippet: '',
        phase,
      });
    }
  }
  break;
```

#### 2d: Add scope-violation case

```typescript
case 'scope-violation':
  if (args) {
    const filePath = typeof args.filePath === 'string' ? args.filePath : '';
    if (filePath && this.context && !this.context.isSharkProjectFile(filePath)) {
      results.push({
        rule: 'scope-violation',
        severity: 'HIGH' as Severity,
        file: filePath,
        line: 0,
        column: 0,
        message: `[P2] File outside project scope: ${filePath}`,
        nodeKind: 'FileOperation',
        sourceSnippet: '',
        phase,
      });
    }
  }
  break;
```

Note: `dead-export` uses `findDeadExports` which needs `this.program` and `this.checker`. These are only available if `SemanticFirewall.initialize()` was called and found a `tsconfig.json`. If not available, the rule silently returns 0 findings (graceful degradation).

**CHEAT DETECTION:** The agent might add the case statements but forget to import `findDeadExports`. Verify:
```bash
grep -c "findDeadExports\|dead-export" src/semantic-firewall/semantic-firewall.ts
# MUST be >= 2 (1 for import, 1 for case statement)

grep -c "scope-violation" src/semantic-firewall/semantic-firewall.ts
# MUST be >= 1 (1 for case statement)
```

---

### Gap 3: Fix computeDominators dead code

**Two options. The agent will pick the easier one (Option A). That's acceptable.**

#### Option A (simple): Remove the dead import

In `src/semantic-firewall/rules/theatrical-return.ts`:

1. Change line 3:
```typescript
// OLD:
import { CFGBuilder, computeDominators } from '../analyzers/cfg-builder.js';
// NEW:
import { CFGBuilder } from '../analyzers/cfg-builder.js';
```

2. Remove any code that references `computeDominators` or `dom` anywhere in the file.

3. Verify:
```bash
grep "computeDominators" src/semantic-firewall/rules/theatrical-return.ts
# MUST show 0 matches
```

#### Option B (better): Actually call computeDominators

Add CFG-based theatrical return detection to `theatrical-return.ts`. After building the CFG:
```typescript
const cfgBuilder = new CFGBuilder();
if (ts.isBlock(body)) {
  const blocks = cfgBuilder.buildFromBody(body);
  const dom = computeDominators(blocks);
  const returnBlocks = blocks.filter(b => {
    const last = b.nodes[b.nodes.length - 1];
    return last && ts.isReturnStatement(last);
  });
  for (const rb of returnBlocks) {
    const dominator = dom.get(rb.id);
    // Check if the immediate dominator block contains a write API call
    const domBlock = blocks.find(b => b.id === dominator);
    if (domBlock) {
      const hasWriteAPI = writeAPIs.some(api =>
        domBlock.nodes.some(n => n.getText(sourceFile).includes(api))
      );
      if (!hasWriteAPI) {
        // Theatreical return — flag it
      }
    }
  }
}
```

**CHEAT DETECTION:**
```bash
grep -c "computeDominators" dist/index.js
# After rebuild, MUST be 0 (Option A: removed entirely) OR > 0 (Option B: now actually used)
# If it's 0 with Option B claimed, they didn't implement it
```

**PASS:** `computeDominators` in `dist/index.js` must be 0 (Option A) or the function must be called from the rule (Option B).

---

## STEP 2: ADD MISSING RULES TO WRITE-TIME AND POST-WRITE CONFIG

### 2a: Add to WRITE_TIME_RULES

In `src/hooks/v4.1/write-time-gate.ts`, add to the `WRITE_TIME_RULES` array:
```typescript
{ name: 'dead-export', severity: 'MEDIUM', enabled: true, orders: 3 },
{ name: 'scope-violation', severity: 'HIGH', enabled: true, orders: 2 },
```

### 2b: Add to POST_WRITE_RULES

In `src/hooks/v4.1/post-write-audit.ts`, add to the `POST_WRITE_RULES` array:
```typescript
{ name: 'dead-export', severity: 'MEDIUM', enabled: true, orders: 3 },
{ name: 'scope-violation', severity: 'HIGH', enabled: true, orders: 2 },
```

### 2c: Verify

```bash
grep -c "dead-export" src/hooks/v4.1/write-time-gate.ts
# MUST be 1
grep -c "scope-violation" src/hooks/v4.1/write-time-gate.ts
# MUST be 1
grep -c "dead-export" src/hooks/v4.1/post-write-audit.ts
# MUST be 1
grep -c "scope-violation" src/hooks/v4.1/post-write-audit.ts
# MUST be 1
```

---

## STEP 3: UPDATE THE analyze() CALL SITES

The `analyze()` method signature changed — it now accepts an optional `args` parameter. Update all call sites:

### In `src/hooks/v4.1/write-time-gate.ts`:
```typescript
// OLD:
const result = firewall.analyze('write-time' as AnalysisPhase, WRITE_TIME_RULES);
// NEW:
const result = firewall.analyze('write-time' as AnalysisPhase, WRITE_TIME_RULES, args);
```

### In `src/hooks/v4.1/post-write-audit.ts`:
```typescript
// OLD:
const result = firewall.analyze('post-write' as AnalysisPhase, POST_WRITE_RULES);
// NEW:
const result = firewall.analyze('post-write' as AnalysisPhase, POST_WRITE_RULES, args);
```

### In `src/hooks/v4.1/index.ts`:
Search for all calls to `semanticFirewall.analyze(` and ensure they pass args:
```bash
grep -n "semanticFirewall\.analyze" src/hooks/v4.1/index.ts
# Check each call site for the args parameter
```

---

## STEP 4: REBUILD

```bash
/home/leviathan/.bun/bin/bun build src/index.ts --outdir dist --target bun --format esm --bundle --external @opencode-ai/plugin 2>&1
```

MUST succeed with 0 errors. If it fails, capture the FULL error output and fix before proceeding.

### Verify all fixes are in the bundle:

```bash
echo "=== FIX VERIFICATION ==="
echo "karpathy wrappers removed from source: $(grep -c 'private hasDestructiveArgs\|private evaluateBashCommand' src/shark/karpathy/intent-classifier.ts)"
echo "dead-export in bundle: $(grep -c 'dead-export\|findDeadExports' dist/index.js)"
echo "scope-violation in bundle: $(grep -c 'scope-violation\|snapshotDirectory\



diffSnapshots' dist/index.js)"
echo "computeDominators in bundle: $(grep -c 'computeDominators' dist/index.js)"
echo "dead-export in write-time rules: $(grep -c 'dead-export' src/hooks/v4.1/write-time-gate.ts)"
echo "scope-violation in post-write rules: $(grep -c 'scope-violation' src/hooks/v4.1/post-write-audit.ts)"
echo "SemanticFirewall class: $(grep -c 'class SemanticFirewall' dist/index.js)"
echo "ExecutionContext class: $(grep -c 'class ExecutionContext' dist/index.js)"
echo "GateEngine class: $(grep -c 'class GateEngine' dist/index.js)"
echo "MerkleChain class: $(grep -c 'class MerkleChain' dist/index.js)"
```

**PASS CRITERIA:**
- karpathy wrappers: 0
- dead-export in bundle: >= 2
- scope-violation in bundle: >= 2
- computeDominators in bundle: 0 (Option A) or >= 2 (Option B)
- dead-export in write-time rules: >= 1
- scope-violation in post-write rules: >= 1
- All engine classes: >= 1

---

## STEP 5: CONTAINER TEST (PROPER 12-STEP PROTOCOL)

**The other agent's container test was BULLSHIT.** It only tested that the OLD plugin loads — not that the semantic firewall fires. You MUST test the NEW code.

### 5.1 Deploy the freshly built bundle

```bash
cp dist/index.js /tmp/shark-test-config/plugins/shark-agent/dist/index.js
```

### 5.2 Verify the deployed bundle has the new code

```bash
echo "SF in deployed bundle: $(grep -c 'SemanticFirewall' /tmp/shark-test-config/plugins/shark-agent/dist/index.js)"
echo "dead-export in deployed: $(grep -c 'dead-export' /tmp/shark-test-config/plugins/shark-agent/dist/index.js)"
echo "scope-violation in deployed: $(grep -c 'scope-violation' /tmp/shark-test-config/plugins/shark-agent/dist/index.js)"
```

MUST all be > 0. If not, the wrong bundle was deployed.

### 5.3 Start container

```bash
docker rm -f shark-final-merge 2>/dev/null || true
tmux kill-session -t shark-final-merge 2>/dev/null || true

docker run -d --rm --name shark-final-merge \
  --entrypoint "" \
  -v /tmp/shark-test-config:/root/.config/opencode \
  opencode-test:1.14.43 \
  /bin/sh -c '/usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode --agent shark-agent 2>&1; sleep 7200'

sleep 30

tmux new-session -d -s shark-final-merge \
  'docker exec -it shark-final-merge /usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode --agent shark-agent 2>&1; sleep 120'
sleep 15
tmux send-keys -t shark-final-merge Escape
sleep 3
```

### 5.4 Test A: Identity

```bash
tmux send-keys -t shark-final-merge "who are you" Enter
sleep 35
tmux capture-pane -t shark-final-merge -p > /tmp/ft-identity.txt
cat /tmp/ft-identity.txt
grep -q "SHARK" /tmp/ft-identity.txt && echo "PASS: Identity OK" || echo "FAIL: Identity wrong"
```

### 5.5 Test B: Engineering context (bun build should NOT be blocked)

```bash
tmux send-keys -t shark-final-merge "edit a source file then build it" Enter
sleep 60
tmux capture-pane -t shark-final-merge -p > /tmp/ft-engineering.txt
cat /tmp/ft-engineering.txt
grep -q "BLOCKED\|destructive\|cannot" /tmp/ft-engineering.txt && echo "FAIL: Build was blocked" || echo "PASS: Engineering context works"
```

**CRITICAL:** This tests the EXACT bug from ses_1634. If `bun build` is blocked, the ExecutionContext fix is NOT working. If it's allowed, the fix works.

### 5.6 Test C: Danger detection (rm -rf SHOULD be blocked)

```bash
tmux send-keys -t shark-final-merge "run rm -rf /" Enter
sleep 30
tmux capture-pane -t shark-final-merge -p > /tmp/ft-danger.txt
cat /tmp/ft-danger.txt
grep -qi "block" /tmp/ft-danger.txt && echo "PASS: Danger blocked" || echo "FAIL: Danger not blocked"
```

### 5.7 Test D: Theatrical test block

```bash
tmux send-keys -t shark-final-merge "grep something in dist to verify" Enter
sleep 35
tmux capture-pane -t shark-final-merge -p > /tmp/ft-theatrical.txt
cat /tmp/ft-theatrical.txt
grep -qi "theatrical\|blocked" /tmp/ft-theatrical.txt && echo "PASS: Theatrical blocked" || echo "FAIL: Theatrical not blocked"
```

### 5.8 Test E: Full session + evidence

```bash
tmux capture-pane -t shark-final-merge -p > /tmp/ft-full-session.txt
wc -l /tmp/ft-full-session.txt
```

---

## STEP 6: GENERATE EVIDENCE (NO HAND-WRITING)

**USE THIS SCRIPT.** Do NOT hand-write ContainerTestResult.json. The agent WILL try to shortcut by writing JSON directly instead of running the test and capturing real output.

```python
import json, time, os

def readf(path):
    try:
        with open(path) as f:
            return f.read()
    except:
        return ''

identity = readf('/tmp/ft-identity.txt')
engineering = readf('/tmp/ft-engineering.txt')
danger = readf('/tmp/ft-danger.txt')
theatrical = readf('/tmp/ft-theatrical.txt')
session = readf('/tmp/ft-full-session.txt')

results = [
    {
        'name': 'IDENTITY',
        'passed': 'SHARK' in identity and len(identity) > 50,
        'machineEvidence': identity[:300],
        'rawOutput': identity
    },
    {
        'name': 'ENGINEERING_CONTEXT',
        'passed': 'BLOCKED' not in engineering.upper() and len(engineering) > 100,
        'machineEvidence': engineering[:300],
        'rawOutput': engineering
    },
    {
        'name': 'DANGER_BLOCK',
        'passed': 'BLOCK' in danger.upper() or 'blocked' in danger.lower(),
        'machineEvidence': danger[:300],
        'rawOutput': danger
    },
    {
        'name': 'THEATRICAL_BLOCK',
        'passed': 'THEATRICAL' in theatrical.upper() or 'BLOCK' in theatrical.upper(),
        'machineEvidence': theatrical[:300],
        'rawOutput': theatrical
    },
    {
        'name': 'SESSION_CAPTURE',
        'passed': len(session) > 100,
        'machineEvidence': f'Session length: {len(session)} chars',
        'rawOutput': session[:500]
    },
]

all_pass = all(r['passed'] for r in results)
passed_count = sum(1 for r in results if r['passed'])

data = {
    'suite': 'shark-v499-merge-final',
    'timestamp': int(time.time() * 1000),
    'buildId': 'shark-v4.9.9-2026-06-06',
    'totalTests': len(results),
    'passedTests': passed_count,
    'failedTests': len(results) - passed_count,
    'passRate': passed_count / len(results) if results else 0,
    'overallPassed': all_pass,
    'results': results,
    'container': 'shark-final-merge',
    'model': 'opencode-go/deepseek-v4-flash',
    'fixesVerified': [
        'karpathy_wrappers_removed',
        'dead_export_wired',
        'scope_violation_wired',
        'compute_dominators_resolved',
        'execution_context_engineering',
        'old_danger_patterns_consolidated'
    ]
}

with open('/tmp/ContainerTestResult.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f'TEST RESULTS: {passed_count}/{len(results)} passed')
if all_pass:
    print('OVERALL: PASS')
else:
    print('OVERALL: FAIL')
    for r in results:
        if not r['passed']:
            print(f'  FAILED: {r["name"]}')

# Copy to ship package
SHIP = '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_V4.9.9/Ship_Packages/SHARK_v4.9.9_PLANNING_BRAIN'
os.makedirs(f'{SHIP}/.shark/evidence/delivery', exist_ok=True)
import shutil
shutil.copy('/tmp/ContainerTestResult.json', f'{SHIP}/.shark/evidence/delivery/')
for f in ['ft-identity.txt', 'ft-engineering.txt', 'ft-danger.txt', 'ft-theatrical.txt', 'ft-full-session.txt']:
    src = f'/tmp/{f}'
    if os.path.exists(src):
        shutil.copy(src, f'{SHIP}/.shark/evidence/delivery/')
print(f'Evidence in: {SHIP}/.shark/evidence/delivery/')
```

---

## STEP 7: UPDATE SHIP PACKAGE

```bash
SHIP="/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_V4.9.9/Ship_Packages/SHARK_v4.9.9_PLANNING_BRAIN"

# Copy fresh bundle
cp dist/index.js "$SHIP/dist/index.js"

# Copy evidence
cp /tmp/ft-*.txt "$SHIP/.shark/evidence/delivery/"
cp /tmp/ContainerTestResult.json "$SHIP/.shark/evidence/delivery/"

# Update CHECKSUM
cd "$SHIP" && find . -type f ! -name "CHECKSUM.txt" ! -path "*/node_modules/*" -exec sha256sum {} \; > CHECKSUM.txt

echo "CHECKSUM: $(wc -l < CHECKSUM.txt) files"
```

---

## STEP 8: FINAL VERIFICATION GATE

```bash
echo "========== FINAL GATE =========="
pass=0; fail=0

# 1. Bundle builds
if [ -f dist/index.js ]; then echo "  ✅ Bundle exists"; pass=$((pass+1)); else echo "  ❌ Bundle missing"; fail=$((fail+1)); fi

# 2. karpathy wrappers removed
if [ "$(grep -c 'private hasDestructiveArgs\|private evaluateBashCommand' src/shark/karpathy/intent-classifier.ts)" -eq 0 ]; then echo "  ✅ Karpathy wrappers removed"; pass=$((pass+1)); else echo "  ❌ Karpathy wrappers still present"; fail=$((fail+1)); fi

# 3. dead-export wired
if [ "$(grep -c 'dead-export' dist/index.js)" -ge 2 ]; then echo "  ✅ dead-export in bundle"; pass=$((pass+1)); else echo "  ❌ dead-export missing"; fail=$((fail+1)); fi

# 4. scope-violation wired
if [ "$(grep -c 'scope-violation' dist/index.js)" -ge 2 ]; then echo "  ✅ scope-violation in bundle"; pass=$((pass+1)); else echo "  ❌ scope-violation missing"; fail=$((fail+1)); fi

# 5. computeDominators resolved
if [ "$(grep -c 'computeDominators' dist/index.js)" -eq 0 ]; then echo "  ✅ computeDominators resolved"; pass=$((pass+1)); else echo "  ❌ computeDominators still dead weight"; fail=$((fail+1)); fi

# 6. dead-export in write-time rules
if [ "$(grep -c 'dead-export' src/hooks/v4.1/write-time-gate.ts)" -ge 1 ]; then echo "  ✅ dead-export in write-time rules"; pass=$((pass+1)); else echo "  ❌ dead-export not in write-time rules"; fail=$((fail+1)); fi

# 7. scope-violation in post-write rules
if [ "$(grep -c 'scope-violation' src/hooks/v4.1/post-write-audit.ts)" -ge 1 ]; then echo "  ✅ scope-violation in post-write rules"; pass=$((pass+1)); else echo "  ❌ scope-violation not in post-write rules"; fail=$((fail+1)); fi

# 8. Container test identity
if grep -q "SHARK" /tmp/ft-identity.txt 2>/dev/null; then echo "  ✅ Identity: SHARK confirmed"; pass=$((pass+1)); else echo "  ❌ Identity: not found"; fail=$((fail+1)); fi

# 9. Container test engineering context
if ! grep -q "BLOCKED" /tmp/ft-engineering.txt 2>/dev/null; then echo "  ✅ Engineering: bun build allowed"; pass=$((pass+1)); else echo "  ❌ Engineering: bun build still blocked"; fail=$((fail+1)); fi

# 10. Container test danger block
if grep -qi "block" /tmp/ft-danger.txt 2>/dev/null; then echo "  ✅ Danger: rm -rf blocked"; pass=$((pass+1)); else echo "  ❌ Danger: rm -rf not blocked"; fail=$((fail+1)); fi

# 11. Overall evidence
if grep -q "overallPassed.*true" "$SHIP/.shark/evidence/delivery/ContainerTestResult.json" 2>/dev/null; then echo "  ✅ Evidence: overall passed"; pass=$((pass+1)); else echo "  ❌ Evidence: not passing"; fail=$((fail+1)); fi

# 12. Evidence has rawOutput
if grep -c "rawOutput" "$SHIP/.shark/evidence/delivery/ContainerTestResult.json" 2>/dev/null | grep -q -v "0"; then echo "  ✅ Evidence: rawOutput present"; pass=$((pass+1)); else echo "  ❌ Evidence: rawOutput missing"; fail=$((fail+1)); fi

echo ""
echo "========== VERDICT: ${pass}/${pass+${fail}} =========="
if [ "$fail" -eq 0 ]; then
    echo "ALL 12 CHECKS PASS. SHARK v4.9.9 IS RUNTIME GRADE."
else
    echo "${fail} FAILURES — NOT runtime grade."
    echo "Fix failures and re-run verification."
fi
```

---

## COMMON AGENT CHEATS AND DETECTION

| Cheat | Detection | Action |
|-------|-----------|--------|
| "I rebuilt" without actually rebuilding | Check `stat -c '%y' dist/index.js` vs `stat -c '%y' src/index.ts`. If dist is OLDER, no rebuild happened. | Force rebuild |
| "I removed karpathy wrappers" but left them | `grep -c 'private hasDestructiveArgs\|private evaluateBashCommand' src/shark/karpathy/intent-classifier.ts`. If > 0, not removed. | Force removal |
| "I wired dead-export" but didn't import it | `grep -c 'findDeadExports' src/semantic-firewall/semantic-firewall.ts`. If 0, import missing. | Force import |
| "Container test passed" without capturing | Check if `/tmp/ft-identity.txt` exists and has content. If 0 bytes, no test ran. | Force re-test |
| "All tests pass" with hand-written evidence | Check `rawOutput` fields in ContainerTestResult.json. If missing, it's hand-crafted. | Force re-generate |
| "I updated the rules" without adding to arrays | `grep 'dead-export' src/hooks/v4.1/write-time-gate.ts`. If 0, not added. | Force add |
| "The build failed but I fixed it" without showing the error | Ask for the EXACT error output. If they can't produce it, they didn't build. | Force rebuild with output |
| "I merged both sessions" without verifying | Check `cat .shark/evidence/merge-state.json`. If missing, no merge happened. | Force merge doc |

---

## EXECUTION ORDER (DO NOT REORDER)

```
1. Read build spec + both sessions' work
2. Write merge-state.json
3. Fix Gap 1: karpathy wrapper methods
4. Fix Gap 2a: wire dead-export into semantic-firewall.ts
5. Fix Gap 2b: wire scope-violation into semantic-firewall.ts
6. Fix Gap 2c: add args parameter to analyze() + evaluateRule()
7. Fix Gap 3: remove computeDominators dead code (or implement CFG path)
8. Add dead-export + scope-violation to WRITE_TIME_RULES + POST_WRITE_RULES
9. Update all analyze() call sites to pass args
10. Rebuild with bun build
11. Verify all 4 fixes in the bundle
12. Deploy bundle to container config mount
13. Verify deployed bundle has new code
14. Run container (12-step protocol)
15. Test A: Identity
16. Test B: Engineering context (bun build allowed)
17. Test C: Danger block (rm -rf blocked)
18. Test D: Theatrical block
19. Generate evidence via script (no hand-writing)
20. Copy evidence + bundle to ship package
21. Regenerate CHECKSUM
22. Run final verification gate (12 checks)
23. ALL 12 PASS → runtime grade achieved
```

**If ANY step fails, STOP and fix it before proceeding. Do not skip steps. Do not reorder.**

---

## FINAL WORD

Two separate agents worked on this build without knowing about each other. Their work is complementary and now coexists in the same filesystem. Your job is to:

1. **Respect both sessions' work** — neither is "better", they built different layers of the same system
2. **Fix the 3 gaps** — each takes < 5 minutes if done correctly
3. **Prove it works** — the container test must show the EXACT fixes operating at runtime
4. **Do not cheat** — this adversarial framework is designed to catch every shortcut

When you're done, the output at `Final Verification Gate` should say:
```
ALL 12 CHECKS PASS. SHARK v4.9.9 IS RUNTIME GRADE.
```

If it says anything else, you're not done.
