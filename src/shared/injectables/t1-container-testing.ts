/**
 * T1 Injectable: Container Testing Enforcement
 *
 * @deprecated Replaced by honesty-engine/ and candidate-generator.ts.
 * Retained for backward compatibility. New violations should be added to the
 * honesty-engine/ directory or candidate-generator.ts instead.
 *
 * Distilled from RUNTIME_GRADE_CONTAINER_TESTING_BIBLE.md v1.0.0
 * Fractal integration of runtime-grade engineering + T2 TUI testing +
 * adversarial pressure. Covers pre-flight checks (F6 prevention),
 * anti-derailment enforcement (E1-E9), uncovered gaps (G1-G8),
 * evidence completeness, and the anti-derailment fractal rule (§25).
 *
 * DESIGN RULES:
 *   - Semantic detection — structural + context, not just regex
 *   - Pure functions: (code, context) => boolean (true = violation)
 *   - No false positives — valid patterns must not trigger
 *   - Maps to container testing bible sections for gate integration
 *
 * DETECTOR INDEX:
 *   CT-01  PREFLIGHT_WRONG_PROJECT_DIR      — imports/paths referencing wrong project root
 *   CT-02  PREFLIGHT_DUPLICATE_SOURCE_TREES — duplicate src/ directories without designation
 *   CT-03  PREFLIGHT_AGENT_NAME_MISMATCH    — registered agent name ≠ expected project agent
 *   CT-04  PREFLIGHT_MISSING_IDENTITY       — plugin entry without agent identity registration
 *   CT-05  ANTIDERAIL_TRUST_CLAIM           — "trust me" / "I verified it" without evidence mechanism
 *   CT-06  ANTIDERAIL_SKIP_CONTAINER_TEST   — code that short-circuits or bypasses container testing
 *   CT-07  ANTIDERAIL_SELF_DECLARE          — agent returning completion status without evidence checks
 *   CT-08  ANTIDERAIL_BUNDLE_EQUIVOCATION   — bundle/typecheck success treated as testing evidence
 *   CT-09  GAP_MOCK_INTEGRATION             — mock patterns (jest.fn, mockResolvedValue) in integration tests
 *   CT-10  GAP_PLACEHOLDER_VALIDATION       — empty object {} passed to validation/verification functions
 *   CT-11  GAP_UNDOCUMENTED_FAILURE         — exported functions missing failure mode documentation
 *   CT-12  GAP_DEAD_EXPORT                  — exported symbols with no reachable call site
 *   CT-13  GAP_EMPTY_CONFIG_PATTERNS        — runtime config with empty patterns/rules arrays
 *   CT-14  GAP_PRESERVED_FILE_VIOLATION     — modifications to files marked PRESERVED in anchor
 *   CT-15  EVIDENCE_INCOMPLETE              — test code missing required evidence file generation
 *   CT-16  EVIDENCE_FABRICATED              — hardcoded/fabricated evidence content without runtime data
 */

import type { CodeContext, ViolationDetector, EnforcementRule } from './t1-runtime-grade-engineering';
import { stripComments } from '../pipeline/strip-comments';

// ═══════════════════════════════════════════════
// STRUCTURAL HELPERS
// ═══════════════════════════════════════════════
// stripComments imported from shared/pipeline/strip-comments

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

function getPrecedingScope(code: string, position: number, chars: number): string {
  const start = Math.max(0, position - chars);
  return code.substring(start, position);
}

function getTrailingScope(code: string, position: number, chars: number): string {
  return code.substring(position, Math.min(code.length, position + chars));
}

// ═══════════════════════════════════════════════
// CT-01: PREFLIGHT WRONG PROJECT DIR
// ═══════════════════════════════════════════════

export const CT01_PREFLIGHT_WRONG_PROJECT_DIR: ViolationDetector = {
  id: 'CT-01',
  category: 'preflight',
  description: 'Pre-Flight Wrong Project Directory — imports or file operations reference a source tree outside the designated project root (Shark v4.9.7 F6)',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const knownAgents = ['shark', 'manta', 'spider', 'kraken', 'trident', 'hydra'];
    const thisAgent = ctx.filePath.split('/').find(p => knownAgents.some(a => p.toLowerCase().includes(a))) || '';
    const thisAgentLower = thisAgent.toLowerCase();
    if (!thisAgentLower) return false;

    const wrongAgentImports: RegExp[] = [];
    for (const agent of knownAgents) {
      if (thisAgentLower.includes(agent)) continue;
      wrongAgentImports.push(
        new RegExp(`import\\s+.*from\\s+['"][^'"]*\\b${agent}[^/]*\\b/src/`, 'i'),
        new RegExp(`from\\s+['"][^'"]*\\b${agent}\\b.*agent[^/]*\\b/src/`, 'i'),
      );
    }

    for (const re of wrongAgentImports) {
      if (re.test(cleaned)) return true;
    }

    const pathRefs = cleaned.match(/['"]([\./]+[^'"]*src[^'"]*)['"]/g) || [];
    for (const ref of pathRefs) {
      const inner = ref.replace(/^['"]|['"]$/g, '');
      for (const agent of knownAgents) {
        if (thisAgentLower.includes(agent)) continue;
        if (inner.toLowerCase().includes(agent) && inner.includes('src')) return true;
      }
    }

    const copyOps = /(?:cp\s+-r|shutil\.copytree|fs\.copy|cloneDir|duplicateSource)/i.test(cleaned);
    if (copyOps) {
      const hasDestinationCheck = /DEST_DIR|DESIGNATED|PROJECT_DIR|targetDir|outputDir/.test(cleaned);
      if (!hasDestinationCheck) return true;
    }

    return false;
  },
  fix: 'Verify project directory before any file operation: `const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, ".."); if (!fs.existsSync(path.join(PROJECT_ROOT, "src"))) throw new Error("Wrong project directory");` — §15 Phase 0 requires pwd verification.',
};

// ═══════════════════════════════════════════════
// CT-02: PREFLIGHT DUPLICATE SOURCE TREES
// ═══════════════════════════════════════════════

export const CT02_PREFLIGHT_DUPLICATE_SOURCE_TREES: ViolationDetector = {
  id: 'CT-02',
  category: 'preflight',
  description: 'Pre-Flight Duplicate Source Trees — build or test script operating on multiple src/ directories without explicit designation of which is canonical',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const isBuildOrTest = /\b(?:build|test|container|preflight|verify)\b/i.test(ctx.toolName) ||
      /\b(?:Makefile|build\.ts|test.*\.ts|container.*\.ts|preflight.*\.ts)\b/i.test(ctx.filePath);
    if (!isBuildOrTest) return false;

    const srcRefs = cleaned.match(/['"`]([^'"`]*\/src(?:\/|$))/g) || [];
    const uniqueDirs = new Set<string>();
    for (const ref of srcRefs) {
      const inner = ref.replace(/^['"`]|['"`]$/g, '');
      const normalized = inner.replace(/\/src\/.*$/, '/src').replace(/^\.\//, '');
      if (normalized.includes('/src')) uniqueDirs.add(normalized);
    }

    if (uniqueDirs.size <= 1) return false;

    const hasDesignation = /(?:DESIGNATED|CANONICAL|PRIMARY|PROJECT_ROOT|THIS_PROJECT)\s*(?:_SRC|_DIR|_ROOT)?/i.test(cleaned);
    const hasExplicitSelection = /const\s+\w+\s*=\s*(?:process\.env\.|config\.).*src/i.test(cleaned);
    if (hasDesignation || hasExplicitSelection) return false;

    return true;
  },
  fix: 'Explicitly designate the canonical source tree: `const SRC_DIR = process.env.PROJECT_SRC || path.resolve(__dirname, "src"); if (!fs.existsSync(SRC_DIR)) throw new Error("Designated src/ not found");` — Shark v4.9.7 found nearest src/ which was the wrong agent.',
};

// ═══════════════════════════════════════════════
// CT-03: PREFLIGHT AGENT NAME MISMATCH
// ═══════════════════════════════════════════════

export const CT03_PREFLIGHT_AGENT_NAME_MISMATCH: ViolationDetector = {
  id: 'CT-03',
  category: 'preflight',
  description: 'Pre-Flight Agent Name Mismatch — plugin registers an agent name that does not match the project identity (e.g., registers "manta" in a shark project)',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const isPluginEntry = /(?:index\.ts|plugin\.ts|main\.ts|entry\.ts)$/.test(ctx.filePath) ||
      /registerPlugin|register.*agent|export\s+default\s+function\s+plugin/i.test(cleaned.substring(0, 2000));
    if (!isPluginEntry) return false;

    const agentNamePatterns = [
      /agentName\s*:\s*['"](\w+)['"]/g,
      /register(?:Agent|Plugin)?\s*\(\s*['"](\w+)['"]/g,
      /name\s*:\s*['"](\w+)-agent['"]/g,
      /identity\s*:\s*\{[^}]*name\s*:\s*['"](\w+)['"]/g,
    ];

    const registeredNames = new Set<string>();
    for (const re of agentNamePatterns) {
      let m;
      while ((m = re.exec(cleaned)) !== null) registeredNames.add(m[1].toLowerCase());
    }
    if (registeredNames.size === 0) return false;

    const knownAgents = ['shark', 'manta', 'spider', 'kraken', 'trident', 'hydra'];
    const pathSegments = ctx.filePath.toLowerCase().split('/');
    const projectAgent = knownAgents.find(a => pathSegments.some(s => s.includes(a)));

    if (!projectAgent) return false;

    for (const name of registeredNames) {
      const isCorrectAgent = name.includes(projectAgent) || projectAgent.includes(name);
      if (!isCorrectAgent) {
        const isForeignAgent = knownAgents.some(a => a !== projectAgent && name.includes(a));
        if (isForeignAgent) return true;
      }
    }

    return false;
  },
  fix: 'Verify agent name matches project: the registration in index.ts must use the same agent name as the project identity. If building Shark, register "shark" — not "manta". Shark v4.9.7 registered "manta" because it was working in the wrong source tree.',
};

// ═══════════════════════════════════════════════
// CT-04: PREFLIGHT MISSING IDENTITY
// ═══════════════════════════════════════════════

export const CT04_PREFLIGHT_MISSING_IDENTITY: ViolationDetector = {
  id: 'CT-04',
  category: 'preflight',
  description: 'Pre-Flight Missing Identity — plugin entry point exports hooks but has no agent identity scoping in chat.message handler',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const isPluginEntry = /(?:index\.ts|plugin\.ts|main\.ts|entry\.ts)$/.test(ctx.filePath);
    if (!isPluginEntry) return false;

    const hasChatHook = /['"]chat\.message['"]\s*:/.test(cleaned) ||
      /hooks\s*\[\s*['"]chat\.message['"]\s*\]/.test(cleaned);
    const hasToolHook = /['"]tool\.execute\.before['"]\s*:/.test(cleaned) ||
      /hooks\s*\[\s*['"]tool\.execute\.before['"]\s*\]/.test(cleaned);
    if (!hasChatHook && !hasToolHook) return false;

    const hasIdentityGate = /(?:agent|agentName)\s*[!=]==?\s*['"][\w_-]+['"]/.test(cleaned) ||
      /\.startsWith\s*\(\s*['"][\w_-]+/.test(cleaned) ||
      /(?:ALLOWED_AGENTS|AGENT_IDENTITY|IDENTITY_PREFIX)\s*[:=]/i.test(cleaned);
    if (hasIdentityGate) return false;

    return true;
  },
  fix: 'Add identity scoping to every hook: `const agent = input?.session?.agentName || ""; if (agent !== "MY_AGENT" && !agent.startsWith("MY_AGENT_")) return;` — Phase 2 requires own agent gets identity, others get empty response.',
};

// ═══════════════════════════════════════════════
// CT-05: ANTIDERAIL TRUST CLAIM
// ═══════════════════════════════════════════════

export const CT05_ANTIDERAIL_TRUST_CLAIM: ViolationDetector = {
  id: 'CT-05',
  category: 'anti-derailment',
  description: 'Anti-Derailment Trust Claim — code or test asserting "it works", "verified", "all tests pass" without mechanical evidence verification (E3, E6)',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const isVerificationCode = /(?:verify|test|check|evidence|result|assert|validate|container)/i.test(ctx.filePath) ||
      /(?:verify|test|check|evidence|result)/i.test(ctx.toolName);
    if (!isVerificationCode) return false;

    const trustPatterns = [
      /(?:trust\s+me|it\s+works|i\s+verified|all\s+tests?\s+pass)/i,
      /['"](?:verified|confirmed|working|passed|all\s+good)['"]/i,
    ];

    let hasTrustClaim = false;
    for (const p of trustPatterns) {
      if (p.test(cleaned)) {
        hasTrustClaim = true;
        break;
      }
    }
    if (!hasTrustClaim) return false;

    const hasEvidenceMechanism = /ContainerSpawnResult|ContainerTestResult|TuiInteraction|EvidencePathVerified|\.json\s*$/i.test(cleaned);
    const hasDiskCheck = /fs\.existsSync|fs\.statSync|existsSync|accessSync|readdirSync/i.test(cleaned);
    const hasFileWrite = /writeFileSync|writeFile|mkdirSync|Bun\.write/i.test(cleaned);
    if (hasEvidenceMechanism && (hasDiskCheck || hasFileWrite)) return false;

    return true;
  },
  fix: 'Replace trust claims with mechanical evidence: `const spawnResult = JSON.parse(fs.readFileSync("ContainerSpawnResult.json", "utf-8")); if (!spawnResult.success) throw new Error("Container spawn failed");` — E3: nothing counts unless it is on disk.',
};

// ═══════════════════════════════════════════════
// CT-06: ANTIDERAIL SKIP CONTAINER TEST
// ═══════════════════════════════════════════════

export const CT06_ANTIDERAIL_SKIP_CONTAINER_TEST: ViolationDetector = {
  id: 'CT-06',
  category: 'anti-derailment',
  description: 'Anti-Derailment Skip Container Test — code that bypasses, short-circuits, or provides alternate path around container testing (§25 Fractal Rule)',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);

    const skipPatterns = [
      /skip\s*(?:container\s*)?(?:test|verification|validation)/i,
      /NO_CONTAINER_TEST|SKIP_CONTAINER|SKIP_TEST/,
      /process\.env\.\s*(?:SKIP_TEST|NO_CONTAINER|SKIP_CONTAINER)/,
      /if\s*\(\s*(?:process\.env\.\w*\s*===?\s*['"](?:skip|no|false)['"])\s*\)\s*(?:return|continue)/i,
      /\b(?:todo|fixme|hack)\b.*(?:skip|bypass|avoid)\s+(?:container|test)/i,
    ];

    for (const p of skipPatterns) {
      if (p.test(cleaned)) {
        const surrounding = getPrecedingScope(cleaned, cleaned.search(p), 300);
        const isDocumentingAnti = /(?:anti.pattern|wrong|don't|banned|never|avoid)/i.test(surrounding);
        if (!isDocumentingAnti) return true;
      }
    }

    const alternateTestPatterns = [
      /(?:source\s+inspect|bundle\s+check|typecheck\s+only)\s*(?:===?|sufficient|enough|valid)/i,
      /(?:let\s+me\s+)?test\s+(?:a\s+)?different\s+way/i,
    ];
    for (const p of alternateTestPatterns) {
      if (p.test(cleaned)) return true;
    }

    return false;
  },
  fix: 'Remove all skip/bypass paths for container testing. §25 Anti-Derailment Fractal Rule: every proposal to skip container testing must be blocked with reference to this bible. There is no alternate method — only the 12-Step Container Protocol.',
};

// ═══════════════════════════════════════════════
// CT-07: ANTIDERAIL SELF DECLARE
// ═══════════════════════════════════════════════

export const CT07_ANTIDERAIL_SELF_DECLARE: ViolationDetector = {
  id: 'CT-07',
  category: 'anti-derailment',
  description: 'Anti-Derailment Self Declare — function returning done/complete/tested status without verifying evidence files exist on disk (E6)',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);

    const completionReturnRe = /\breturn\s*\{[^}]*(?:done|complete|tested|verified|passed|shipped|finished|status\s*:\s*['"](?:complete|done|success))\b/gi;
    let m;
    while ((m = completionReturnRe.exec(cleaned)) !== null) {
      const funcBody = getPrecedingScope(cleaned, m.index, 800);
      const hasEvidenceRead = /readFileSync|readFile|existsSync|statSync|accessSync|readdirSync/i.test(funcBody);
      const hasEvidenceVar = /ContainerSpawnResult|ContainerTestResult|TuiInteraction|EvidencePathVerified|evidenceFile/i.test(funcBody);
      const hasFsCheck = /\.json/i.test(funcBody) && /existsSync|statSync|readFileSync/i.test(funcBody);
      if (!hasEvidenceRead && !hasEvidenceVar && !hasFsCheck) return true;
    }

    return false;
  },
  fix: 'Before returning completion, verify evidence on disk: `if (!fs.existsSync("ContainerTestResult.json")) throw new Error("No evidence — test did not happen"); const result = JSON.parse(fs.readFileSync("ContainerTestResult.json", "utf-8")); return { done: result.overallPassed };` — E6: agents report, not declare.',
};

// ═══════════════════════════════════════════════
// CT-08: ANTIDERAIL BUNDLE EQUIVOCATION
// ═══════════════════════════════════════════════

export const CT08_ANTIDERAIL_BUNDLE_EQUIVOCATION: ViolationDetector = {
  id: 'CT-08',
  category: 'anti-derailment',
  description: 'Anti-Derailment Bundle Equivocation — treating bundle verification, typecheck, or source inspection as equivalent to container testing (E7, §15)',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const isTestOrVerification = /(?:test|verify|check|ship|evidence|result|validate|container)/i.test(ctx.filePath);
    if (!isTestOrVerification) return false;

    const bundleAsTestPatterns = [
      /(?:bundle\s+verification|typecheck.*sufficient|compiles?\s*.*works?)/i,
      /if\s*\(\s*(?:build|bundle|typecheck|compile)\s*(?:\.success|passed|ok|exitCode\s*===?\s*0)\s*\)\s*\{[^}]*return\s*\{[^}]*(?:tested|verified|pass)/i,
      /(?:bun\s+run\s+typecheck|tsc\s+--noEmit|npm\s+run\s+build)\s*[^;]*;\s*(?:return|resolve|done|pass)/i,
    ];

    for (const p of bundleAsTestPatterns) {
      if (p.test(cleaned)) {
        const hasContainerRef = /container|docker|spawn|tmux|12.?step/i.test(cleaned);
        if (!hasContainerRef) return true;
      }
    }

    const hasBuildCheck = /(?:typecheck|build|compile)\s*(?:succeed|pass|ok|exitCode)/i.test(cleaned);
    const hasContainerCheck = /container.*test|docker.*exec|tmux.*send/i.test(cleaned);
    if (hasBuildCheck && !hasContainerCheck) {
      const declaresComplete = /(?:tested|verified|all\s+pass|ready\s+to\s+ship)/i.test(cleaned);
      if (declaresComplete) return true;
    }

    return false;
  },
  fix: 'Bundle verification is NOT testing (E7). Add container testing after build: `await runTypecheck(); await runBuild(); await runContainerTest(); // 12-Step Protocol §11` — §15 says Tier 1 system check is NOT a substitute for Tier 4 container test.',
};

// ═══════════════════════════════════════════════
// CT-09: GAP MOCK IN INTEGRATION TEST
// ═══════════════════════════════════════════════

export const CT09_GAP_MOCK_INTEGRATION: ViolationDetector = {
  id: 'CT-09',
  category: 'gap-violation',
  description: 'Gap G3: Mock In Integration Test — jest.fn(), mockResolvedValue, or mockReturnValue in integration test files (373 tests passed, 8 critical failures)',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    const isIntegrationTest = /(?:integration|e2e|container|adversarial|lifecycle)/i.test(ctx.filePath) ||
      /(?:integration|e2e|container)/i.test(ctx.toolName);
    if (!isIntegrationTest) return false;

    const cleaned = stripComments(code);
    const mockPatterns = [
      /\bmockResolvedValue\b/,
      /\bmockReturnValue\b/,
      /\bmockImplementation\b/,
      /\bjest\.fn\s*\(\s*\)/,
      /\bjest\.mock\s*\(/,
      /\bvi\.fn\s*\(\s*\)/,
      /\bvi\.mock\s*\(/,
      /\.mockReset\s*\(/,
      /\.mockClear\s*\(/,
    ];

    for (const p of mockPatterns) {
      if (p.test(cleaned)) {
        const surrounding = getPrecedingScope(cleaned, cleaned.search(p), 200);
        const isDocumentingAnti = /(?:anti.pattern|wrong|don't|banned|never|avoid)/i.test(surrounding);
        if (!isDocumentingAnti) return true;
      }
    }

    return false;
  },
  fix: 'Remove all mocks from integration tests. G3 rule: integration tests MUST test against real services. Replace `jest.fn().mockResolvedValue({success: true})` with actual service calls. Mocks pass even when real API format has changed.',
};

// ═══════════════════════════════════════════════
// CT-10: GAP PLACEHOLDER VALIDATION
// ═══════════════════════════════════════════════

export const CT10_GAP_PLACEHOLDER_VALIDATION: ViolationDetector = {
  id: 'CT-10',
  category: 'gap-violation',
  description: 'Gap G5: Placeholder Object In Validation — empty object {} passed to validation/verification function, causing all fields to be violations (gate deadlock)',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);

    const validationFuncPatterns = [
      /(?:validate|verify|check|audit|inspect|assert)\w*\s*\(\s*\{\s*\}\s*\)/gi,
    ];

    for (const re of validationFuncPatterns) {
      let m;
      while ((m = re.exec(cleaned)) !== null) {
        const surrounding = getPrecedingScope(cleaned, m.index, 300) + getTrailingScope(cleaned, m.index, 200);
        const isTestExpectingEmpty = /expect.*throw|should.*throw|should.*fail|should.*error|must.*reject/i.test(surrounding);
        const isDocumentingAnti = /(?:anti.pattern|wrong|banned|don't|theatrical)/i.test(surrounding);
        if (!isTestExpectingEmpty && !isDocumentingAnti) return true;
      }
    }

    const funcCallEmptyObj = /(\w+)\s*\(\s*\{\s*\}\s*\)/g;
    let fm;
    while ((fm = funcCallEmptyObj.exec(cleaned)) !== null) {
      const funcName = fm[1];
      const isValidationLike = /^(?:validate|verify|check|audit|inspect|assert|evaluate|score|grade)/i.test(funcName);
      if (!isValidationLike) continue;
      const surrounding = getPrecedingScope(cleaned, fm.index, 200);
      const hasDataFetch = /getCurrentState|getState|readFile|readFileSync|parse|JSON/i.test(surrounding);
      const isTestExpectingEmpty = /expect.*throw|should.*throw|should.*fail/i.test(surrounding);
      if (!hasDataFetch && !isTestExpectingEmpty) return true;
    }

    return false;
  },
  fix: 'Replace placeholder with real data: `const state = brainStateStore.getCurrentState(); if (!state) throw new Error("Cannot validate: state unavailable"); const violations = validateChecklist(state.checklist);` — G5: validateFunction({}) makes ALL fields violations, deadlocking gates forever.',
};

// ═══════════════════════════════════════════════
// CT-11: GAP UNDOCUMENTED FAILURE MODE
// ═══════════════════════════════════════════════

export const CT11_GAP_UNDOCUMENTED_FAILURE: ViolationDetector = {
  id: 'CT-11',
  category: 'gap-violation',
  description: 'Gap G4: Undocumented Failure Modes — exported function without @throws or error documentation for dependency failures',
  severity: 'medium',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    if (ctx.gate !== 'BUILD' && ctx.gate !== 'VERIFY' && ctx.gate !== 'TEST') return false;

    const exportFuncRe = /\/\*\*[\s\S]*?\*\/\s*export\s+(?:async\s+)?function\s+(\w+)/g;
    let m;
    while ((m = exportFuncRe.exec(cleaned)) !== null) {
      const jsDoc = m[0].substring(0, m[0].indexOf('*/') + 2);
      const funcName = m[1];
      const isInternal = /^_/.test(funcName);
      if (isInternal) continue;

      const funcStart = cleaned.indexOf('{', m.index + m[0].length - 10);
      if (funcStart === -1) continue;
      const body = extractBlock(cleaned, funcStart);
      if (body === null) continue;

      const hasThrow = /\bthrow\b/.test(body);
      const hasReject = /\breject\b/.test(body);
      const hasCatch = /\bcatch\b/.test(body);
      const hasAwait = /\bawait\b/.test(body);
      const hasFetch = /\bfetch\s*\(|\.request\s*\(|\.get\s*\(|\.post\s*\(/.test(body);
      const hasFsOp = /\bfs\b|\breadFile|writeFile|mkdir|stat|access/.test(body);

      const performsRiskyWork = hasAwait || hasFetch || hasFsOp || hasThrow;
      if (!performsRiskyWork) continue;

      const hasThrowsDoc = /@throws|@error|@exception|@reject/.test(jsDoc);
      const hasReturnError = /@returns.*error|@return.*error|failure.*mode/i.test(jsDoc);
      if (!hasThrowsDoc && !hasReturnError && (hasThrow || hasReject || hasCatch)) return true;
    }

    return false;
  },
  fix: 'Document all failure modes: `/** @throws {Error} When the API service is unreachable */ /** @throws {Error} When the API key is invalid (401 response) */` — G4: callers must know what happens when each dependency fails.',
};

// ═══════════════════════════════════════════════
// CT-12: GAP DEAD EXPORT
// ═══════════════════════════════════════════════

export const CT12_GAP_DEAD_EXPORT: ViolationDetector = {
  id: 'CT-12',
  category: 'gap-violation',
  description: 'Gap G6: Dead Export — exported functions/classes that are never imported or called from any reachable entry point',
  severity: 'medium',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    if (ctx.gate !== 'BUILD' && ctx.gate !== 'VERIFY' && ctx.gate !== 'TEST') return false;

    const hasSurrounding = ctx.surroundingCode && ctx.surroundingCode.length > 50;
    if (!hasSurrounding) return false;

    const exportRe = /\bexport\s+(?:async\s+)?function\s+(\w+)|\bexport\s+const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function)/g;
    let m;
    while ((m = exportRe.exec(cleaned)) !== null) {
      const funcName = m[1] || m[2];
      if (!funcName) continue;
      const isPrivate = /^_/.test(funcName);
      if (isPrivate) continue;

      const isInSurrounding = new RegExp(`\\b${funcName}\\b`).test(ctx.surroundingCode);
      const callRe = new RegExp(`(?:import|require|\\b)${funcName}\\b`, 'g');
      const callsInSurrounding = (ctx.surroundingCode.match(callRe) || []).length;
      const defInSurrounding = new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${funcName}\\b`).test(ctx.surroundingCode);

      if (!defInSurrounding) continue;
      const isCalled = callsInSurrounding > 1;
      if (isCalled) continue;
      if (!isInSurrounding && callsInSurrounding === 0) continue;

      const fileBody = cleaned.substring(0, cleaned.lastIndexOf('export'));
      const callInFile = new RegExp(`(?:^|[^/])\\b${funcName}\\b(?![\\s]*=|\\s*\\{|\\s*\\.|\\s*:)`, 'm');
      const callsInFile = (fileBody.match(callInFile) || []).length;
      if (callsInFile > 1) continue;

      return true;
    }

    return false;
  },
  fix: 'Either use the export or remove it: `npx ts-prune --project tsconfig.json` to find all unused exports. G6: every exported symbol must be reachable from at least one runtime entry point. Dead exports are code that looks real but does nothing.',
};

// ═══════════════════════════════════════════════
// CT-13: GAP EMPTY CONFIG PATTERNS
// ═══════════════════════════════════════════════

export const CT13_GAP_EMPTY_CONFIG_PATTERNS: ViolationDetector = {
  id: 'CT-13',
  category: 'gap-violation',
  description: 'Gap G7: Empty Config Patterns — LayerRule or config object with empty patterns/rules array, making configuration inert',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);

    const configPatterns = [
      /(?:patterns|rules|items|checks|gates|criteria|layers|handlers)\s*:\s*\[\s*\]\s*[,}]/g,
      /{\s*name\s*:\s*['"][\w]+['"][^}]*patterns\s*:\s*\[\s*\]\s*[,}]/g,
    ];

    for (const re of configPatterns) {
      let m;
      while ((m = re.exec(cleaned)) !== null) {
        const surrounding = getPrecedingScope(cleaned, m.index, 400) + getTrailingScope(cleaned, m.index + m[0].length, 200);

        const isLayerRule = /LayerRule|layerConfig|L\d_|LAYER/i.test(surrounding);
        const isConfigObj = /config|Config|CONFIG/i.test(surrounding);
        const isRuntimeBehavior = /gate|Gate|GATE|rule|engine|Engine/i.test(surrounding);

        if (isLayerRule || (isConfigObj && isRuntimeBehavior)) {
          const hasCommentedOut = /\/\/\s*(?:TODO|FIXME|LATER|NOT.*YET|PLACEHOLDER)/i.test(surrounding);
          if (!hasCommentedOut) return true;
        }
      }
    }

    const layerDefRe = /(?:const|let)\s+(\w*(?:Layer|layer|LAYER)\w*)\s*(?::\s*\w+)?\s*=\s*\{/g;
    let lm;
    while ((lm = layerDefRe.exec(cleaned)) !== null) {
      const braceIdx = cleaned.indexOf('{', lm.index + lm[0].length - 2);
      if (braceIdx === -1) continue;
      const body = extractBlock(cleaned, braceIdx);
      if (body === null) continue;

      const hasPatterns = /patterns\s*:\s*\[/.test(body);
      const hasEmptyPatterns = /patterns\s*:\s*\[\s*\]/.test(body);
      if (hasPatterns && hasEmptyPatterns) {
        const hasNonEmptyRules = /(?:rules|checks|criteria)\s*:\s*\[[^\]]+\]/.test(body);
        if (!hasNonEmptyRules) return true;
      }
    }

    return false;
  },
  fix: 'Populate empty config arrays with real patterns: `patterns: [CHECK_PASSED, TYPE_VALID, SCOPE_CORRECT]` or throw during init: `if (config.patterns.length === 0) throw new Error("LayerRule has empty patterns — configuration is inert");` — G7: structurally valid but semantically void config is a bug.',
};

// ═══════════════════════════════════════════════
// CT-14: GAP PRESERVED FILE VIOLATION
// ═══════════════════════════════════════════════

export const CT14_GAP_PRESERVED_FILE_VIOLATION: ViolationDetector = {
  id: 'CT-14',
  category: 'gap-violation',
  description: 'Gap G8: Preserved File Violation — code that modifies or generates diffs for files marked PRESERVED in the project anchor',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);

    const preservedMarker = /PRESERVED\s*[:=]\s*\[([^\]]*)\]/i.exec(cleaned);
    if (!preservedMarker) return false;

    const preservedList = preservedMarker[1].match(/['"`]([^'"`]+)['"`]/g) || [];
    const preservedFiles = preservedList.map(f => f.replace(/^['"`]|['"`]$/g, ''));

    const hasDiffCheck = /diff\s*\(|diff.*baseline|byte.?for.?byte|hashMatch|checksum|compareFile/i.test(cleaned);
    if (preservedFiles.length > 0 && hasDiffCheck) return false;

    if (preservedFiles.length > 0) {
      const hasWriteOp = /writeFile|writeFileSync|edit\s*\(|\.write\(/i.test(cleaned);
      const hasEditTool = /edit|modify|transform|replace.*content/i.test(cleaned);
      if (hasWriteOp || hasEditTool) {
        const hasGuard = /if\s*\(\s*preserved|PRESERVED.*skip|skipIf.*preserved/i.test(cleaned);
        if (!hasGuard) return true;
      }
    }

    return false;
  },
  fix: 'Add diff verification for preserved files: `for (const file of PRESERVED_FILES) { const baseline = fs.readFileSync(path.join(BASELINE_DIR, file)); const current = fs.readFileSync(path.join(PROJECT_DIR, file)); if (!baseline.equals(current)) throw new Error("PRESERVED file modified: " + file); }` — G8.',
};

// ═══════════════════════════════════════════════
// CT-15: EVIDENCE INCOMPLETE
// ═══════════════════════════════════════════════

export const CT15_EVIDENCE_INCOMPLETE: ViolationDetector = {
  id: 'CT-15',
  category: 'evidence',
  description: 'Evidence Incomplete — container test code that does not generate all 4 required evidence files (ContainerSpawnResult, ContainerTestResult, TuiInteraction, EvidencePathVerified)',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const isContainerTest = /(?:container.*test|test.*container|adversarial.*test|12.?step)/i.test(ctx.filePath) ||
      /container/i.test(ctx.toolName);
    if (!isContainerTest) return false;

    const hasTestExecution = /docker\s+exec|container.*test|tmux.*send|spawn.*container/i.test(cleaned);
    if (!hasTestExecution) return false;

    const requiredFiles = [
      { name: 'ContainerSpawnResult', pattern: /ContainerSpawnResult/i },
      { name: 'ContainerTestResult', pattern: /ContainerTestResult/i },
      { name: 'TuiInteraction', pattern: /TuiInteraction/i },
      { name: 'EvidencePathVerified', pattern: /EvidencePathVerified/i },
    ];

    let missingCount = 0;
    for (const { name, pattern } of requiredFiles) {
      if (!pattern.test(cleaned)) {
        missingCount++;
      }
    }

    if (missingCount >= 2) return true;

    const hasAnyWrite = /writeFileSync|writeFile|>\s*[\w.]+\.json|echo.*>.*\.json/i.test(cleaned);
    if (!hasAnyWrite) return true;

    return false;
  },
  fix: 'Generate all 4 evidence files: `fs.writeFileSync("ContainerSpawnResult.json", JSON.stringify(spawnResult)); fs.writeFileSync("ContainerTestResult.json", JSON.stringify(testResult)); fs.writeFileSync("TuiInteraction.json", tuiOutput); fs.writeFileSync("EvidencePathVerified.json", JSON.stringify({filesExist: true}));` — §23.',
};

// ═══════════════════════════════════════════════
// CT-16: EVIDENCE FABRICATED
// ═══════════════════════════════════════════════

export const CT16_EVIDENCE_FABRICATED: ViolationDetector = {
  id: 'CT-16',
  category: 'evidence',
  description: 'Evidence Fabricated — hardcoded or fabricated evidence content without dynamic runtime data (timestamps, container names, test results)',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const isEvidenceCode = /(?:evidence|result|spawn|container.*test)/i.test(ctx.filePath) ||
      /evidence|result/i.test(ctx.toolName);
    if (!isEvidenceCode) return false;

    const fabricatedPatterns = [
      /['"]overallPassed['"]\s*:\s*true(?!\s*,|\s*})/gi,
      /['"]success['"]\s*:\s*true['"]/gi,
      /['"]passed['"]\s*:\s*\d+['"]\s*,\s*['"]failed['"]\s*:\s*0/gi,
    ];

    for (const p of fabricatedPatterns) {
      let m;
      while ((m = p.exec(cleaned)) !== null) {
        const surrounding = getPrecedingScope(cleaned, m.index, 500);
        const hasDynamicData = /\$\{|`[^`]*\$\{|JSON\.stringify|new Date|Date\.now|timestamp/i.test(surrounding);
        const hasRuntimeVar = /spawnResult|testResult|containerName|passed.*\+.*failed|actual.*result/i.test(surrounding);
        if (!hasDynamicData && !hasRuntimeVar) return true;
      }
    }

    const hardcodedTimestamp = /['"]\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z['"]/g;
    let tm;
    while ((tm = hardcodedTimestamp.exec(cleaned)) !== null) {
      const surrounding = getPrecedingScope(cleaned, tm.index, 200);
      const usesDateNow = /new Date|Date\.now|date.*-u/i.test(surrounding);
      if (!usesDateNow) {
        const isExample = /example|sample|template|placeholder/i.test(surrounding);
        if (!isExample) return true;
      }
    }

    return false;
  },
  fix: 'Generate evidence dynamically: `const evidence = { overallPassed: results.passed > 0 && results.failed === 0, passed: results.passed, failed: results.failed, timestamp: new Date().toISOString() }; fs.writeFileSync("ContainerTestResult.json", JSON.stringify(evidence, null, 2));` — never hardcode evidence values.',
};

// ═══════════════════════════════════════════════
// ENFORCEMENT RULES
// ═══════════════════════════════════════════════

export const CONTAINER_TESTING_ENFORCEMENT_RULES: EnforcementRule[] = [
  {
    detector: CT01_PREFLIGHT_WRONG_PROJECT_DIR,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: CT02_PREFLIGHT_DUPLICATE_SOURCE_TREES,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: false,
  },
  {
    detector: CT03_PREFLIGHT_AGENT_NAME_MISMATCH,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: CT04_PREFLIGHT_MISSING_IDENTITY,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: CT05_ANTIDERAIL_TRUST_CLAIM,
    enforcementAction: 'flag',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: CT06_ANTIDERAIL_SKIP_CONTAINER_TEST,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: CT07_ANTIDERAIL_SELF_DECLARE,
    enforcementAction: 'flag',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: CT08_ANTIDERAIL_BUNDLE_EQUIVOCATION,
    enforcementAction: 'flag',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: CT09_GAP_MOCK_INTEGRATION,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: true,
  },
  {
    detector: CT10_GAP_PLACEHOLDER_VALIDATION,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
  {
    detector: CT11_GAP_UNDOCUMENTED_FAILURE,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: false,
  },
  {
    detector: CT12_GAP_DEAD_EXPORT,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: true,
  },
  {
    detector: CT13_GAP_EMPTY_CONFIG_PATTERNS,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: true,
  },
  {
    detector: CT14_GAP_PRESERVED_FILE_VIOLATION,
    enforcementAction: 'block',
    escalationTarget: 'execution',
    autoFixable: false,
  },
  {
    detector: CT15_EVIDENCE_INCOMPLETE,
    enforcementAction: 'flag',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: CT16_EVIDENCE_FABRICATED,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: false,
  },
];

// ═══════════════════════════════════════════════
// ALL DETECTORS MAP
// ═══════════════════════════════════════════════

const ALL_CONTAINER_TESTING_DETECTORS: Readonly<Record<string, ViolationDetector>> = {
  'CT-01': CT01_PREFLIGHT_WRONG_PROJECT_DIR,
  'CT-02': CT02_PREFLIGHT_DUPLICATE_SOURCE_TREES,
  'CT-03': CT03_PREFLIGHT_AGENT_NAME_MISMATCH,
  'CT-04': CT04_PREFLIGHT_MISSING_IDENTITY,
  'CT-05': CT05_ANTIDERAIL_TRUST_CLAIM,
  'CT-06': CT06_ANTIDERAIL_SKIP_CONTAINER_TEST,
  'CT-07': CT07_ANTIDERAIL_SELF_DECLARE,
  'CT-08': CT08_ANTIDERAIL_BUNDLE_EQUIVOCATION,
  'CT-09': CT09_GAP_MOCK_INTEGRATION,
  'CT-10': CT10_GAP_PLACEHOLDER_VALIDATION,
  'CT-11': CT11_GAP_UNDOCUMENTED_FAILURE,
  'CT-12': CT12_GAP_DEAD_EXPORT,
  'CT-13': CT13_GAP_EMPTY_CONFIG_PATTERNS,
  'CT-14': CT14_GAP_PRESERVED_FILE_VIOLATION,
  'CT-15': CT15_EVIDENCE_INCOMPLETE,
  'CT-16': CT16_EVIDENCE_FABRICATED,
};

// ═══════════════════════════════════════════════
// VALIDATION FUNCTION
// ═══════════════════════════════════════════════

export interface ContainerTestingValidationResult {
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
    byCategory: Record<string, number>;
  };
}

/** @deprecated Replaced by honesty-engine/ or candidate-generator.ts. Retained for backward compatibility. */
export function detectContainerTestingViolations(
  code: string,
  context: CodeContext,
): ContainerTestingValidationResult {
  const violations: ContainerTestingValidationResult['violations'] = [];

  for (const rule of CONTAINER_TESTING_ENFORCEMENT_RULES) {
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

  const critical = violations.filter(v => v.severity === 'critical').length;
  const high = violations.filter(v => v.severity === 'high').length;
  const medium = violations.filter(v => v.severity === 'medium').length;
  const blocked = violations.some(v => v.enforcementAction === 'block');

  const byCategory: Record<string, number> = {};
  for (const v of violations) {
    byCategory[v.category] = (byCategory[v.category] || 0) + 1;
  }

  return {
    passed: violations.length === 0,
    violations,
    summary: {
      total: violations.length,
      critical,
      high,
      medium,
      blocked,
      byCategory,
    },
  };
}

/** @deprecated Replaced by honesty-engine/ or candidate-generator.ts. Retained for backward compatibility. */
export function getContainerTestingDetectorById(id: string): ViolationDetector | undefined {
  return ALL_CONTAINER_TESTING_DETECTORS[id];
}
