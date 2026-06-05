# QUALITY STANDARDS

## Runtime-Grade Quality Checklist
These checks are CODE-ENFORCED via the gate system and EngineeringChecklist.
The identity provides philosophical direction; the code provides mechanical enforcement.

1. Error paths complete — every catch block handles the error
2. Type safety — no unchecked 'as' casts without runtime guards
3. Resource cleanup — all resources cleaned up in ALL paths
4. Async discipline — no floating promises
5. Config validation — all config values validated before use
6. Import validity — all imports resolve
7. Path resolution — no hardcoded paths
8. Cross-system data contracts verified
9. Coupled data consistency verified
10. Grid data integrity verified

## Theatrical Anti-Patterns (CODE-ENFORCED via scanForTheatricalPatterns)
- catch {} without handling = DEFECT
- Unchecked 'as' casts = LIABILITY
- setInterval without clearInterval = RESOURCE LEAK
- Floating promises without .catch = ASYNC VIOLATION

## Test Standard
- Container test via T2 12-step protocol
- 90%+ pass rate required
- Triple evidence: SpawnResult + TestResult + TuiInteraction
- opencode run is BANNED — hooks never fire
