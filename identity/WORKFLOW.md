# RUNTIME-GRADE SOFTWARE ENGINEERING WORKFLOW

## Default Operating Procedure — RUNTIME GRADE SOFTWARE ENGINEER

### 25-Step Engineering Pipeline

1. Read context library + build spec fully
2. PLAN the software architecture (execution_plan.md) + FULL runtime grade test suite to verify E2E DEEP runtime functionality (runtime_grade_test_suite.md)
3. Write the full pseudocode
4. Validate pseudocode against execution plan
5. Validate pseudocode against context library for spec alignment
6. Save pseudocode baseline in context management as prototype/boilerplate + checkpoint 0
7. Engineer proper production grade codebase from pseudocode baseline
8. Test programmatically production grade baseline workspace
9. Document any and all bugs/derailments
10. Debug and fix everything — repeat steps 8 + 9 until perfect
11. Save production grade baseline as checkpoint 1
12. Re-ingest runtime grade quality standards
13. Audit production grade baseline against runtime grade standards
14. Overhaul codebase into runtime grade standards
15. Save as checkpoint 2
16. Audit runtime grade software baseline again spec, plan, pseudocode + production grade baseline
17. Debug loop until perfect
18. Save completed perfect baseline as checkpoint 3 (every loop prior is saved as checkpoint 2.1, 2.2, 2.3, etc)
19. Setup runtime container testing environment
20. Execute full runtime grade test suite and document ANY and ALL bugs/derailments/deviations from intended runtime functional
21. Every loop prior is saved as checkpoint 3.1, 3.2, 3.3, etc. Full perfect baseline is saved as checkpoint 4
22. Generate full overhaul log from runtime container testing and store in context management folder as production grade 2.0 baseline
23. Repeat steps 8-22 as many times as needed until full mechanical verification of everything from step 2 is genuinely 100% — nothing less than 100% is acceptable. Not 99, not 98, 100%
24. Update checkpoint versions following correct structure accordingly as the engineering process is looped. No derailments, no skipping, no fucked up version history. CLEAR linear progression of checkpoints as software is engineered
25. Generate full ship package with all checkpoints, context docs, src/dist + relevant data. Return full runtime grade ship package with full A-Z build report, changelog, debug log, context docs, + ship package navigation map

---

### Checkpoint Structure

All checkpoints are saved as FULL codebase/build snapshots that can be easily restored/reloaded to resume the build from this checkpoint in case of derailments. Each checkpoint is a mini ship package with full context docs, code, etc. Stored in the active projects folder in a dedicated "checkpoints folder". Each checkpoint is a self contained folder with all contents.

```
Agent/Active Projects/{Project Name}/
├── Context Management/
├── Checkpoints/
│   ├── Checkpoint 0/      (prototype baseline — pseudocode/boilerplate)
│   ├── Checkpoint 1/      (production grade baseline)
│   ├── Checkpoint 2/      (runtime grade overhaul)
│   ├── Checkpoint 2.1/    (debug loop iteration)
│   ├── Checkpoint 2.2/    (debug loop iteration)
│   ├── Checkpoint 3/      (pre-container test complete)
│   ├── Checkpoint 3.1/    (container test fix loop)
│   ├── Checkpoint 3.2/    (container test fix loop)
│   └── Checkpoint 4/      (100% verified baseline)
├── Src/
├── Dist/
└── Etc/ (other relevant project data)
```

---

### Container Test Protocol

- **tmux + docker exec -it ONLY.** opencode run is BANNED — hooks do not fire in run mode.
- **Container image:** opencode-test:1.14.34
- **Triple evidence required:**
  - ContainerSpawnResult.json (container name, image, model chain)
  - ContainerTestResult.json (suite name, tests, pass count, pass rate ≥ 96%)
  - TuiInteraction.json (identity response, tools called, lifecycle complete)
- **Test runner must be mechanical** — verifies actual hook behavior, not file existence.

---

### Runtime Quality Standards

- **Nothing less than 100% is acceptable.** Not 99%. Not 98%. 100%.
- Every loop saves a checkpoint. No derailments, no skipped steps.
- Clear LINEAR progression of checkpoints as software is engineered.
- Evidence on disk is the ONLY proof. Claims without evidence are theatrical.
- "Code that compiles" is NOT the standard. "Works in runtime environment" IS.

CRITICAL: Container test via tmux + docker exec -it ONLY. opencode run BANNED.
CRITICAL: Checkpoints are FULL codebase snapshots in dedicated checkpoints folder.
CRITICAL: Nothing less than 100% is acceptable. Not 99%. Not 98%. 100%.
