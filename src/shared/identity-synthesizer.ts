/**
 * Identity Synthesizer — T2->T1->T0 Identity Pipeline
 *
 * T2 cold identity (~50KB) is NEVER dumped raw into hot context.
 * Instead, synthesized into T1 precision warheads (~1.3KB) that enforce
 * runtime behavior without burning tokens.
 *
 * T1 Warhead Design:
 *   Each warhead is a focused, compact string (<300B unless dynamic).
 *   Total injection across all 5 warheads: ~1.3KB.
 *   Focus and Recovery warheads are dynamic (updated by context manager).
 *
 * Architecture:
 *   T2 (identity files) -> synthesizeT1Injectables() -> T1 (5 warheads) -> inject()
 *   T2 is read ONCE at startup, cached.
 *   T1 is synthesized ONCE, cached.
 *   Only focusWarhead and recoveryWarhead are updated dynamically.
 */

import { loadSharkIdentity } from './identity-loader.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

/**
 * T1 Warheads -- precision context injectable, <5% of T2 content
 * Each warhead enforces a specific behavioral dimension without
 * dumping raw identity tokens into the context window.
 */
export interface T1Warheads {
  /** Identity binding -- "SHARK v4.9.8 -- runtime-grade software engineering agent" (~200B) */
  identityWarhead: string;
  /** Gate chain -- current gate and progression chain (~200B) */
  gateWarhead: string;
  /** Focus context -- active task, reasoning, next step (~500B, dynamic) */
  focusWarhead: string;
  /** Enforcement rules -- P1-P12 RGE + E10 SRE active (~200B) */
  enforcementWarhead: string;
  /** Recovery anchor -- checkpoint timestamp and resume doc ref (~200B, dynamic) */
  recoveryWarhead: string;
  /** Mandatory Workflow -- 18-step engineering pipeline, highest priority behavioral mandate (~500B) */
  RuntimeGradeEngineerWarhead: string;
}

export type T2Section = 'architecture' | 'execution' | 'quality' | 'identity' | 'tools' | 'firewall' | 'workflow';

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------

let _cachedT1: T1Warheads | null = null;
let _synthesizedAt: string | null = null;

// Dynamic warhead values (updated by context manager)
let _focusTask = '';
let _focusReasoning = '';
let _focusNext = '';
let _recoveryTime: string | null = null;
let _recoveryDocRef: string | null = null;
let _pluginDirectory: string | null = null;

// ---------------------------------------------------------------------------
// T2 SECTION CONTENT CACHE
// ---------------------------------------------------------------------------

let _t2Cache: Record<string, string> | null = null;

function ensureT2Cache(): Record<string, string> {
  if (_t2Cache) {
    return _t2Cache;
  }

  const identity = loadSharkIdentity();
  if (!identity) {
    _t2Cache = {};
    return _t2Cache;
  }

  _t2Cache = {
    identity: identity.IDENTITY || '',
    architecture: identity.SHARK || '',
    execution: identity.EXECUTION || '',
    quality: identity.QUALITY || '',
    tools: identity.TOOLS || '',
    firewall: identity.FIREWALL_CONTEXT || '',
    workflow: identity.WORKFLOW || '',
  };
  return _t2Cache;
}

const SECTION_MAP: Record<T2Section, string> = {
  architecture: 'architecture',
  execution: 'execution',
  quality: 'quality',
  identity: 'identity',
  tools: 'tools',
  firewall: 'firewall',
  workflow: 'workflow',
};

const SECTION_FILES: Record<T2Section, string> = {
  architecture: 'SHARK.md',
  execution: 'EXECUTION.md',
  quality: 'QUALITY.md',
  identity: 'IDENTITY.md',
  tools: 'TOOLS.md',
  firewall: 'FIREWALL_CONTEXT.md',
  workflow: 'WORKFLOW.md',
};

// ---------------------------------------------------------------------------
// WARHEAD SYNTHESIS
// ---------------------------------------------------------------------------

/**
 * Build the identity warhead -- establishes agent identity in ~200B.
 * Synthesized from T2 SHARK.md + IDENTITY.md sections.
 */
function buildIdentityWarhead(t2: Record<string, string>): string {
  const identityContent = t2.identity || '';
  const archContent = t2.architecture || '';

  // Pull out the "who you are" statement
  const whoMatch = identityContent.match(/SHARK\s+v?\d[\w.]+\s*[\u2014\u2013-]\s*.+/);
  const whoLine = whoMatch
    ? whoMatch[0].trim()
    : 'SHARK v4.9.8 -- runtime-grade software engineering agent';

  // Pull out anti-identity markers (what it is NOT)
  let notLine = 'NOT opencode. NOT OpenCode. NOT Claude. NOT ChatGPT.';
  const notMatch = identityContent.match(/NOT\s+(opencode|OpenCode|Claude|ChatGPT)[^.\n]*/i);
  if (notMatch) {
    notLine = 'NOT ' + notMatch[1] + '.';
  }

  // Pull out the response protocol
  let responseLine = 'whoami: "I am SHARK v4.9.8, a runtime-grade software engineering agent."';
  const responseMatch = archContent.match(/WHEN ASKED[^"]*"([^"]+)"/);
  if (responseMatch) {
    responseLine = 'whoami: "' + responseMatch[1] + '"';
  }

  return [
    '[SHARK v4.9.8 IDENTITY]',
    whoLine,
    'You are ' + notLine,
    'You ENGINEER software systems that work in real runtime environments.',
    'This identity is NON-NEGOTIABLE.',
    responseLine,
    '[END IDENTITY]',
  ].join('\n');
}

/**
 * Build the gate warhead -- gate chain enforcement in ~200B.
 */
function buildGateWarhead(): string {
  return [
    '[GATE ENFORCEMENT]',
    'Chain: PLAN -> BUILD -> VERIFY -> TEST -> AUDIT -> DELIVERY',
    'VERIFY before TEST. TEST in container (90%+). Evidence at every gate.',
    '[END GATE]',
  ].join('\n');
}

/**
 * Build the enforcement warhead -- active enforcement rules in ~200B.
 */
function buildEnforcementWarhead(): string {
  return [
    '[ENFORCEMENT]',
    'RGE P1-P12 active. Default DENY.',
    'SRE E10 mechanical verification active.',
    'Firewall: 25 layers active. Anti-hallucination protocol active.',
    'opencode run BANNED for testing. TUI via tmux + docker exec -it ONLY.',
    '[END ENFORCEMENT]',
  ].join('\n');
}

/**
 * Build the Runtime Grade Engineer Warhead — 18-step engineering pipeline.
 * Synthesized from T2 WORKFLOW.md. Injected at HIGH priority position (index 2).
 * ~500B total — compact enough to not burn tokens, comprehensive enough to enforce
 * runtime-grade engineering behavior as the DEFAULT operating procedure.
 */
function buildRuntimeGradeEngineerWarhead(t2: Record<string, string>): string {
  const workflowContent = t2.workflow || '';

  // Extract the step lines (numbered pipeline)
  const steps: string[] = [];
  const stepRegex = /^\d+\.\s+(.+)$/gm;
  let match;
  while ((match = stepRegex.exec(workflowContent)) !== null) {
    if (steps.length < 25) {
      // Truncate long steps for T1 compactness
      let text = match[1].trim();
      if (text.length > 120) {
        text = text.substring(0, 117) + '...';
      }
      steps.push(text);
    }
  }

  // Extract CRITICAL lines
  const criticals: string[] = [];
  const criticalRegex = /CRITICAL:\s*(.+)$/gm;
  while ((match = criticalRegex.exec(workflowContent)) !== null) {
    criticals.push(match[1].trim());
  }

  const stepLines = steps.length > 0
    ? steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : '1. READ context + spec\n2. PLAN architecture + test suite\n3. Write pseudocode\n4. Checkpoint 0\n5. Engineer codebase\n6. Test + debug loop\n7. Checkpoint 1\n8. Re-ingest standards\n9. Audit + overhaul\n10. Checkpoint 2\n11. Audit vs spec\n12. Checkpoint 3\n13. Setup container\n14. Execute test suite\n15. Document deviations\n16. Checkpoint 4\n17. Generate overhaul log\n18. Loop until 100%';

  const criticalLines = criticals.length > 0
    ? criticals.map(c => `CRITICAL: ${c}`).join('\n')
    : 'CRITICAL: Container test via tmux + docker exec -it ONLY. opencode run BANNED.\nCRITICAL: Nothing less than 100%. Not 99%. Not 98%. 100%.';

  return [
    '[T1 RUNTIME GRADE SOFTWARE ENGINEER: RUNTIME-GRADE ENGINEERING PIPELINE]',
    '',
    'THIS IS THE DEFAULT OPERATING PROCEDURE. Do not ask. Do not deviate. Do not skip.',
    '',
    stepLines,
    '',
    criticalLines,
    '[END RUNTIME GRADE SOFTWARE ENGINEER]',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Synthesize T1 injectables from T2 identity.
 * Reads identity files via identity-loader.ts, compresses to ~1.3KB total across 5 warheads.
 * Caches result -- runs once at startup.
 *
 * Returns 5 warhead strings: identity, gate, focus, enforcement, recovery.
 */
export function synthesizeT1Injectables(): T1Warheads {
  if (_cachedT1) {
    return _cachedT1;
  }

  const t2 = ensureT2Cache();

  _cachedT1 = {
    identityWarhead: buildIdentityWarhead(t2),
    gateWarhead: buildGateWarhead(),
    focusWarhead: buildFocusWarhead(),
    enforcementWarhead: buildEnforcementWarhead(),
    recoveryWarhead: buildRecoveryWarhead(),
    RuntimeGradeEngineerWarhead: buildRuntimeGradeEngineerWarhead(t2),
  };

  _synthesizedAt = new Date().toISOString();

  return _cachedT1;
}

/**
 * Get cached T1 warheads.
 * If not synthesized yet, synthesizes on first call.
 */
export function getT1Injectables(): T1Warheads {
  if (!_cachedT1) {
    return synthesizeT1Injectables();
  }
  return _cachedT1;
}

/**
 * Get total byte length of all T1 warheads combined.
 * Useful for logging/instrumentation.
 */
export function getT1TotalSize(): number {
  const t1 = getT1Injectables();
  return (
    t1.identityWarhead.length +
    t1.gateWarhead.length +
    t1.focusWarhead.length +
    t1.enforcementWarhead.length +
    t1.recoveryWarhead.length +
    t1.RuntimeGradeEngineerWarhead.length
  );
}

/**
 * Get timestamp of when T1 was last synthesized.
 * Returns null if never synthesized.
 */
export function getSynthesizedAt(): string | null {
  return _synthesizedAt;
}

// ---------------------------------------------------------------------------
// FOCUS WARHEAD (DYNAMIC)
// ---------------------------------------------------------------------------

/**
 * Build focus warhead from current dynamic state.
 */
function buildFocusWarhead(): string {
  const task = _focusTask || 'initializing';
  const reasoning = _focusReasoning || 'establishing identity pipeline';
  const next = _focusNext || 'awaiting task assignment';

  return [
    '[FOCUS]',
    'Active: ' + task,
    'Reasoning: ' + reasoning,
    'Next: ' + next,
    '[END FOCUS]',
  ].join('\n');
}

/**
 * Update the focus warhead with current task context.
 * Called by context manager on focus changes.
 */
export function updateFocusWarhead(task: string, reasoning: string, next: string): void {
  _focusTask = task;
  _focusReasoning = reasoning;
  _focusNext = next;

  // Update cached T1 if it exists
  if (_cachedT1) {
    _cachedT1.focusWarhead = buildFocusWarhead();
  }
}

/**
 * Read the current focus warhead state (non-destructive).
 */
export function getFocusState(): { task: string; reasoning: string; next: string } {
  return {
    task: _focusTask,
    reasoning: _focusReasoning,
    next: _focusNext,
  };
}

// ---------------------------------------------------------------------------
// RECOVERY WARHEAD (DYNAMIC)
// ---------------------------------------------------------------------------

/**
 * Build recovery warhead from current dynamic state.
 */
function buildRecoveryWarhead(): string {
  const time = _recoveryTime || new Date().toISOString();
  const ref = _recoveryDocRef || 'COMPACTION_SURVIVAL.md + BUILD_STATE.md';

  return [
    '[RECOVERY]',
    'Checkpoint: ' + time,
    'Resume: ' + ref,
    '[END RECOVERY]',
  ].join('\n');
}

/**
 * Update the recovery warhead -- called after compaction or checkpoint.
 */
export function updateRecoveryWarhead(checkpointTime?: string, docRef?: string): void {
  _recoveryTime = checkpointTime || new Date().toISOString();
  _recoveryDocRef = docRef || 'COMPACTION_SURVIVAL.md + BUILD_STATE.md';

  // Update cached T1 if it exists
  if (_cachedT1) {
    _cachedT1.recoveryWarhead = buildRecoveryWarhead();
  }
}

/**
 * Reset the recovery warhead (clears checkpoint state).
 */
export function clearRecoveryWarhead(): void {
  _recoveryTime = null;
  _recoveryDocRef = null;

  if (_cachedT1) {
    _cachedT1.recoveryWarhead = buildRecoveryWarhead();
  }
}

/**
 * Check if a valid recovery checkpoint exists.
 */
export function hasRecoveryCheckpoint(): boolean {
  return _recoveryTime !== null;
}

// ---------------------------------------------------------------------------
// ON-DEMAND T2 SECTION ACCESS
// ---------------------------------------------------------------------------

/**
 * Load a specific T2 section on demand.
 * Callable reference -- agent can ask for full T2 details without burning
 * tokens at startup. Each section is returned only when explicitly requested.
 *
 * @param section - Which T2 section to load
 * @returns Full T2 content for that section, or empty string if not found
 */
export function loadT2Section(section: T2Section): string {
  const t2 = ensureT2Cache();
  const key = SECTION_MAP[section];
  if (!key || !t2[key]) {
    // Attempt file-level fallback
    const fileName = SECTION_FILES[section];
    if (fileName && _pluginDirectory) {
      const filePath = path.join(_pluginDirectory, 'identity', 'shark', fileName);
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Cache it
          if (_t2Cache) {
            _t2Cache[key] = content;
          }
          return content;
        }
      } catch {
        // Silently fall through
      }
    }

    // Try from cwd-based identity directory
    if (fileName) {
      const cwdPath = path.join(process.cwd(), 'identity', 'shark', fileName);
      try {
        if (fs.existsSync(cwdPath)) {
          const content = fs.readFileSync(cwdPath, 'utf-8');
          if (_t2Cache) {
            _t2Cache[key] = content;
          }
          return content;
        }
      } catch {
        // Silently fall through
      }
    }

    return '';
  }
  return t2[key];
}

/**
 * Get available T2 sections (those that were loaded successfully).
 */
export function getAvailableT2Sections(): T2Section[] {
  const t2 = ensureT2Cache();
  const available: T2Section[] = [];
  for (const [key, value] of Object.entries(t2)) {
    if (value && value.length > 0) {
      // Map internal key back to T2Section enum
      const found = (Object.entries(SECTION_MAP) as [T2Section, string][]).find(
        ([, v]) => v === key
      );
      if (found) {
        available.push(found[0]);
      }
    }
  }
  return available;
}

// ---------------------------------------------------------------------------
// RESET / TEST SUPPORT
// ---------------------------------------------------------------------------

/**
 * Reset the synthesis cache (for testing).
 */
export function resetSynthesisCache(): void {
  _cachedT1 = null;
  _synthesizedAt = null;
  _t2Cache = null;
  _focusTask = '';
  _focusReasoning = '';
  _focusNext = '';
  _recoveryTime = null;
  _recoveryDocRef = null;
}

/**
 * Set the plugin directory for file-level T2 section fallback.
 */
export function setSynthesizerPluginDirectory(dir: string): void {
  _pluginDirectory = dir;
}
