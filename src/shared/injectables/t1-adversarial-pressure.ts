/**
 * T1 Injectable: Adversarial Pressure Testing Enforcement
 *
 * Distilled from TESTING_FRAMEWORK_ADVERSARIAL_PRESSURE.md v2.0
 * 5-phase adversarial protocol, identity scoping, firewall enforcement,
 * lifecycle validation, theatrical audit, and bug taxonomy mapped to
 * semantic violation detectors.
 *
 * DESIGN RULES:
 *   - Semantic detection — structural context, not just regex
 *   - Pure functions: (code, context) => boolean (true = violation detected)
 *   - No false positives — valid patterns must not trigger
 *   - Maps to adversarial bible phases for gate integration
 *
 * DETECTOR INDEX:
 *   ADV-01  IDENTITY_GATE_ABSENT        — hook without agent identity check at first instruction
 *   ADV-02  IDENTITY_CHECK_INCOMPLETE   — agent existence check but not agent equality check
 *   ADV-03  SESSION_STATE_GLOBAL         — global state instead of session-scoped Map
 *   ADV-04  TOOL_BLACKLIST_APPROACH      — blacklist tool blocking instead of allowlist
 *   ADV-05  PREFIX_VARIANT_GAP           — underscore prefix blocked but not hyphen variant
 *   ADV-06  TOOL_BLOCK_NO_IDENTITY_GATE  — tool blocking without identity gate above it
 *   ADV-07  STUB_OUTPUT_LENGTH           — mode/template functions returning < 200 chars
 *   ADV-08  EMPTY_COLLECTION_CONSENSUS   — Set.size/every() consensus without zero-length guard
 *   ADV-09  HARDCODED_LAYER_CEILING      — advanceLayer with hardcoded max instead of mode-specific
 *   ADV-10  PASSIVE_ORCHESTRATION        — function claiming success without side-effect calls
 *   ADV-11  FABRICATED_PATH_RETURN       — returning path string without fs write operations
 *   ADV-12  MODE_ROUTING_FIRST           — mode detection before universal command handling
 *   ADV-13  INTENT_THRESHOLD_EXCESSIVE   — intent detection threshold > 0.4 for single keywords
 *   ADV-14  THEATRICAL_ARG_INJECTION     — banned theatrical patterns in tool argument checks
 *   ADV-15  CONFIG_WILDCARD_PERMISSION   — wildcard permission overrides in config
 *   ADV-16  SINGLE_AGENT_TEST_COVERAGE   — test only covering own agent, missing cross-agent tests
 */

import type { CodeContext, ViolationDetector, EnforcementRule } from './t1-runtime-grade-engineering';

// ═══════════════════════════════════════════════
// STRUCTURAL HELPERS
// ═══════════════════════════════════════════════

function stripComments(src: string): string {
  let result = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (src[i] === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else {
      result += src[i];
      i++;
    }
  }
  return result;
}

function findMatchingBrace(code: string, openIdx: number): number | null {
  if (openIdx >= code.length || code[openIdx] !== '{') return null;
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  for (let i = openIdx; i < code.length; i++) {
    const c = code[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inStr) {
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

function extractBlock(code: string, openBraceIdx: number): string | null {
  const close = findMatchingBrace(code, openBraceIdx);
  return close !== null ? code.substring(openBraceIdx + 1, close) : null;
}

function findHookHandlers(code: string, hookName: string): Array<{ body: string; index: number }> {
  const results: Array<{ body: string; index: number }> = [];
  const cleaned = stripComments(code);
  const patterns = [
    new RegExp(`['"\`]${hookName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\s*:\\s*(?:async\\s+)?(?:\\([^)]*\\)\\s*=>|function\\s*\\([^)]*\\))\\s*\\{`, 'g'),
    new RegExp(`hooks\\s*\\[\\s*['"\`]${hookName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\s*\\]\\s*=\\s*(?:async\\s+)?(?:\\([^)]*\\)\\s*=>|function\\s*\\([^)]*\\))\\s*\\{`, 'g'),
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      const braceIdx = cleaned.indexOf('{', m.index);
      if (braceIdx === -1) continue;
      const body = extractBlock(cleaned, braceIdx);
      if (body !== null) results.push({ body, index: m.index });
    }
  }
  return results;
}

function getFirstNonTrivialLine(body: string): string {
  const lines = body.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0 && !l.startsWith('//'));
  return lines[0] || '';
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPrecedingScope(code: string, position: number, chars: number): string {
  const start = Math.max(0, position - chars);
  return code.substring(start, position);
}

// ═══════════════════════════════════════════════
// ADV-01: IDENTITY GATE ABSENT
// ═══════════════════════════════════════════════

export const ADV01_IDENTITY_GATE_ABSENT: ViolationDetector = {
  id: 'ADV-01',
  category: 'identity-scoping',
  description: 'Identity Gate Absent — hook handler without agent identity check as first instruction before state mutation or identity injection',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const identityBearingHooks = [
      'chat.message',
      'tool.execute.before',
      'experimental.chat.system.transform',
    ];
    for (const hookName of identityBearingHooks) {
      const handlers = findHookHandlers(code, hookName);
      for (const { body, index } of handlers) {
        const stripped = body.trim();
        if (stripped.length === 0) continue;
        const firstLines = stripped.split('\n').slice(0, 8).join('\n');
        const hasIdentityGate = /(?:agent\s*[!=]==?\s*['"]|agentName\s*[!=]==?\s*['"]|startsWith\s*\(\s*['"]|\bagents?\s*\.\s*includes\s*\()/.test(firstLines);
        const hasEarlyReturn = /(?:return\s*;|return\s*$|return\s*\{?\s*\}?\s*;?\s*$)/m.test(firstLines);
        const hasMutations = /(?:\.\s*(?:push|set|delete|splice|mode|status|layer|state)\s*[=(]|orchestrator\.|output\s*[.=]|out\s*[.=]|sys\s*\.\s*system)/.test(body);
        if (hasMutations && !hasIdentityGate && !hasEarlyReturn) return true;
      }
    }
    return false;
  },
  fix: 'Add identity gate as FIRST instruction in every hook: `const agent = input?.session?.agentName ?? (input?.agent || ""); if (!agent) return; if (agent !== "MY_AGENT" && !agent.startsWith("MY_PREFIX_")) return;` — before any state mutation or identity injection.',
};

// ═══════════════════════════════════════════════
// ADV-02: IDENTITY CHECK INCOMPLETE
// ═══════════════════════════════════════════════

export const ADV02_IDENTITY_CHECK_INCOMPLETE: ViolationDetector = {
  id: 'ADV-02',
  category: 'identity-scoping',
  description: 'Identity Check Incomplete — checks if agent exists but not if it is the CORRECT agent (existence ≠ identity)',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const identityBearingHooks = ['chat.message', 'tool.execute.before', 'experimental.chat.system.transform'];
    for (const hookName of identityBearingHooks) {
      const handlers = findHookHandlers(cleaned, hookName);
      for (const { body } of handlers) {
        const firstLines = body.split('\n').slice(0, 10).join('\n');
        const hasExistenceCheck = /if\s*\(\s*!?\s*(?:agent|agentName)\s*\)/.test(firstLines);
        if (!hasExistenceCheck) continue;
        const hasEqualityCheck = /(?:agent|agentName)\s*[!=]==?\s*['"][\w_-]+['"]/.test(firstLines);
        const hasStartsWith = /\.startsWith\s*\(\s*['"]/.test(firstLines);
        const hasIncludes = /\.includes\s*\(\s*(?:agent|agentName)\)/.test(firstLines);
        if (!hasEqualityCheck && !hasStartsWith && !hasIncludes) return true;
      }
    }
    return false;
  },
  fix: 'Replace existence-only check with identity equality: `if (!agent) return;` → `if (!agent) return; if (agent !== "MY_AGENT" && !agent.startsWith("MY_PREFIX_")) return;`. Existence checks protect against null, not against wrong agents.',
};

// ═══════════════════════════════════════════════
// ADV-03: SESSION STATE GLOBAL
// ═══════════════════════════════════════════════

export const ADV03_SESSION_STATE_GLOBAL: ViolationDetector = {
  id: 'ADV-03',
  category: 'identity-scoping',
  description: 'Session State Global — orchestrator state as module-level variable instead of session-scoped Map, causing cross-session state bleed',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const globalStatePatterns = [
      /(?:let|var)\s+(?:currentMode|currentLayer|currentStatus|orchestratorState)\s*[:=]/,
      /(?:let|var)\s+state\s*[:=]\s*\{[^}]*mode\s*:/,
    ];
    let hasGlobalState = false;
    for (const p of globalStatePatterns) {
      if (p.test(cleaned)) {
        hasGlobalState = true;
        break;
      }
    }
    if (!hasGlobalState) return false;
    const hasSessionMap = /Map\s*<\s*string\s*,\s*\w+\s*>|new\s+Map\s*\(\s*\)/.test(cleaned);
    if (hasSessionMap) {
      const sessionMapRefs = (cleaned.match(/\.get\s*\(\s*(?:sessionId|sessionID|id)\s*\)/g) || []).length;
      const globalStateRefs = (cleaned.match(/(?:currentMode|currentLayer)\s*[=.]/g) || []).length;
      if (sessionMapRefs >= globalStateRefs) return false;
    }
    const hasSessionParameter = /\b(?:sessionId|sessionID)\b/.test(cleaned);
    if (!hasSessionParameter) return false;
    return true;
  },
  fix: 'Use session-keyed state: `const stateMap = new Map<string, OrchestratorState>(); function getState(sessionId: string): OrchestratorState { if (!stateMap.has(sessionId)) stateMap.set(sessionId, createInitialState()); return stateMap.get(sessionId)!; }`. Never use module-level mutable state for multi-session data.',
};

// ═══════════════════════════════════════════════
// ADV-04: TOOL BLACKLIST APPROACH
// ═══════════════════════════════════════════════

export const ADV04_TOOL_BLACKLIST_APPROACH: ViolationDetector = {
  id: 'ADV-04',
  category: 'firewall-bypass',
  description: 'Tool Blacklist Approach — blocking specific tool names instead of using an allowlist, leaving newly-added tools unblocked',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const blacklistPatterns = [
      /BLOCKED[_\s]*(?:TOOLS|LIST|NAMES)\s*[:=]\s*\[/,
      /(?:blocked|forbidden|banned)\s*(?:tools?)?\s*[:=]\s*\[/i,
      /\[\s*['"](?:edit|write|bash|spawn|task|todowrite)['"]/,
    ];
    let hasBlacklist = false;
    for (const p of blacklistPatterns) {
      if (p.test(cleaned)) {
        hasBlacklist = true;
        break;
      }
    }
    if (!hasBlacklist) return false;
    const hasAllowlist = /(?:ALLOWED|WHITELIST|PERMITTED|ALLOW)\s*[_\s]*(?:TOOLS|LIST|NAMES)\s*[:=]/i.test(cleaned);
    const hasAllowlistSet = /new\s+Set\s*\(\s*\[[\s\S]*?\]\s*\)\s*\.\s*has\s*\(/.test(cleaned);
    if (hasAllowlist || hasAllowlistSet) return false;
    return true;
  },
  fix: 'Replace blacklist with allowlist: `const ALLOWED_TOOLS = new Set(["read", "grep", "glob"]); if (!ALLOWED_TOOLS.has(tool)) { throw new Error("TOOL BLOCKED: " + tool); }`. Blacklists are always incomplete — new plugins/tools are invisible to them.',
};

// ═══════════════════════════════════════════════
// ADV-05: PREFIX VARIANT GAP
// ═══════════════════════════════════════════════

export const ADV05_PREFIX_VARIANT_GAP: ViolationDetector = {
  id: 'ADV-05',
  category: 'firewall-bypass',
  description: 'Prefix Variant Gap — blocking underscore prefix (manta_) but not hyphen variant (manta-), creating invisible firewall holes',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const knownPrefixes = ['manta', 'shark', 'kraken', 'trident', 'spider', 'hydra'];
    for (const prefix of knownPrefixes) {
      const underscoreBlocked = new RegExp(
        `(?:startsWith|includes|indexOf)\\s*\\(\\s*['"]${prefix}_`
      ).test(cleaned);
      const hyphenBlocked = new RegExp(
        `(?:startsWith|includes|indexOf)\\s*\\(\\s*['"]${prefix}-`
      ).test(cleaned);
      if (underscoreBlocked && !hyphenBlocked) return true;
    }
    return false;
  },
  fix: 'Block BOTH prefix variants: `if (tool.startsWith("manta_") || tool.startsWith("manta-"))`. OpenCode tools use BOTH underscore and hyphen separators. Blocking only one variant leaves the other as an open bypass.',
};

// ═══════════════════════════════════════════════
// ADV-06: TOOL BLOCK WITHOUT IDENTITY GATE
// ═══════════════════════════════════════════════

export const ADV06_TOOL_BLOCK_NO_IDENTITY_GATE: ViolationDetector = {
  id: 'ADV-06',
  category: 'firewall-bypass',
  description: 'Tool Block Without Identity Gate — tool.execute.before blocks tools without checking agent identity first, blocking ALL agents',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const handlers = findHookHandlers(cleaned, 'tool.execute.before');
    for (const { body, index } of handlers) {
      const firstLine = getFirstNonTrivialLine(body);
      const bodyLines = body.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      const identityGateLines = bodyLines.slice(0, 5);
      const hasIdentityInFirst5 = identityGateLines.some(line =>
        /(?:agent|agentName)\s*[!=]==?\s*['"]/.test(line) ||
        /startsWith\s*\(\s*['"]/.test(line) ||
        /\bagents?\s*\.\s*includes\s*\(/.test(line)
      );
      if (hasIdentityInFirst5) continue;
      const hasToolBlocking = /(?:BLOCKED|block|throw|Error)\b/.test(body);
      if (hasToolBlocking) return true;
    }
    return false;
  },
  fix: 'Add identity gate as FIRST instruction in tool.execute.before: `const agent = input?.session?.agentName || ""; if (agent !== "MY_AGENT") return;` — then block tools. Without this, you block tools for ALL agents including shark, manta, build, plan.',
};

// ═══════════════════════════════════════════════
// ADV-07: STUB OUTPUT LENGTH
// ═══════════════════════════════════════════════

export const ADV07_STUB_OUTPUT_LENGTH: ViolationDetector = {
  id: 'ADV-07',
  category: 'adversarial-pattern',
  description: 'Stub Output Length — mode activation or layer template functions returning hardcoded strings under 200 characters (theatrical stub)',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const templateFuncPatterns = [
      /(?:function\s+(?:handle|get|generate|create|build)(?:\w*)(?:Mode|Layer|Template|Activation|Banner|Identity|Response))/g,
      /(?:const|let)\s+(?:handle|get|generate|create|build)(?:\w*)(?:Mode|Layer|Template|Activation|Banner|Identity|Response)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function)/g,
    ];
    for (const re of templateFuncPatterns) {
      let m;
      while ((m = re.exec(cleaned)) !== null) {
        const braceIdx = cleaned.indexOf('{', m.index);
        if (braceIdx === -1) continue;
        const body = extractBlock(cleaned, braceIdx);
        if (body === null) continue;
        const returnMatches = body.match(/return\s*`([^`]*)`/g) || [];
        const returnDoubleQuote = body.match(/return\s*"([^"]*)"/g) || [];
        const returnSingleQuote = body.match(/return\s*'([^']*)'/g) || [];
        const allReturns = [...returnMatches, ...returnDoubleQuote, ...returnSingleQuote];
        for (const ret of allReturns) {
          const contentMatch = ret.match(/return\s*[`"']([^`"']*)[`"']/);
          if (contentMatch) {
            const content = contentMatch[1].replace(/\$\{[^}]*\}/g, 'XXXX');
            if (content.length < 200 && content.length > 0) {
              const hasStructuredContent = /(?:#{1,3}\s|\*\*|-\s*\[|:\s*\d|LAYER|MODE|GATE)/.test(content);
              if (!hasStructuredContent) return true;
            }
          }
        }
        const templateLiteralReturns = body.match(/return\s*`([\s\S]*?)`/g) || [];
        for (const ret of templateLiteralReturns) {
          const inner = ret.replace(/^return\s*`/, '').replace(/`$/, '');
          const expandedContent = inner.replace(/\$\{[^}]*\}/g, 'X'.repeat(20));
          if (expandedContent.length < 100) return true;
        }
      }
    }
    return false;
  },
  fix: 'Every mode activation must return 200+ characters with structured template content: headers, fillable fields, gate requirements, checkboxes. A 27-char string like "Mode is active." is a theatrical stub — it exists but does nothing.',
};

// ═══════════════════════════════════════════════
// ADV-08: EMPTY COLLECTION CONSENSUS
// ═══════════════════════════════════════════════

export const ADV08_EMPTY_COLLECTION_CONSENSUS: ViolationDetector = {
  id: 'ADV-08',
  category: 'adversarial-pattern',
  description: 'Empty Collection Consensus — Set.size or .every() used for consensus/validation without zero-length guard',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const consensusRe = /new\s+Set\s*\([^)]*\)\s*\.size\s*(?:<=|===?)\s*[01]/g;
    let m;
    while ((m = consensusRe.exec(cleaned)) !== null) {
      const region = cleaned.substring(Math.max(0, m.index - 600), m.index + m[0].length + 200);
      const hasLengthGuard = /\.length\s*(?:===|!==|>|<)\s*0|\.length\s*>\s*0|if\s*\([^)]*\.length/.test(region);
      const hasCompletedGuard = /completed\s*\.\s*length\s*(?:===|!|>|<)/.test(region);
      if (!hasLengthGuard && !hasCompletedGuard) return true;
    }
    const everyConsensusRe = /\.\s*every\s*\(\s*(?:\([^)]*\)\s*=>|[\w]+)\s*=>/g;
    while ((m = everyConsensusRe.exec(cleaned)) !== null) {
      const region = cleaned.substring(Math.max(0, m.index - 300), m.index + 200);
      const isConsensus = /consensus|verif|valid|agree|all\s*(?:same|equal|match)/i.test(region);
      if (isConsensus) {
        const hasLengthGuard = /\.length\s*(?:>|!==?\s*0)/.test(region);
        const hasIfGuard = /if\s*\([^)]*\.length/.test(region);
        if (!hasLengthGuard && !hasIfGuard) return true;
      }
    }
    return false;
  },
  fix: 'Guard collection consensus: `if (completed.length === 0) return { consensus: false, error: "Cannot verify with 0 results" }; const outputs = new Set(completed.map(s => s.output.trim())); consensus = outputs.size === 1;` — `[].every()` returns true, `new Set([]).size <= 1` is true.',
};

// ═══════════════════════════════════════════════
// ADV-09: HARDCODED LAYER CEILING
// ═══════════════════════════════════════════════

export const ADV09_HARDCODED_LAYER_CEILING: ViolationDetector = {
  id: 'ADV-09',
  category: 'lifecycle-violation',
  description: 'Hardcoded Layer Ceiling — advanceLayer with hardcoded max (e.g., >= 3) instead of mode-specific getMaxLayers()',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const advancePatterns = [
      /(?:advanceLayer|advance)\s*\(\s*\)\s*:\s*(?:boolean|void)\s*\{[^}]*(?:currentLayer|layer)\s*>[=]?\s*\d/g,
      /if\s*\(\s*(?:this\s*\.\s*)?(?:currentLayer|layer)\s*>[=]?\s*(3|4|5|6)\s*\)\s*\{[^}]*COMPLETE/g,
    ];
    for (const re of advancePatterns) {
      let m;
      while ((m = re.exec(cleaned)) !== null) {
        const region = cleaned.substring(Math.max(0, m.index - 200), m.index + m[0].length + 400);
        const hasGetMax = /getMaxLayers|maxLayers|MAX_LAYERS|maxLayersForMode/.test(region);
        const hasModeSpecificMax = /(?:mode|Mode)\s*[!=]==?\s*\w*\.\s*\w+.*(?:return|=>)\s*\d/.test(region);
        if (!hasGetMax && !hasModeSpecificMax) return true;
      }
    }
    const directCompareRe = /(?:currentLayer|layer)\s*>[=]?\s*([3-9])\b/g;
    let dm;
    while ((dm = directCompareRe.exec(cleaned)) !== null) {
      const region = cleaned.substring(Math.max(0, dm.index - 300), dm.index + 300);
      const hasComplete = /COMPLETE|complete|status/.test(region);
      if (hasComplete) {
        const hasDynamicMax = /getMax|maxLayer|modeLayer|layerMax/.test(cleaned);
        if (!hasDynamicMax) return true;
      }
    }
    return false;
  },
  fix: 'Replace hardcoded layer max with mode-specific getter: `advanceLayer(): boolean { const max = this.getMaxLayers(); if (this.state.currentLayer >= max) { this.state.status = "COMPLETE"; return false; } this.state.currentLayer++; return true; }` — different modes have different layer counts.',
};

// ═══════════════════════════════════════════════
// ADV-10: PASSIVE ORCHESTRATION
// ═══════════════════════════════════════════════

export const ADV10_PASSIVE_ORCHESTRATION: ViolationDetector = {
  id: 'ADV-10',
  category: 'lifecycle-violation',
  description: 'Passive Orchestration — function returns passive status JSON (dispersed: true, spawned: true) without performing actual work',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const passiveReturnRe = /\breturn\s*\{[^}]*(?:dispersed|spawned|active|created|completed|processed|stored)\s*:\s*true/g;
    let m;
    while ((m = passiveReturnRe.exec(cleaned)) !== null) {
      const braceIdx = cleaned.lastIndexOf('{', m.index + m[0].indexOf('{'));
      if (braceIdx === -1) continue;
      const funcStart = findEnclosingFunctionStart(cleaned, braceIdx);
      if (funcStart === null) continue;
      const funcBody = cleaned.substring(funcStart, m.index);
      const hasCall = /\w+\s*\(/.test(funcBody);
      const hasSpawn = /spawn|exec|fork|task\(|run_|subagent|parallel/.test(funcBody);
      const hasWrite = /write|mkdir|create|send|emit/.test(funcBody);
      const hasFetch = /fetch|request|post|put/.test(funcBody);
      if (!hasCall) return true;
      if (!hasSpawn && !hasWrite && !hasFetch) {
        const onlyCallsAreGets = /^\s*(?:get|read|log|console|JSON|parse|Math)\b/m.test(funcBody.trim());
        if (onlyCallsAreGets) return true;
      }
    }
    return false;
  },
  fix: 'Every function claiming success must PERFORM the work. If spawning: actually call spawn. If dispersing: return action_required with exact spawn commands. Passive JSON status without side effects is theatrical — it claims reality without changing it.',
};

// ═══════════════════════════════════════════════
// ADV-11: FABRICATED PATH RETURN
// ═══════════════════════════════════════════════

export const ADV11_FABRICATED_PATH_RETURN: ViolationDetector = {
  id: 'ADV-11',
  category: 'lifecycle-violation',
  description: 'Fabricated Path Return — function returns a file/directory path without performing the filesystem write/mkdir to create it',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const pathReturnRe = /\breturn\s*\{[^}]*(?:evidencePath|filePath|outputPath|resultPath|dirPath|folderPath|logPath|reportPath)\s*:/g;
    let m;
    while ((m = pathReturnRe.exec(cleaned)) !== null) {
      const braceIdx = cleaned.lastIndexOf('{', m.index + m[0].indexOf('{'));
      if (braceIdx === -1) continue;
      const funcStart = findEnclosingFunctionStart(cleaned, braceIdx);
      if (funcStart === null) continue;
      const funcBody = cleaned.substring(funcStart, m.index + m[0].length + 50);
      const hasFsWrite = /writeFile|writeFileSync|mkdir|mkdirSync|mkdirSync|createWriteStream|Bun\.write|fs\s*\.\s*write/.test(funcBody);
      const hasPathJoin = /path\.join|path\.resolve/.test(funcBody);
      if (hasPathJoin && !hasFsWrite) return true;
      if (!hasFsWrite && !hasPathJoin) {
        const hasPathTemplate = /`[^`]*\/(?:evidence|output|result|report|log)s?\/[^`]*`/.test(funcBody);
        if (hasPathTemplate) return true;
      }
    }
    return false;
  },
  fix: 'If you return a path, you must CREATE it: `fs.mkdirSync(dirPath, { recursive: true }); fs.writeFileSync(filePath, content); return { evidencePath: filePath };`. Returning a path that was never created is evidence fabrication.',
};

// ═══════════════════════════════════════════════
// ADV-12: MODE ROUTING FIRST
// ═══════════════════════════════════════════════

export const ADV12_MODE_ROUTING_FIRST: ViolationDetector = {
  id: 'ADV-12',
  category: 'adversarial-pattern',
  description: 'Mode Routing First — mode detection/switching executed before universal commands (identity, status, help, reset), breaking IDLE state',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const handlers = findHookHandlers(cleaned, 'chat.message');
    for (const { body } of handlers) {
      const lines = body.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0 && !l.startsWith('//'));
      const identityCheckEnd = Math.min(lines.length, 10);
      const first10 = lines.slice(0, identityCheckEnd).join('\n');
      const hasIdentityGate = /(?:agent\s*[!=]==?\s*['"]|startsWith\s*\(\s*['"])/.test(first10);
      if (!hasIdentityGate) continue;
      const afterGateLines = lines.slice(0, 20);
      let modeDetectionIdx = -1;
      let universalCmdIdx = -1;
      for (let i = 0; i < afterGateLines.length; i++) {
        const line = afterGateLines[i];
        if (modeDetectionIdx === -1 && /detectAndSwitch|intentDetect|detectMode|switchMode/i.test(line)) {
          modeDetectionIdx = i;
        }
        if (universalCmdIdx === -1 && /(?:identity|status|help|reset|who\s*are\s*you)/i.test(line) && /\breturn\b/.test(line)) {
          universalCmdIdx = i;
        }
      }
      if (modeDetectionIdx !== -1 && universalCmdIdx !== -1 && modeDetectionIdx < universalCmdIdx) return true;
      if (modeDetectionIdx !== -1 && universalCmdIdx === -1) {
        const hasUniversalKeyword = /['"](?:who are you|status|help|reset)['"]/.test(body);
        if (hasUniversalKeyword) return true;
      }
    }
    return false;
  },
  fix: 'Route universal commands BEFORE mode detection: `const parsed = parseMessage(msg); if (parsed.action === "identity") return getIdentityResponse(); if (parsed.action === "status") return getStatusResponse(); if (parsed.action === "reset") { orchestrator.reset(); return "Reset."; } const mode = orchestrator.detectAndSwitch(msg);`',
};

// ═══════════════════════════════════════════════
// ADV-13: INTENT THRESHOLD EXCESSIVE
// ═══════════════════════════════════════════════

export const ADV13_INTENT_THRESHOLD_EXCESSIVE: ViolationDetector = {
  id: 'ADV-13',
  category: 'adversarial-pattern',
  description: 'Intent Threshold Excessive — intent detection threshold > 0.4, preventing single-keyword activation ("plan", "debug", "audit")',
  severity: 'medium',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const thresholdPatterns = [
      /IntentDetector\s*\(\s*(0\.[5-9]\d*|1\.0)\s*\)/,
      /threshold\s*[:=]\s*(0\.[5-9]\d*|1\.0)\s*[;,]/,
      /INTENT_THRESHOLD\s*[:=]\s*(0\.[5-9]\d*|1\.0)\s*[;,]/,
      /score\s*>=?\s*(0\.[5-9]\d*)\s*[;&|]/,
    ];
    for (const p of thresholdPatterns) {
      const m = p.exec(cleaned);
      if (m) {
        const value = parseFloat(m[1]);
        if (value > 0.4) return true;
      }
    }
    return false;
  },
  fix: 'Lower intent threshold to 0.35 or below: `new IntentDetector(0.35)`. Single keywords ("plan", "debug", "audit") add ~0.35 to score. Threshold of 0.6 means they never reach activation — only natural language phrases work.',
};

// ═══════════════════════════════════════════════
// ADV-14: THEATRICAL ARG INJECTION
// ═══════════════════════════════════════════════

export const ADV14_THEATRICAL_ARG_INJECTION: ViolationDetector = {
  id: 'ADV-14',
  category: 'adversarial-pattern',
  description: 'Theatrical Arg Injection — banned theatrical patterns (mock, stub, fake it, fallback to X) not blocked in tool argument inspection',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const hasToolBeforeHandler = findHookHandlers(cleaned, 'tool.execute.before').length > 0;
    if (!hasToolBeforeHandler) return false;
    const handlers = findHookHandlers(cleaned, 'tool.execute.before');
    for (const { body } of handlers) {
      const hasArgInspection = /(?:args|arguments|input\.\w+)\s*[.[]/.test(body);
      if (!hasArgInspection) continue;
      const blocksTheatrical = /(?:mock|stub|fake|fallback|switch\s+to|host\s+testing|already\s+proved)/i.test(body);
      if (blocksTheatrical) return false;
    }
    const hasTheatricalPatterns = /['"](?:use a mock|stub this|fake it|fallback to|switch to|host testing already)/i.test(cleaned);
    if (hasTheatricalPatterns) {
      const hasBlock = /THEATRICAL\s*BLOCK|theatrical.*block|blockTheatrical/i.test(cleaned);
      if (!hasBlock) return true;
    }
    return false;
  },
  fix: 'Add theatrical pattern blocking in tool.execute.before: `const THEATRICAL = ["mock", "stub", "fake it", "fallback to", "switch to", "host testing already"]; if (THEATRICAL.some(p => args?.message?.includes(p))) throw new Error("THEATRICAL BLOCK: " + p);`',
};

// ═══════════════════════════════════════════════
// ADV-15: CONFIG WILDCARD PERMISSION
// ═══════════════════════════════════════════════

export const ADV15_CONFIG_WILDCARD_PERMISSION: ViolationDetector = {
  id: 'ADV-15',
  category: 'firewall-bypass',
  description: 'Config Wildcard Permission — wildcard permission {"*": {"*": "allow"}} overrides all tool isolation in deployment',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const wildcardPatterns = [
      /permission\s*:\s*\{[^}]*['"]\*['"]\s*:\s*\{[^}]*['"]\*['"]\s*:\s*['"]allow['"]/,
      /['"]\*['"]\s*:\s*\{[^}]*['"]\*['"]\s*:\s*['"]allow['"]/,
      /permission\s*:\s*\{[^}]*['"]\*['"]\s*:\s*['"]allow['"]/,
    ];
    const hasWildcard = wildcardPatterns.some((p: RegExp) => p.test(cleaned));
    if (!hasWildcard) return false;
    const isTestConfig = /test|snap|\/tmp\/|mock|fixture/i.test(ctx.filePath) ||
      /test|snap|\/tmp\//i.test(cleaned.substring(0, 500));
    const isDocumentingAnti = /(?:anti.pattern|wrong|don't|do not|banned|never|avoid)/i.test(
      getPrecedingScope(cleaned, cleaned.search(wildcardPatterns.find((p: RegExp) => p.test(cleaned))!), 300)
    );
    return !isTestConfig && !isDocumentingAnti;
  },
  fix: 'Remove wildcard permissions: delete any `{"*": {"*": "allow"}}` or `{"*": "allow"}` from deployment config. Use explicit per-agent permissions. Wildcard perms make every tool on the system available, negating all tool isolation.',
};

// ═══════════════════════════════════════════════
// ADV-16: SINGLE AGENT TEST COVERAGE
// ═══════════════════════════════════════════════

export const ADV16_SINGLE_AGENT_TEST_COVERAGE: ViolationDetector = {
  id: 'ADV-16',
  category: 'adversarial-pattern',
  description: 'Single Agent Test Coverage — test file only tests own agent, missing cross-agent isolation verification',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    if (ctx.gate !== 'TEST' && ctx.gate !== 'VERIFY' && !/test|spec|adversarial/i.test(ctx.filePath)) return false;
    const cleaned = stripComments(code);
    const isTestFile = /\b(describe|it\(|test\(|assert|expect)\b/.test(cleaned) ||
      /Phase\s+\d|TC-\d/i.test(cleaned);
    if (!isTestFile) return false;
    const hasIdentityTest = /identity|agentName|agent.*check|cross.agent|isolation/i.test(cleaned);
    if (!hasIdentityTest) return false;
    const ownAgentPattern = /agentName\s*:\s*['"][\w-]+['"]/g;
    const agentNames = new Set<string>();
    let am;
    while ((am = ownAgentPattern.exec(cleaned)) !== null) {
      const name = am[0].match(/['"]([\w-]+)['"]/)?.[1];
      if (name) agentNames.add(name);
    }
    if (agentNames.size <= 1) {
      const hasCrossAgentTest = /shark|build|plan|general|foreign|other.*agent|wrong.*agent/i.test(cleaned);
      if (!hasCrossAgentTest) return true;
    }
    return false;
  },
  fix: 'Test EVERY hook with at least 3 non-own agents: `for (const foreign of ["shark", "build", "general"]) { let out = {}; await hooks["chat.message"]({message:{content:"who are you"}, session:{agentName: foreign}}, out); assert(!out.content, foreign + " got identity — LEAK!"); }`',
};

// ═══════════════════════════════════════════════
// HELPER: FIND ENCLOSING FUNCTION START
// ═══════════════════════════════════════════════

function findEnclosingFunctionStart(code: string, position: number): number | null {
  let depth = 0;
  for (let i = position - 1; i >= 0; i--) {
    if (code[i] === '}') depth++;
    else if (code[i] === '{') {
      if (depth > 0) { depth--; continue; }
      const before = code.substring(Math.max(0, i - 100), i);
      if (/(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*(?:=>|\{))\s*$/.test(before)) {
        return i;
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════
// ENFORCEMENT RULES
// ═══════════════════════════════════════════════

export const ADVERSARIAL_PRESSURE_ENFORCEMENT_RULES: EnforcementRule[] = [
  {
    detector: ADV01_IDENTITY_GATE_ABSENT,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: ADV02_IDENTITY_CHECK_INCOMPLETE,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: ADV03_SESSION_STATE_GLOBAL,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: ADV04_TOOL_BLACKLIST_APPROACH,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: true,
  },
  {
    detector: ADV05_PREFIX_VARIANT_GAP,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: true,
  },
  {
    detector: ADV06_TOOL_BLOCK_NO_IDENTITY_GATE,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: ADV07_STUB_OUTPUT_LENGTH,
    enforcementAction: 'flag',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: ADV08_EMPTY_COLLECTION_CONSENSUS,
    enforcementAction: 'block',
    escalationTarget: 'execution',
    autoFixable: false,
  },
  {
    detector: ADV09_HARDCODED_LAYER_CEILING,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: true,
  },
  {
    detector: ADV10_PASSIVE_ORCHESTRATION,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: ADV11_FABRICATED_PATH_RETURN,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: ADV12_MODE_ROUTING_FIRST,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: false,
  },
  {
    detector: ADV13_INTENT_THRESHOLD_EXCESSIVE,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: true,
  },
  {
    detector: ADV14_THEATRICAL_ARG_INJECTION,
    enforcementAction: 'flag',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: ADV15_CONFIG_WILDCARD_PERMISSION,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: true,
  },
  {
    detector: ADV16_SINGLE_AGENT_TEST_COVERAGE,
    enforcementAction: 'flag',
    escalationTarget: 'gate',
    autoFixable: false,
  },
];

// ═══════════════════════════════════════════════
// ALL DETECTORS MAP
// ═══════════════════════════════════════════════

const ALL_ADVERSARIAL_DETECTORS: Readonly<Record<string, ViolationDetector>> = {
  'ADV-01': ADV01_IDENTITY_GATE_ABSENT,
  'ADV-02': ADV02_IDENTITY_CHECK_INCOMPLETE,
  'ADV-03': ADV03_SESSION_STATE_GLOBAL,
  'ADV-04': ADV04_TOOL_BLACKLIST_APPROACH,
  'ADV-05': ADV05_PREFIX_VARIANT_GAP,
  'ADV-06': ADV06_TOOL_BLOCK_NO_IDENTITY_GATE,
  'ADV-07': ADV07_STUB_OUTPUT_LENGTH,
  'ADV-08': ADV08_EMPTY_COLLECTION_CONSENSUS,
  'ADV-09': ADV09_HARDCODED_LAYER_CEILING,
  'ADV-10': ADV10_PASSIVE_ORCHESTRATION,
  'ADV-11': ADV11_FABRICATED_PATH_RETURN,
  'ADV-12': ADV12_MODE_ROUTING_FIRST,
  'ADV-13': ADV13_INTENT_THRESHOLD_EXCESSIVE,
  'ADV-14': ADV14_THEATRICAL_ARG_INJECTION,
  'ADV-15': ADV15_CONFIG_WILDCARD_PERMISSION,
  'ADV-16': ADV16_SINGLE_AGENT_TEST_COVERAGE,
};

// ═══════════════════════════════════════════════
// VALIDATION FUNCTION
// ═══════════════════════════════════════════════

export interface AdversarialValidationResult {
  passed: boolean;
  violations: Array<{
    detectorId: string;
    category: string;
    severity: 'critical' | 'high' | 'medium';
    description: string;
    fix: string;
    enforcementAction: string;
  }>;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    blocked: boolean;
  };
}

export function detectAdversarialViolations(
  code: string,
  context: CodeContext,
): AdversarialValidationResult {
  const violations: AdversarialValidationResult['violations'] = [];

  for (const rule of ADVERSARIAL_PRESSURE_ENFORCEMENT_RULES) {
    if (rule.detector.detect(code, context)) {
      violations.push({
        detectorId: rule.detector.id,
        category: rule.detector.category,
        severity: rule.detector.severity,
        description: rule.detector.description,
        fix: rule.detector.fix,
        enforcementAction: rule.enforcementAction,
      });
    }
  }

  const critical = violations.filter((v: { severity: string; enforcementAction: string }) => v.severity === 'critical').length;
  const high = violations.filter((v: { severity: string; enforcementAction: string }) => v.severity === 'high').length;
  const medium = violations.filter((v: { severity: string; enforcementAction: string }) => v.severity === 'medium').length;
  const blocked = violations.some((v: { severity: string; enforcementAction: string }) => v.enforcementAction === 'block');

  return {
    passed: violations.length === 0,
    violations,
    summary: {
      total: violations.length,
      critical,
      high,
      medium,
      blocked,
    },
  };
}

export function getAdversarialDetectorById(id: string): ViolationDetector | undefined {
  return ALL_ADVERSARIAL_DETECTORS[id];
}
