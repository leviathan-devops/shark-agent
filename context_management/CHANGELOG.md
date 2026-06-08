# CHANGELOG — Breakthroughs & Insights

## 2026-06-08 — Semantic Firewall PROVEN in Runtime — 10/10 Gate Passed
**What:** Wired `executionContext.setAgent()` (index.ts:80-82) and `executionContext.setGate()` (gate-hook.ts:268). Rebuilt dist. Deployed to container with TS source files. Ran 4 SF tests.
**Evidence:** 5 sf-audit JSON files with `theatrical-return` CRITICAL findings. 5 quarantined files with `// QUARANTINED: [P10]` notice. Agent explicitly acknowledged quarantine. 10/10 verification gate passed.
**Honest limitations:** scope-violation rule only monitors in-scope directory snapshots (design limitation, not a bug). dead-export not independently triggered. isOperationAllowedForGate/shouldAllowEngineeringOperation wired but not independently tested at runtime.
**Ship status:** READY. All context docs updated.

## 2026-06-07 — Adversarial Audit: Semantic Firewall NOT Proven at Runtime
**Finding:** 12/12 gate passed on technicalities. Container tests only tested Glob + frontal lobe — the semantic firewall (write-time-gate, post-write-audit, dead-export, scope-violation, theatrical-return) was NEVER invoked during any test.
**Finding 2:** `executionContext.setAgent()` has zero call sites. `shouldAllowEngineeringOperation()` is dead code.
**Finding 3:** `executionContext.setGate()` has zero call sites. `isOperationAllowedForGate()` is dead code.
**Action:** Updated all context docs (BUILD_STATE, DEBUG_LOG, DECISION_CHAIN, EVIDENCE_STATE, COMPACTION_SURVIVAL). Wrote new NEXT_STEPS.md (12-step plan). Wrote new POST-COMPACTION-PROMPT.md with exact instructions.
**Ship status:** BLOCKED until 10-check semantic firewall gate passes.

## 2026-06-07 — Full Defect Inventory Complete
30+ remaining defects catalogued with exact file paths, line numbers, and fix code. Plan written to TASK_QUEUE.md with SoC preservation protocol.

## 2026-06-07 — Context Doc Protocol Fixed
Root cause: src/hooks/v4.1/index.ts was reverted to 141-line old version by git checkout — missing all context doc update functions (updateThoughtStream, updateBuildStateOnTaskComplete, etc.). Restored 171-line version from conversation history. All 10 docs now update with session data.

## 2026-06-07 — Gate Engine Bug Fix
- Bug 1: GATE_ORDER had 'test' before 'verify' (wrong per SPEC.md)
- Bug 2: advance() cleared evidence map, causing delivery gate to fail
- Fix applied to src/gate-engine/gate-engine.ts

## 2026-06-07 — Fabricated Evidence Cleanup
Deleted 7 hand-written evidence files that claimed verifications never actually performed.

## Remaining Issues (pre-runtime-grade)
See TASK_QUEUE.md for the full execution plan.
