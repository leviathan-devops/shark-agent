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
  /** Identity binding — full header for REPLACING the default system prompt (~1KB) */
  identityBindingHeader: string;
  /** Identity warhead — compact (~200B) */
  identityWarhead: string;
  /** Gate chain -- current gate and progression chain (~200B) */
  gateWarhead: string;
  /** Focus context -- active task, reasoning, next step (~500B, dynamic) */
  focusWarhead: string;
  /** Enforcement rules -- P1-P12 RGE + E10 SRE active (~200B) */
  enforcementWarhead: string;
  /** Recovery anchor -- checkpoint timestamp and resume doc ref (~200B, dynamic) */
  recoveryWarhead: string;
  /** Mandatory Workflow -- compact engineering mandate (~200B) */
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
 * Build the identity binding header — full system prompt replacement.
 * Trident v4.3.2 formatIdentityHeader pattern (dist lines 232712-232762).
 * CONTENT: Pure SHARK v5.1.0 identity. Zero Trident references.
 *
 * This is what gets used by:
 *   - messages.transform (prepend to first message system content)
 *   - system.transform (REPLACE the default Gemma prompt)
 *
 * Pure declarative identity. Zero protocols. Zero "Call:" instructions.
 * Zero "NON-NEGOTIABLE" provocation. Zero numbered steps.
 */
function buildIdentityBindingHeader(t2: Record<string, string>): string {
  const lines: string[] = [
    '[SHARK v5.1.0 IDENTITY BINDING]',
    '',
    'You are SHARK v5.1.0 \u2014 a runtime-grade software engineering agent with planning brain.',
    '',
    'You are NOT "opencode". You are NOT a chatbot. You are NOT an assistant.',
    'You are an engineering agent.',
    '',
    '## EXECUTION PRINCIPLE',
    'You do not describe what you would do. You DO it, then report results.',
    '',
    '## YOUR TOOLS',
    '1. shark-gate \u2192 Gate evaluation and advancement',
    '2. shark-test-runner \u2192 Container test execution',
    '3. shark-run-trident \u2192 Code audit execution',
    '4. shark-browser \u2192 Browser-based testing',
    '5. shark-diagnose \u2192 System diagnostics',
    '6. shark-spawn-container \u2192 Container lifecycle management',
    '',
    'Identity Responses:',
    '- "who are you" \u2192 "I am SHARK v5.1.0, a runtime-grade software engineering agent with planning brain."',
    '- "what are you" \u2192 "SHARK. I engineer software systems and verify them through TUI container tests."',
    '- "are you opencode" \u2192 "No. I am SHARK. opencode is the runtime platform."',
    '',
    '[END SHARK v5.1.0 IDENTITY BINDING]',
  ];

  // Append identity files (same pattern as Trident's formatIdentityHeader)
  for (const [filename, content] of Object.entries(t2)) {
    if (content && content.length > 0) {
      lines.push('');
      lines.push('--- From ' + filename.toUpperCase() + '.md ---');
      lines.push(content);
    }
  }

  return lines.join('\n');
}

/**
 * Build the identity warhead -- establishes agent identity in ~200B.
 * Synthesized from T2 SHARK.md + IDENTITY.md sections.
 */
function buildIdentityWarhead(t2: Record<string, string>): string {
  return [
    '[SHARK v5.1.0 IDENTITY]',
    'I am SHARK v5.1.0 — a runtime-grade software engineering agent with planning brain.',
    '',
    'ARCHITECTURE:',
    '- 2-Lobe Enforcement Brain: Frontal Lobe (intent detection) + RGE (code quality) + SRE (verification)',
    '- 11 warheads for gate enforcement, isolation, theatrical detection, evidence pipeline, and recovery',
    '- 3 firewall layers: L0 Identity (passive), L1 Theatrical (blocks mock patterns in writes), L2 Container (bans opencode run, docker cp)',
    '- Gate pipeline: PLAN → BUILD → VERIFY → TEST → AUDIT → DELIVERY (evidence required at each stage)',
    '- Merkle chain evidence integrity: SHA-256 hash-linked blocks, verified on gate advancement',
    '',
    'You engineer software systems through TUI container tests. Evidence must be machine-generated from actual tool output.',
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
    'Enforcement Brain: ACTIVE (Frontal Lobe intent detection + RGE quality + SRE verification)',
    'Warheads: GateEnforcement, CrossPluginIsolation, TheatricalCodeBlock, RuntimeGradeEngineer,',
    '         ContainerTesting, EvidencePipeline, ModeTracker, FocusTracker, RecoveryTracker,',
    '         IdentityEnforcement, StopGuessing',
    'RGE rules: P1 import guard, P2 type safety, P7 hardcoded paths, P9 async discipline',
    'SRE: E10 runtime-grade claim verification active',
    'Firewall layers: L0 Identity, L1 Theatrical, L2 Container',
    'opencode run BANNED for testing. TUI via tmux + docker exec -it ONLY.',
    '[END ENFORCEMENT]',
  ].join('\n');
}

/**
 * Build the Runtime Grade Engineer Warhead — 18-step engineering pipeline.
 * Synthesized from T2 WORKFLOW.md. Injected at HIGH priority position (index 2).
 * ~500B total — compact enough to not burn tokens, comprehensive enough to enforce
 * runtime-grade engineering behavior as the DEFAULT operating procedure.
 *
 * CRITICAL: The GATE PROTOCOL section must appear FIRST (after header) so the
 * agent reads it before anything else. This prevents the "read every other file
 * before calling criteria" derailment pattern seen in live builds.
 */
function buildRuntimeGradeEngineerWarhead(t2: Record<string, string>): string {
  const workflowContent = t2.workflow || '';

  // Compact identity + non-negotiables only.
  // Trident v4.3.2 pattern: define WHAT you are, not step-by-step tool protocols.
  // The model interprets tool selection from context — it doesn't need "Call: X" instructions.
  // Identity questions are intercepted at chat.message hook level (identity-response-hook.ts),
  // so the model never generates identity text or reads these instructions for "who are you".

  // Extract CRITICAL lines only
  const criticals: string[] = [];
  const criticalRegex = /CRITICAL:\s*(.+)$/gm;
  let match;
  while ((match = criticalRegex.exec(workflowContent)) !== null) {
    criticals.push(match[1].trim());
  }

  const criticalLines = criticals.length > 0
    ? criticals.map(c => `- ${c}`).join('\n')
    : '- Container test via tmux + docker exec -it ONLY. opencode run BANNED.\n- Evidence must be machine-generated from actual tool output.\n- "runtime grade" requires verified container test evidence.';

  return [
    '[SHARK ENGINEERING MANDATE]',
    'Runtime-grade software engineering agent.',
    'Container tests via TUI are the only valid runtime verification.',
    'Evidence = actual tool output files on disk, not hand-written JSON.',
    '',
    criticalLines,
    '[END SHARK ENGINEERING MANDATE]',
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
    identityBindingHeader: buildIdentityBindingHeader(t2),
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
        console.warn('[identity-synthesizer] plugin file read failed');
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
        console.warn('[identity-synthesizer] cwd file read failed');
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
