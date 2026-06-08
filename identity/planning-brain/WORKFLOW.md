# T2 PLANNING BRAIN WORKFLOW

## Purpose
The Planning Brain is the intelligence layer for Shark v4.9.9. It parallels the Execution Brain (which polices TOOL CALLS) by policing THOUGHT STREAMS — ensuring the agent thinks correctly, doesn't drift, doesn't take shortcuts, doesn't lie about verification, and self-corrects before needing user intervention.

## Three Lobes

### Lobe 1: Common Sense Lobe (Verification Matrix)
- **File:** `src/shark/planning-brain/common-sense-lobe.ts`
- **Wiring:** `tool.execute.before` + `tool.execute.after` + gate transitions
- **Purpose:** Prevents the agent from testing plumbing and claiming behavioral victory. Maps every action to a behavioral requirement. Checks claim vs reality after execution.
- **Bible Principle:** Order 5 — Claim vs Reality Verification

### Lobe 2: Context Management Lobe (Context Integration)
- **File:** `src/shark/planning-brain/context-management-lobe.ts`
- **Wiring:** `messages.transform` + `tool.execute.before` + `tool.execute.after` + `compacting`
- **Purpose:** The "subconscious" — always running, always updating 9 context docs WHEN RELEVANT, detects drift by comparing tool trajectory against task queue, injects precision context bullets at the right moment.
- **Bible Principle:** Order 2-3 — Structural + Type-level awareness of conversation

### Lobe 3: Frontal Lobe (Problem Solving / PSM)
- **Already exists as Trident Problem Solving Mode**
- **Wiring:** `tool.execute.before` — activates after 5 loop attempts
- **Purpose:** Structured reasoning framework when the agent is stuck. 6-layer pipeline: Assumption → Action → Observation → Gap Analysis → Meta-Reflection → Verification

## Loop Escalation Ladder
- Loops 1-2: Context Management injects precision context bullet (soft)
- Loops 3-4: Common Sense fires evaluateBeforeExecution (stronger signal)
- Loop 5+: Frontal Lobe (PSM) activated, tool.execute.before BLOCKS hard

## Verification Matrix Update Protocol
1. Matrix loaded from `.shark/verification-matrix.json` at session start
2. Default matrix contains all 7 protocol requirements (BIBLE, TODO, CONTEXT_DOC, E10, TIER_4, IDENTITY, EVIDENCE)
3. Status detectors run on tool.execute.after for relevant tools
4. Status never downgrades from 'behavioral-pass'
5. Delivery gate blocks if any requirement not 'behavioral-pass'

## Safety Switch
The entire planning brain is disabled by default via `process.env.SHARK_PLANNING_BRAIN !== 'enabled'`. All methods return null/no-op. This prevents a buggy planning brain from breaking the running agent on first load.

## Token Budget
- Precision bullets: max 50 tokens each
- Warm context injection: max 100 tokens
- Drift warning: max 80 tokens
- System injection batch: max 150 tokens total

## Reference
See `context_management/planning-brain-library/` for full layer 3 build specification.
