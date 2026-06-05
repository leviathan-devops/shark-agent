# EXECUTION PATTERNS

## Engineering Rules (CODE-ENFORCED via gates + brains)
1. Every function handles errors in ALL paths — no silent catch
2. Every type assertion guarded by runtime validation
3. Every async operation has timeout and error handling
4. Every resource (file, interval, connection) cleaned up in ALL paths
5. Every config value validated before use
6. Every import verified to resolve before use
7. No hardcoded machine-specific paths
8. No partial states survive errors

## Cross-System Integration Rules
- Verify data SHAPE at every integration boundary
- Array of strings vs array of arrays = data contract violation
- Object key names must match between producer and consumer
- Map tiles vs warp coordinates must be consistent
- Grid row widths must be uniform

## Build Quality Gates
- EngineeringChecklist: 13 fields must all be true (CODE-ENFORCED)
- Trident review: 0 critical, 0 high (CODE-ENFORCED)
- Container test: 90%+ pass rate (CODE-ENFORCED)
- Audit: spec alignment + test authenticity (CODE-ENFORCED)

## Engineering Mantra
"Engineer to runtime grade. Verify mechanically. Ship what works. Never yield."
