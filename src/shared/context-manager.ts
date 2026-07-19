/**
 * src/shared/context-manager.ts
 *
 * STREAM OF CONSCIOUSNESS PRESERVATION — 10-doc canon.
 *
 * The Context Manager is the anti-dementia pill for compaction.
 * It preserves WHAT the agent was thinking, WHY, and WHAT'S NEXT.
 * It is NOT for code quality logging (RGE/SRE are separate).
 *
 * Each doc tracks a DIFFERENT facet of agent reasoning:
 *   1. BUILD_STATE.md          — Task completions with goal/reasoning
 *   2. TASK_QUEUE.md           — Active focus, next steps, blockers
 *   3. CHANGELOG.md            — Insights, breakthroughs, architectural decisions
 *   4. DECISION_CHAIN.md       — WHY decisions were made, full reasoning
 *   5. DEBUG_LOG.md            — What went wrong, root cause, lesson learned
 *   6. COMPACTION_SURVIVAL.md  — Where am I RIGHT NOW? gate/task/thought
 *   7. EVIDENCE_STATE.md       — What have I proven? confidence level
 *   8. POST-COMPACTION_PROMPT.md — Exact resumption instructions + reasoning chain
 *   9. SoC_PRESERVATION.md     — Patterns discovered with full context
 *  10. THOUGHT_STREAM.md       — Raw stream of consciousness per tool call
 *
 * Trigger Points:
 *   1. Completed subagent task (write/edit/diagnostic tool execution)
 *   2. Completed to-do task at orchestrator level
 *   3. Container test start + finish
 *   4. Major milestones/breakthroughs during build
 *   5. Every 15% of context tokens consumed (pseudocode — agent will implement)
 *   6. EVERY tool call (THOUGHT_STREAM.md — append)
 *
 * Paths:
 *   Host: {workspace}/SHARK_v5.1.0_PLANNING_BRAIN/CONTEXT_MANAGEMENT/
 *   Container: /workspace/shark/SHARK_v5.1.0_PLANNING_BRAIN/CONTEXT_MANAGEMENT/
 *
 * All 10 docs seeded on initialization. Each has DISTINCT content (no copy-paste).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_TOKEN = 'SHARK_v5.1.0_PLANNING_BRAIN';
let CONTEXT_DIR: string;

/**
 * Canonical context dir resolver. Both getContextDir() and initializeContextManager()
 * use EXACTLY the same path logic. No divergence between "where the docs are seeded"
 * and "where the docs are updated."
 * 
 * Priority order (v5.0 fixed — workspaceBase BEFORE hardcoded fallback):
 *   1. SHARK_CONTEXT_DIR env var (explicit override)
 *   2. SHARK_WORKSPACE env var + PROJECT_TOKEN + CONTEXT_MANAGEMENT
 *   3. workspaceBase parameter (passed from plugin init — process.cwd())
 *   4. ~/OPENCODE_WORKSPACE/.../Active Projects/ + PROJECT_TOKEN + CONTEXT_MANAGEMENT (last resort)
 */
function resolveContextDir(workspaceBase?: string): string {
  if (process.env.SHARK_CONTEXT_DIR) {
    return process.env.SHARK_CONTEXT_DIR;
  }
  if (process.env.SHARK_WORKSPACE) {
    return path.join(process.env.SHARK_WORKSPACE, PROJECT_TOKEN, 'CONTEXT_MANAGEMENT');
  }
  if (workspaceBase) {
    // workspaceBase comes from PluginInput → process.cwd() at plugin init
    // This is the ACTUAL project directory the model works in
    return path.join(workspaceBase, PROJECT_TOKEN, 'CONTEXT_MANAGEMENT');
  }
  // Last resort: hardcoded fallback path
  const home = process.env.HOME || '/root';
  return path.join(home, 'OPENCODE_WORKSPACE', 'Shared Workspace Context', 'Shark Agent', 'Active Projects', PROJECT_TOKEN, 'CONTEXT_MANAGEMENT');
}

export function getContextDir(): string {
  if (!CONTEXT_DIR) {
    CONTEXT_DIR = resolveContextDir();
  }
  return CONTEXT_DIR;
}

function ensureDir(dir?: string): string {
  const target = dir || getContextDir();
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
    console.error(`[ContextManager] Created: ${target}`);
  }
  return target;
}

function readDoc(docName: string): string | null {
  try { return fs.readFileSync(path.join(getContextDir(), docName), 'utf-8'); }
  catch (err) { 
    console.error(`[ContextManager] readDoc error for ${docName}: ${err instanceof Error ? err.message : String(err)}`);
    return null; 
  }
}

function writeDoc(docName: string, content: string): void {
  const dir = ensureDir();
  try {
    fs.writeFileSync(path.join(dir, docName), content, 'utf-8');
  } catch (err) {
    console.error(`[ContextManager] writeDoc error for ${docName} at ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// ============================================================
// INITIALIZATION
// Called once at plugin startup. Creates project folder + seeds 10 docs.
// Idempotent — checks for existing docs before re-seeding.
// ============================================================
export function initializeContextManager(workspaceBase?: string): string {
  if (CONTEXT_DIR) return CONTEXT_DIR;
  // CANONICAL path resolution — uses EXACTLY the same logic as getContextDir()
  CONTEXT_DIR = resolveContextDir(workspaceBase);
  const dir = ensureDir();
  if (!dir) return CONTEXT_DIR;
  if (fs.existsSync(path.join(dir, 'BUILD_STATE.md'))) {
    console.error(`[ContextManager] Already initialized at ${dir}`);
    return CONTEXT_DIR;
  }
  const seed: Record<string, string> = {
    'BUILD_STATE.md': '# BUILD STATE — Stream of Consciousness\n\nInitialized by ContextManager.\nTracks task completions with agent reasoning/goal context.\n',
    'TASK_QUEUE.md': '# TASK QUEUE — Reasoning Focus\n\n| Status | Task | Focus | State |\n|--------|------|-------|-------|\n',
    'CHANGELOG.md': '# CHANGELOG — Breakthroughs & Insights\n\nInitialized by ContextManager.\nTracks insights, architectural decisions, and breakthroughs.\n',
    'DECISION_CHAIN.md': '# DECISION CHAIN — Reasoning Trail\n\n| # | Decision | Rationale | Context | Date |\n|---|----------|-----------|---------|------|\n',
    'DEBUG_LOG.md': '# DEBUG LOG — Root Cause & Lessons\n\nInitialized by ContextManager.\nTracks what went wrong, root cause, AND what was learned.\n',
    'COMPACTION_SURVIVAL.md': '# COMPACTION SURVIVAL — Current State\n\nInitialized.\nTracks where the agent is RIGHT NOW: gate, task, thought state.\n',
    'EVIDENCE_STATE.md': '# EVIDENCE STATE — What Has Been Proven\n\nInitialized.\nTracks what works, what doesn\'t, and confidence level.\n',
    'POST-COMPACTION_PROMPT.md': '# POST-COMPACTION PROMPT — Reasoning Chain\n\nInitialized.\nStores exact resumption instructions with full reasoning chain.\n',
    'SoC_PRESERVATION.md': '# SoC PRESERVATION — Pattern Discovery\n\nInitialized by ContextManager.\nPatterns discovered with full context per discovery.\n',
    'THOUGHT_STREAM.md': '# THOUGHT STREAM\n\nStream of consciousness — NOT context management. RGE/SRE enforcement results only.\n',
  };
  for (const [name, content] of Object.entries(seed)) {
    const filePath = path.join(dir, name);
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (writeErr) {
      console.warn(`[ContextManager] Failed to write seed file ${filePath}:`, writeErr);
      throw writeErr;
    }
  }
  console.error(`[ContextManager] Seeded all 10 docs at ${dir}`);
  return CONTEXT_DIR;
}

// ============================================================
// 1. BUILD_STATE.md — Append task completion entry with reasoning
// Trigger: COMPLETED subagent task, completed to-do
// Format: ## taskId — STATUS (timestamp)
//         Goal: {reasoning}
//         Result: {description}
// ============================================================
export function updateBuildStateOnTaskComplete(
  taskId: string,
  status: string,
  description: string,
  reasoning?: string,
): void {
  const existing = readDoc('BUILD_STATE.md') || '# BUILD STATE — Stream of Consciousness\n';
  const goalLine = reasoning ? `Goal: ${reasoning}\n` : '';
  writeDoc(
    'BUILD_STATE.md',
    existing + `\n## ${taskId} — ${status.toUpperCase()} (${new Date().toISOString()})\n${goalLine}Result: ${description}\n`,
  );
}

// ============================================================
// 2. TASK_QUEUE.md — Track active focus, next steps, blockers
// Trigger: task spawn, task complete/fail (1, 2, 3)
// Format:
//   Current Focus: {focus}
//   [x] taskId: description (status)
//   Next: {next steps}
//   Blockers: {blockers}
// ============================================================
export function updateTaskQueue(
  taskId: string,
  description: string,
  status: 'PENDING' | 'COMPLETE' | 'FAILED',
  focus?: string,
): void {
  // NOTE: This function updates the TASK_QUEUE.md doc but does NOT advance the
  // state machine (gate transitions). State machine advancement happens at the
  // hook level in tool-after-handler.ts (step 14: auto-advance gate), which
  // calls these context functions as part of a larger enforcement pipeline.
  // Keeping advancement centralized in the hook prevents duplicate transitions
  // and ensures gate criteria are checked before any advance.
  const existing = readDoc('TASK_QUEUE.md') || '# TASK QUEUE — Reasoning Focus\n';
  const prefix = status === 'COMPLETE' ? '[x]' : '[ ]';
  const focusLine = focus ? `\n**Current Focus:** ${focus}\n` : '';
  const nextSteps = focus ? `\n**Next:** ${focus}\n` : '';
  writeDoc(
    'TASK_QUEUE.md',
    existing + `${focusLine}${prefix} ${taskId}: ${description} (${status} — ${new Date().toISOString()})${nextSteps}\n`,
  );
}

// ============================================================
// 3. CHANGELOG.md — Track insights, breakthroughs, architectural decisions
// Trigger: major milestone, breakthrough, ship (4)
// Format:
//   ## buildName (timestamp)
//   Insight: {insight}
//   Impact: {impact}
// ============================================================
export function updateChangelog(
  buildName: string,
  changes?: Array<{ issue: string; file: string; change: string }>,
  insights?: string,
): void {
  const existing = readDoc('CHANGELOG.md') || '# CHANGELOG — Breakthroughs & Insights\n';
  let entry = `\n## ${buildName} (${new Date().toISOString()})\n`;
  if (insights) {
    entry += `Insight: ${insights}\nImpact: ${insights}\n`;
  }
  if (changes && changes.length > 0) {
    entry += `\n| Issue | File | Change |\n|-------|------|--------|\n`;
    for (const c of changes) entry += `| ${c.issue} | ${c.file} | ${c.change} |\n`;
  }
  writeDoc('CHANGELOG.md', existing + entry);
}

// ============================================================
// 4. DECISION_CHAIN.md — WHY decisions were made, full reasoning
// Trigger: architectural decision, breakthrough, milestone (4)
// Format: | # | Decision | Rationale | Context | Date |
// ============================================================
export function updateDecisionChain(
  decision: string,
  rationale: string,
  context?: string,
): void {
  const existing = readDoc('DECISION_CHAIN.md') || '# DECISION CHAIN — Reasoning Trail\n';
  const count = (existing || '').split('\n|').length;
  const contextCell = context || '—';
  writeDoc(
    'DECISION_CHAIN.md',
    existing + `| ${count} | ${decision} | ${rationale} | ${contextCell} | ${new Date().toISOString().split('T')[0]} |\n`,
  );
}

// ============================================================
// 5. DEBUG_LOG.md — What went wrong, root cause, AND what was learned
// Trigger: enforcement BLOCK, test failure, error (1,3)
// Format:
//   ## timestamp — category
//   Desc: {description}
//   Root: {rootCause}
//   Fix: {fix}
//   Lesson: {lesson}
// ============================================================
export function updateDebugLog(
  category: string,
  description: string,
  rootCause: string,
  fix: string,
  lesson?: string,
): void {
  const existing = readDoc('DEBUG_LOG.md') || '# DEBUG LOG — Root Cause & Lessons\n';
  const lessonLine = lesson ? `- **Lesson:** ${lesson}\n` : '';
  writeDoc(
    'DEBUG_LOG.md',
    existing + `\n## ${new Date().toISOString()} — ${category}\n- **Desc:** ${description}\n- **Root:** ${rootCause}\n- **Fix:** ${fix}\n${lessonLine}`,
  );
}

// ============================================================
// 6. COMPACTION_SURVIVAL.md — Where am I RIGHT NOW?
// Overwrite with: phase, active count, completed count, next milestone, AND current thought
// Trigger: state change, gate transition, token threshold (5)
// ============================================================
export function updateCompactionSurvival(
  phase: string,
  active: number,
  completed: number,
  next: string,
  thought?: string,
): void {
  const thoughtLine = thought ? `- **Current Thought:** ${thought}\n` : '';
  writeDoc(
    'COMPACTION_SURVIVAL.md',
    `# COMPACTION SURVIVAL — Current State of Mind\n\n**Updated:** ${new Date().toISOString()}\n- **Phase:** ${phase}\n- **Active:** ${active}\n- **Completed:** ${completed}\n- **Next:** ${next}\n${thoughtLine}`,
  );
}

// ============================================================
// 7. EVIDENCE_STATE.md — What have I proven? what works, what doesn't
// Overwrite with: bundle, tests, AND what we know works/doesn't
// Trigger: container test start + finish (3), analysis run
// ============================================================
export function updateEvidenceState(
  bundleSize: number,
  testResults: string,
  confidence?: string,
): void {
  const confidenceLine = confidence ? `- **Confidence:** ${confidence}\n` : '';
  writeDoc(
    'EVIDENCE_STATE.md',
    `# EVIDENCE STATE — What Has Been Proven\n\n**Updated:** ${new Date().toISOString()}\n- **Bundle:** ${bundleSize} bytes\n- **Tests:** ${testResults}\n${confidenceLine}`,
  );
}

// ============================================================
// 8. POST-COMPACTION_PROMPT.md — Exact resumption instructions with reasoning chain
// Overwrite with: last task, gate, counts, AND the FULL reasoning chain to resume
// Trigger: state change, milestone, token threshold (4,5)
// ============================================================
export function updatePostCompactionPrompt(
  lastTask: string,
  gate: string,
  active: number,
  completed: number,
  reasoning_chain?: string,
): void {
  const chainLine = reasoning_chain
    ? `\n## Reasoning Chain\n${reasoning_chain}\n`
    : '\n## Reasoning Chain\n(No detailed reasoning chain recorded — read BUILD_STATE.md and DECISION_CHAIN.md for context.)\n';
  writeDoc(
    'POST-COMPACTION_PROMPT.md',
    `# POST-COMPACTION RECOVERY — Reasoning Chain\n\n**Snapshot:** ${new Date().toISOString()}\n- **Last Task:** ${lastTask}\n- **Gate:** ${gate}\n- **Active:** ${active}\n- **Completed:** ${completed}\n\n## Resumption Instructions\n1. Read COMPACTION_SURVIVAL.md — where was I?\n2. Read THOUGHT_STREAM.md — what was I thinking?\n3. Read BUILD_STATE.md — what was I building?\n4. Read DECISION_CHAIN.md — why did I choose what I chose?\n5. Read TASK_QUEUE.md — what's next?\n6. Rebuild\n7. Re-verify\n${chainLine}`,
  );
}

// ============================================================
// 9. SoC_PRESERVATION.md — Patterns discovered with full context
// Same format (append, pattern/context/source)
// Trigger: breakthrough, solution found, milestone (4)
// ============================================================
export function updateSoCPreservation(
  patterns: Array<{ pattern: string; context: string; source: string }>,
): void {
  const existing = readDoc('SoC_PRESERVATION.md') || '# SoC PRESERVATION — Pattern Discovery\n';
  let entry = `\n## ${new Date().toISOString()}\n`;
  for (const p of patterns) {
    entry += `- **Pattern:** ${p.pattern}\n  - **Context:** ${p.context}\n  - **Source:** ${p.source}\n`;
  }
  writeDoc('SoC_PRESERVATION.md', existing + entry);
}

// ============================================================
// 10. THOUGHT_STREAM.md — Raw stream of consciousness
// Append on EVERY tool call. One line per call.
// Format: | timestamp | tool | intent | reasoning | result | next |
// Called from tool.execute.before (intent) and tool.execute.after (result)
// ============================================================
export function updateThoughtStream(entry: string): void {
  const dir = ensureDir();
  const filePath = path.join(dir, 'THOUGHT_STREAM.md');
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '# THOUGHT STREAM\n\nStream of consciousness.\n');
    }
    fs.appendFileSync(filePath, `\n## ${new Date().toISOString()}\n${entry}\n`);
    const stats = fs.statSync(filePath);
    if (stats.size > 500000) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      fs.writeFileSync(filePath, '# THOUGHT STREAM\n\n' + lines.slice(-200).join('\n'));
    }
  } catch { /* non-fatal */ }
}

// ============================================================
// TOKEN THRESHOLD TRACKER (pseudocode — agent implements)
// Trigger: every 15% of context tokens consumed (5)
// ============================================================
// The enforcement brain tracks token usage and calls this when threshold is crossed.
// Pseudocode for agent to implement:
/*
const TOKEN_BUDGET = 200000; // approximate max context tokens
let lastTokenThreshold = 0;

export function checkTokenThreshold(currentTokens: number): boolean {
  const pct = Math.round((currentTokens / TOKEN_BUDGET) * 100);
  if (pct >= lastTokenThreshold + 15) {
    lastTokenThreshold = pct;
    updateCompactionSurvival('BUILD', 0, 0, \`${pct}% tokens used — checkpoint recommended\`, \`Token threshold ${pct}% — considering checkpoint\`);
    updatePostCompactionPrompt('Token threshold crossed', 'BUILD', 0, 0, 'Token threshold reached — saving state for compaction recovery.');
    updateThoughtStream(
      'checkTokenThreshold',
      'Token threshold reached — save checkpoint',
      \`Context at ${pct}% — 15% threshold crossed. Saving state before compaction risk.\`,
      \`Checkpoint written at ${pct}% token usage\`,
      'Continue work after state save',
    );
    return true;
  }
  return false;
}
*/
