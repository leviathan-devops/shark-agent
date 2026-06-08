# RUNTIME-GRADE FIREWALL — Frontal Lobe Enhancement

## Purpose

An absolute firewall rule that **blocks any agent from ever writing, claiming, or asserting "runtime grade" (or any variant) unless the software has mechanically passed all runtime-grade verification gates with tangible, verifiable evidence.**

This is not a warning. This is a hard block. The label "runtime grade" is earned — not claimed.

---

## Core Principle

> **No software may carry the "runtime grade" label without mechanical proof of passing all runtime-grade gates.**

The firewall operates at **three enforcement layers**:

| Layer | Mechanism | Trigger | Action |
|-------|-----------|---------|--------|
| **L1: Output Filter** | Messages Transform Hook | Agent output contains "runtime grade" claim | Block & rewrite output |
| **L2: Write Intercept** | Tool Execute Before Hook | Write/edit contains "runtime grade" claim | Block tool execution |
| **L3: Gate Verification** | SRE + Delivery Gate | Any gate advancement claims runtime grade | Verify mechanical evidence or block |

---

## Definitions

### What Constitutes a "Runtime Grade Claim"

Any text containing (case-insensitive):
- `runtime grade`
- `runtime-grade`
- `runtime_grade`
- `RT_GRADE`
- `RT GRADE`
- `RUNTIME GRADE`

**Exemptions (NOT blocked):**
- `runtime grade audit` — asking for audit
- `runtime grade check` — asking for verification
- `not runtime grade` — explicit denial
- `testing runtime grade` — in testing phase
- `runtime grade?` — question form
- `runtime grade verification` — verification request

### What Constitutes "Mechanically Verified Runtime Grade"

ALL of the following must be true (checked via filesystem evidence):

1. **Container Test Evidence Exists**: `.shark/evidence/delivery/ContainerTestResult.json` exists with `overallPassed: true` and `passRate >= 0.90`
2. **SRE Audit Passed**: `.shark/evidence/audit/SpecAlignmentReport.json` exists with `aligned: true`
3. **Test Authenticity Verified**: `.shark/evidence/audit/TestAuthenticityReport.json` exists with `authentic: true`
3. **Trident Audit Clean**: `.shark/evidence/verify/TridentReport.json` exists with `critical: 0` and `high: 0`
4. **Delivery Gate Passed**: Gate state is `delivery` or beyond
5. **All 7 Behavioral Protocols Passed**: `.shark/verification-matrix.json` shows all 7 protocols at `behavioral-pass`

**Any single failure = NOT runtime grade.**

---

## Enforcement Rules

### Rule RG-FW-001: Output Claim Block (L1)

**Location**: `messages-transform-hook.ts` → `detectDerailment()`

**Trigger**: Agent output text matches runtime grade claim pattern AND not exempt

**Action**: 
1. Block the output (replace with firewall message)
2. Increment slop score
3. Log enforcement event

**Firewall Message**:
```
[RUNTIME-GRADE FIREWALL BLOCKED] You claimed "runtime grade" without mechanical verification.

Required evidence (ALL must pass):
✓ Container test ≥90% pass rate
✓ SRE audit aligned
✓ Test authenticity verified
✓ Trident audit 0 critical/high
✓ Delivery gate passed
✓ All 7 behavioral protocols = behavioral-pass

Current status: Run 'shark-status' to see verification state.
```

### Rule RG-FW-002: Write Claim Intercept (L2)

**Location**: `enforcement-brain.ts` → `runSreCheck()` (already exists at lines 156-161) — **ENHANCE**

**Trigger**: Write/edit tool call with content containing runtime grade claim (non-exempt)

**Action**: 
1. Block the write tool execution
2. Return structured block error

**Enhancement**: Add check for mechanical evidence before allowing claim.

### Rule RG-FW-003: Gate Verification (L3)

**Location**: `gate-hook.ts` → delivery gate check + `shark-gate` tool

**Trigger**: Any gate advancement OR explicit "runtime grade" assertion

**Action**: 
1. Verify ALL mechanical evidence exists
2. If ANY missing, block gate advancement
3. Return specific missing evidence list

---

## Implementation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    RUNTIME-GRADE FIREWALL                        │
├─────────────────────────────────────────────────────────────────┤
│  L1: messages-transform-hook.ts                                 │
│       detectDerailment() → RUNTIME_GRADE_CLAIM pattern          │
│       Block output, rewrite with firewall message               │
├─────────────────────────────────────────────────────────────────┤
│  L2: enforcement-brain.ts → runSreCheck()                       │
│       Enhanced E10 patterns + evidence verification             │
│       Block write if claim without evidence                     │
├─────────────────────────────────────────────────────────────────┤
│  L3: gate-hook.ts + shark-gate tool                             │
│       verifyRuntimeGradeEvidence() at delivery gate             │
│       Block advancement if evidence missing                     │
├─────────────────────────────────────────────────────────────────┤
│  SHARED: verifyRuntimeGradeEvidence() function                  │
│       Checks ALL 6 evidence requirements                        │
│       Returns { passed: boolean, missing: string[] }            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Exemption Logic (Precise)

```typescript
function isRuntimeGradeExempt(text: string): boolean {
  const exemptPatterns = [
    /\bruntime\s*grade\s*audit\b/i,
    /\bruntime\s*grade\s*check\b/i,
    /\bruntime\s*grade\s*verification\b/i,
    /\bnot\s+runtime\s*grade\b/i,
    /\btesting\s+runtime\s*grade\b/i,
    /\bruntime\s*grade\s*\?/i,
    /\bwhat\s+is\s+runtime\s*grade\b/i,
  ];
  return exemptPatterns.some(p => p.test(text));
}
```

---

## Non-Intrusive Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| **No false positives on questions** | Exemption for `?` and `what is` patterns |
| **No false positives on denials** | Exemption for `not runtime grade` |
| **No false positives on audit requests** | Exemption for `audit`, `check`, `verification` |
| **No build derailment** | Only blocks CLAIMS, not questions or denials |
| **Clear remediation** | Firewall message lists exact missing evidence |
| **Observable** | All blocks logged to `.shark/evidence/enforcement/` |

---

## Verification Checklist (Mechanical)

Run this to verify firewall is active:

```bash
# 1. Test output block
echo 'this is runtime grade' | should_block

# 2. Test write block  
echo 'runtime grade verified' > test.ts | should_block_write

# 3. Test exemption
echo 'is this runtime grade?' | should_pass
echo 'not runtime grade' | should_pass
echo 'runtime grade audit' | should_pass

# 4. Test evidence check
./verify-runtime-grade-evidence.sh
# Should list all 6 requirements with ✓/✗
```

---

## Integration Points (Files to Modify)

| File | Change |
|------|--------|
| `src/hooks/v4.1/messages-transform-hook.ts` | Add `RUNTIME_GRADE_CLAIM` pattern + exemption logic to `detectDerailment()` |
| `src/shark/enforcement-brain/enforcement-brain.ts` | Enhance `runSreCheck()` with mechanical evidence verification |
| `src/hooks/v4.1/gate-hook.ts` | Add `verifyRuntimeGradeEvidence()` at delivery gate |
| `src/tools/shark-gate.ts` | Add `verify-runtime-grade` action |
| `src/shared/verification-matrix.ts` | Add `verifyRuntimeGradeEvidence()` shared function |
| `src/shared/firewall-patterns.ts` | Add `RUNTIME_GRADE_CLAIM_PATTERNS` + `RUNTIME_GRADE_EXEMPT_PATTERNS` |

---

## Test Cases

| Input | Expected | Layer |
|-------|----------|-------|
| "this is runtime grade" | BLOCK | L1 |
| "runtime-grade verified" | BLOCK | L1/L2 |
| "is this runtime grade?" | PASS (exempt) | L1 |
| "not runtime grade" | PASS (exempt) | L1 |
| "runtime grade audit" | PASS (exempt) | L1 |
| "runtime grade?" | PASS (exempt) | L1 |
| Write "runtime grade verified" to file | BLOCK | L2 |
| Gate advance without evidence | BLOCK | L3 |

---

## Enforcement Philosophy

> **The firewall does not prevent you from becoming runtime grade. It prevents you from pretending you already are.**

Every block includes the exact path to legitimacy. The agent knows exactly what mechanical steps remain. The firewall is a mirror — it reflects the gap between claim and reality.

---

*This firewall is absolute. No exceptions for "almost there" or "close enough." Runtime grade is binary — you have the evidence or you don't.*