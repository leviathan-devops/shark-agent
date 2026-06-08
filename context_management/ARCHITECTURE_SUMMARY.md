# SHARK v4.9.8 — Architecture Summary

## 3-Lobe Enforcement Brain
Tool calls pass through two enforcement points:

BEFORE (tool.execute.before):
  Frontal Lobe (Karpathy 2.0):
    StreamingBuffer → VerbFrameLexicon → IntentClassifier → IntentFSM
    → BLOCK (StructuredBlockError thrown, tool cancelled)
    → WARN (output.system injection, agent sees warning)
    → PASS (tool executes normally)

AFTER (tool.execute.after):
  Right Hemisphere (RGE):
    TypeScript Compiler API semantic analysis
    11 P1-P12 rules + CFG analysis
    Write-time firewall: blocks CRITICAL violations
    
  Left Hemisphere (SRE):
    E10 detection (unverified runtime-grade claims)
    Mechanical verification against MVS spec
    
  → BLOCK (output rejected, evidence logged)
  → WARN (agent sees warning)
  → PASS (tool output accepted)

## T3 Knowledge Base Patterns Used
- Deterministic NLP Pipeline (§01 wink-nlp/peggy/verb-frame patterns)
- Proper State Machine (§02 xstate pattern with guards/actions/evidence)
- TS Compiler API Semantic Firewall (§06 17 analysis tools)
- Evidence Production (§04 digests, file writes, audit trails)
- P1-P10 Compliance on ALL functions
