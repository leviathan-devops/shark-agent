/**
 * T1 Injectable: Container TUI Testing Protocol Enforcement
 *
 * Distilled from T2_TUI_TESTING_BIBLE v1.14.x
 * 12-step container TUI testing protocol, anti-patterns, config audit,
 * failure recovery, and evidence verification mapped to semantic detectors.
 *
 * DESIGN RULES:
 *   - Semantic detection — check structural context, not just keywords
 *   - Pure functions: (code, context) => boolean (true = violation detected)
 *   - Maps to T2 Bible sections for gate integration
 *
 * DETECTOR INDEX:
 *   TUI-01  OPENCODE_RUN_AS_TEST        — opencode run used as sole verification
 *   TUI-02  GREP_BASED_TESTING           — grep/rg/cat used as "testing" evidence
 *   TUI-03  BUNDLE_VERIFICATION_ONLY      — bundle check substituted for container test
 *   TUI-04  HOST_ONLY_TESTING             — tests run on host without container
 *   TUI-05  MISSING_CONTAINER_EVIDENCE    — no evidence files from container test
 *   TUI-06  WRONG_BINARY_PATH             — musl binary or npm wrapper used
 *   TUI-07  MODEL_CONFIG_MISPLACED        — model inside provider block or missing
 *   TUI-08  TOOLS_ARRAY_TYPE              — tools defined as array instead of object
 *   TUI-09  WRONG_IMAGE_TAG               — hallucinated or wrong container image tag
 *   TUI-10  HOST_CONFIG_MOUNT             — host opencode config mounted directly
 *   TUI-11  EVIDENCE_FRAUD_CONTAINER_ONLY — ContainerTestResult without TuiInteraction
 *   TUI-12  EVIDENCE_FRAUD_PASS_NO_DETAIL — pass claim without test details
 *   TUI-13  SKIPPED_TMUX                  — TUI test without tmux session
 *   TUI-14  SKIPPED_DB_MIGRATION_WAIT     — no sleep/wait before verifying container
 *   TUI-15  DOCKER_ATTACH_USAGE           — docker attach used instead of exec -it
 *   TUI-16  WILDCARD_PERMISSION_DEPLOY    — wildcard perms in deployment config
 *   TUI-17  FOREIGN_TOOLS_VISIBLE         — tool isolation not enforced
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

function extractBlock(code: string, openBraceIdx: number): string | null {
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  for (let i = openBraceIdx; i < code.length; i++) {
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
      if (depth === 0) return code.substring(openBraceIdx + 1, i);
    }
  }
  return null;
}

function isInsideTestAssertion(code: string, position: number): boolean {
  const before = code.substring(Math.max(0, position - 300), position);
  const assertionPatterns = [
    /\bexpect\s*\(/,
    /\bassert\b/,
    /\bshould\b/,
    /\bassertEquals\b/,
    /\bassertThrows\b/,
    /\.to(Be|Equal|Contain|Match|Throw|Reject)\b/,
    /\.toBeTruthy\b/,
    /\.toBeFalsy\b/,
  ];
  return assertionPatterns.some(p => p.test(before));
}

function isInsideHeredocOrString(code: string, position: number): boolean {
  const before = code.substring(Math.max(0, position - 200), position);
  const heredocCount = (before.match(/<<-?\s*['"]?EOF/g) || []).length;
  const terminatorCount = (before.match(/\bEOF\b/g) || []).length;
  if (heredocCount > terminatorCount) return true;
  const lines = before.split('\n');
  const lastLine = lines[lines.length - 1] || '';
  if (lastLine.trimStart().startsWith('#')) return false;
  const dq = (lastLine.match(/(?<!\\)"/g) || []).length;
  const sq = (lastLine.match(/(?<!\\)'/g) || []).length;
  return (dq % 2 !== 0) || (sq % 2 !== 0);
}

function hasTmuxUsageInContext(code: string): boolean {
  return /\btmux\s+(new-session|send-keys|capture-pane|kill-session)/.test(code);
}

function hasContainerStartupInContext(code: string): boolean {
  return /docker\s+(run|exec)/.test(code);
}

function hasEvidenceFileGeneration(code: string, filename: string): boolean {
  const patterns = [
    new RegExp(`['"\`]${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`),
    new RegExp(`>\\s*${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    new RegExp(`writeFile.*${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    new RegExp(`Bun\\.write.*${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    new RegExp(`fs\\.\\w+.*${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  ];
  return patterns.some(p => p.test(code));
}

// ═══════════════════════════════════════════════
// TUI-01: OPENCODE_RUN_AS_TEST
// ═══════════════════════════════════════════════

export const TUI01_OPENCODE_RUN_AS_TEST: ViolationDetector = {
  id: 'TUI-01',
  category: 'testing-anti-pattern',
  description: 'opencode run used as sole test method — opencode run does NOT fire hooks, cannot verify plugin behavior',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const opencodeRunPattern = /opencode\s+run\b/g;
    let m;
    while ((m = opencodeRunPattern.exec(cleaned)) !== null) {
      if (isInsideHeredocOrString(cleaned, m.index)) continue;
      if (isInsideTestAssertion(cleaned, m.index)) continue;
      const after = cleaned.substring(m.index);
      const hasPrintLogs = /--print-logs/.test(after.substring(0, 200));
      const hasTmuxVerification = /tmux\s+(send-keys|capture-pane)/.test(cleaned);
      const hasContainerTestComment = /container\s*test|TUI\s*test|12.step/i.test(
        cleaned.substring(Math.max(0, m.index - 500), m.index + 200)
      );
      if (!hasPrintLogs && !hasTmuxVerification && !hasContainerTestComment) {
        return true;
      }
    }
    return false;
  },
  fix: 'Use the full 12-step container TUI protocol with tmux + docker exec -it for hook verification. opencode run --print-logs is only valid for checking plugin loading, NOT hook firing.',
};

// ═══════════════════════════════════════════════
// TUI-02: GREP_BASED_TESTING
// ═══════════════════════════════════════════════

export const TUI02_GREP_BASED_TESTING: ViolationDetector = {
  id: 'TUI-02',
  category: 'testing-anti-pattern',
  description: 'grep/rg/cat used as primary test verification — file contents ≠ runtime behavior',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    if (ctx.toolName !== 'test' && ctx.gate !== 'TEST' && ctx.gate !== 'VERIFY') return false;
    const cleaned = stripComments(code);
    const grepPatterns = [
      /\bgrep\b.*--?\w*r\w*/,
      /\brg\s+/,
      /\bgrep\b.*-e\s+/,
    ];
    const hasGrep = grepPatterns.some(p => p.test(cleaned));
    if (!hasGrep) return false;
    const passClaimPatterns = [
      /test\s*(?:passed?|complete|verified|success)/i,
      /all\s*(?:tests?\s*)?(?:pass|work|correct)/i,
      /verified\s*(?:the\s*)?(?:fix|implementation|module)/i,
    ];
    const hasPassClaim = passClaimPatterns.some(p => p.test(cleaned));
    const hasActualTestFramework = /\b(describe|it\(|test\(|expect\s*\(|beforeEach|afterEach)\b/.test(cleaned);
    return hasPassClaim && !hasActualTestFramework;
  },
  fix: 'Replace grep-based "verification" with actual runtime tests. Use the 12-step container TUI protocol or a test framework (vitest, bun test). grep shows file contents, NOT what OpenCode loads at runtime.',
};

// ═══════════════════════════════════════════════
// TUI-03: BUNDLE_VERIFICATION_ONLY
// ═══════════════════════════════════════════════

export const TUI03_BUNDLE_VERIFICATION_ONLY: ViolationDetector = {
  id: 'TUI-03',
  category: 'testing-anti-pattern',
  description: 'Bundle/module verification used as substitute for container testing — imports working ≠ hooks firing',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const bundleCheckPatterns = [
      /bun\s+-e\s+.*import\s*\(/,
      /node\s+--input-type\s*=module.*import\s*\(/,
      /console\.log.*Tools:|console\.log.*Hooks:/,
      /Object\.keys\(hooks\)/,
    ];
    const hasBundleCheck = bundleCheckPatterns.some(p => p.test(cleaned));
    if (!hasBundleCheck) return false;
    const containerPatterns = [
      /docker\s+(run|exec)/,
      /tmux\s+(new-session|send-keys|capture-pane)/,
      /ContainerTestResult/,
      /TuiInteraction/,
    ];
    const hasContainerTest = containerPatterns.some(p => p.test(cleaned));
    const declaredComplete = /(?:test|verify|check|validation)\s*(?:passed|complete|done|successful)/i.test(cleaned);
    return hasBundleCheck && !hasContainerTest && declaredComplete;
  },
  fix: 'Bundle verification is Step 0 (System Check), a readiness gate, NOT a test. Follow with the full 12-step container protocol. T2 Bible §System Check: "It proves the module LOADS — it does not prove the module WORKS."',
};

// ═══════════════════════════════════════════════
// TUI-04: HOST_ONLY_TESTING
// ═══════════════════════════════════════════════

export const TUI04_HOST_ONLY_TESTING: ViolationDetector = {
  id: 'TUI-04',
  category: 'testing-anti-pattern',
  description: 'Tests executed on host machine without Docker container — not a runtime-grade test',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    if (ctx.gate !== 'TEST' && ctx.gate !== 'VERIFY' && ctx.toolName !== 'test') return false;
    const cleaned = stripComments(code);
    const hasDocker = /docker\s+(run|exec|build)/.test(cleaned);
    if (hasDocker) return false;
    const testIndicators = [
      /\b(describe|it\(|test\()\s*[\('"].*(?:hook|plugin|agent|tool|identity|container)/i,
      /bun\s+test/,
      /vitest/,
    ];
    const isTestFile = testIndicators.some(p => p.test(cleaned));
    if (!isTestFile) return false;
    const runtimeIndicators = [
      /hooks?\s*\.\s*(tool|chat|config|system)/,
      /plugin.*factory/i,
      /agent.*identity/i,
      /hook.*fire/i,
    ];
    return runtimeIndicators.some(p => p.test(cleaned));
  },
  fix: 'Tests involving plugin hooks, agent identity, or tool registration MUST run inside a Docker container. Host-only tests cannot verify runtime behavior under OpenCode\'s plugin loader.',
};

// ═══════════════════════════════════════════════
// TUI-05: MISSING_CONTAINER_EVIDENCE
// ═══════════════════════════════════════════════

export const TUI05_MISSING_CONTAINER_EVIDENCE: ViolationDetector = {
  id: 'TUI-05',
  category: 'testing-anti-pattern',
  description: 'Container test claimed but no evidence files (ContainerSpawnResult, ContainerTestResult, TuiInteraction) generated',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    if (ctx.gate !== 'TEST' && ctx.gate !== 'VERIFY') return false;
    const cleaned = stripComments(code);
    const containerTestClaim = /container\s*test|TUI\s*test|12.step\s*protocol/i.test(cleaned);
    if (!containerTestClaim && !hasContainerStartupInContext(cleaned)) return false;
    const hasSpawnResult = hasEvidenceFileGeneration(cleaned, 'ContainerSpawnResult.json');
    const hasTestResult = hasEvidenceFileGeneration(cleaned, 'ContainerTestResult.json');
    const hasTuiInteraction = hasEvidenceFileGeneration(cleaned, 'TuiInteraction.json');
    return !(hasSpawnResult && hasTestResult && hasTuiInteraction);
  },
  fix: 'After the 12-step protocol, generate all three evidence files: ContainerSpawnResult.json (Step 7), ContainerTestResult.json (adversarial test exit code), TuiInteraction.json (capture-pane output). T2 Bible §Evidence Collection: "If those files don\'t exist → the test did NOT happen."',
};

// ═══════════════════════════════════════════════
// TUI-06: WRONG_BINARY_PATH
// ═══════════════════════════════════════════════

export const TUI06_WRONG_BINARY_PATH: ViolationDetector = {
  id: 'TUI-06',
  category: 'container-config',
  description: 'Wrong binary path — musl binary or npm wrapper used instead of baseline binary',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const muslPattern = /opencode-linux-x64-musl/;
    const npmWrapperPattern = /\/usr\/local\/bin\/opencode\b(?!-test)/;
    const hasMusl = muslPattern.test(cleaned);
    const hasNpmWrapper = npmWrapperPattern.test(cleaned);
    if (!hasMusl && !hasNpmWrapper) return false;
    const contextChunk = cleaned.substring(
      Math.max(0, (hasMusl ? cleaned.indexOf('opencode-linux-x64-musl') : cleaned.indexOf('/usr/local/bin/opencode')) - 200),
      (hasMusl ? cleaned.indexOf('opencode-linux-x64-musl') : cleaned.indexOf('/usr/local/bin/opencode')) + 200
    );
    const isDocumentingAntiPattern = /(?:anti.pattern|wrong|banned|don't|do not|avoid|forbidden|incorrect)/i.test(contextChunk);
    const isBaselineAlsoPresent = /opencode-linux-x64-baseline/.test(cleaned);
    return !isDocumentingAntiPattern && (!isBaselineAlsoPresent || hasMusl);
  },
  fix: 'Use the baseline binary: /usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode. The npm wrapper auto-selects musl on glibc systems (crash). The musl binary requires a linker that doesn\'t exist on glibc containers.',
};

// ═══════════════════════════════════════════════
// TUI-07: MODEL_CONFIG_MISPLACED
// ═══════════════════════════════════════════════

export const TUI07_MODEL_CONFIG_MISPLACED: ViolationDetector = {
  id: 'TUI-07',
  category: 'container-config',
  description: 'Model configuration inside provider block or missing from top level — opencode 1.14.x ignores provider-embedded models',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const jsonBlockRe = /\{[^{}]*"provider"\s*:\s*\{[^{}]*"model"\s*:/s;
    if (jsonBlockRe.test(cleaned)) return true;
    const opencodeJsonPattern = /opencode\.json/;
    if (!opencodeJsonPattern.test(cleaned)) return false;
    const hasProviderBlock = /"provider"\s*:\s*\{/.test(cleaned);
    const hasTopLevelModel = /"model"\s*:\s*"[^"]+\/[^"]+"/.test(cleaned);
    if (hasProviderBlock && !hasTopLevelModel) return true;
    const providerBlockMatch = cleaned.match(/"provider"\s*:\s*\{/);
    if (providerBlockMatch) {
      const start = providerBlockMatch.index!;
      const providerBlock = extractBlock(cleaned, cleaned.indexOf('{', start));
      if (providerBlock && /"model"\s*:/.test(providerBlock)) return true;
    }
    return false;
  },
  fix: 'Place "model": "provider/model-name" at the TOP LEVEL of opencode.json, NOT inside the provider block. opencode 1.14.x ignores model inside provider — it falls back to wrong model with no API key.',
};

// ═══════════════════════════════════════════════
// TUI-08: TOOLS_ARRAY_TYPE
// ═══════════════════════════════════════════════

export const TUI08_TOOLS_ARRAY_TYPE: ViolationDetector = {
  id: 'TUI-08',
  category: 'container-config',
  description: 'Tools defined as array instead of object — tools won\'t register in opencode 1.14.x',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const toolsArrayPattern = /"tools"\s*:\s*\[/;
    if (!toolsArrayPattern.test(cleaned)) return false;
    const match = cleaned.match(/"tools"\s*:\s*\[([^\]]*)\]/);
    if (!match) return false;
    const entries = match[1];
    const hasStringEntries = /['"][\w-]+['"]/.test(entries);
    const contextChunk = cleaned.substring(Math.max(0, match.index! - 300), match.index!);
    const isDocumentingAntiPattern = /(?:anti.pattern|wrong|incorrect|don't|do not)/i.test(contextChunk);
    return hasStringEntries && !isDocumentingAntiPattern;
  },
  fix: 'Use object syntax: "tools": {"tool-a": true, "tool-b": true}. Array syntax ["tool-a", "tool-b"] fails silently — tools won\'t register.',
};

// ═══════════════════════════════════════════════
// TUI-09: WRONG_IMAGE_TAG
// ═══════════════════════════════════════════════

export const TUI09_WRONG_IMAGE_TAG: ViolationDetector = {
  id: 'TUI-09',
  category: 'container-config',
  description: 'Wrong or hallucinated Docker image tag — only opencode-test:1.14.34 is verified',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const imagePattern = /opencode-test:(\d+\.\d+\.\d+)/g;
    let m;
    while ((m = imagePattern.exec(cleaned)) !== null) {
      const tag = m[1];
      if (tag !== '1.14.34') {
        const contextChunk = cleaned.substring(Math.max(0, m.index - 100), m.index + 100);
        const isDocumenting = /(?:anti.pattern|wrong|does not exist|hallucination|banned)/i.test(contextChunk);
        if (!isDocumenting) return true;
      }
    }
    return false;
  },
  fix: 'Use opencode-test:1.14.34 — the verified working image. Other tags (1.14.41, 1.15.x) are hallucinated and don\'t exist.',
};

// ═══════════════════════════════════════════════
// TUI-10: HOST_CONFIG_MOUNT
// ═══════════════════════════════════════════════

export const TUI10_HOST_CONFIG_MOUNT: ViolationDetector = {
  id: 'TUI-10',
  category: 'container-config',
  description: 'Host opencode config mounted directly into container — causes file lock conflicts with running host instance',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const hostMountPatterns = [
      /-v\s+~\/\.config\/opencode\s*:\s*\/root\/\.config\/opencode/,
      /-v\s+\$HOME\/\.config\/opencode\s*:\s*\/root\/\.config\/opencode/,
      /-v\s+["'].*\.config\/opencode["']\s*:\s*\/root\/\.config\/opencode/,
    ];
    for (const pattern of hostMountPatterns) {
      if (pattern.test(cleaned)) {
        const matchPos = cleaned.search(pattern);
        const contextChunk = cleaned.substring(Math.max(0, matchPos - 200), matchPos + 200);
        const isDocumenting = /(?:anti.pattern|wrong|don't|do not|avoid|critical|never)/i.test(contextChunk);
        if (!isDocumenting) return true;
      }
    }
    return false;
  },
  fix: 'Create an isolated snap directory: mkdir -p /tmp/snap-${PROJECT}/plugins && mount that instead. Never mount host ~/.config/opencode — it conflicts with the running host opencode instance.',
};

// ═══════════════════════════════════════════════
// TUI-11: EVIDENCE_FRAUD_CONTAINER_ONLY
// ═══════════════════════════════════════════════

export const TUI11_EVIDENCE_FRAUD_CONTAINER_ONLY: ViolationDetector = {
  id: 'TUI-11',
  category: 'evidence-fraud',
  description: 'ContainerTestResult.json present without TuiInteraction.json — test result without TUI evidence is incomplete',
  severity: 'critical',
  detect(code: string, ctx: CodeContext): boolean {
    if (ctx.gate !== 'TEST' && ctx.gate !== 'VERIFY') return false;
    const cleaned = stripComments(code);
    const hasContainerResult = hasEvidenceFileGeneration(cleaned, 'ContainerTestResult.json');
    const hasTuiInteraction = hasEvidenceFileGeneration(cleaned, 'TuiInteraction.json');
    return hasContainerResult && !hasTuiInteraction;
  },
  fix: 'Every ContainerTestResult.json must be accompanied by TuiInteraction.json. TUI interaction evidence (tmux capture-pane) is the proof that hooks actually fired in the runtime. Without it, the test result is unverified.',
};

// ═══════════════════════════════════════════════
// TUI-12: EVIDENCE_FRAUD_PASS_NO_DETAIL
// ═══════════════════════════════════════════════

export const TUI12_EVIDENCE_FRAUD_PASS_NO_DETAIL: ViolationDetector = {
  id: 'TUI-12',
  category: 'evidence-fraud',
  description: 'Pass rate or overallPassed claimed without individual test details or assertion breakdown',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    if (ctx.gate !== 'TEST' && ctx.gate !== 'VERIFY') return false;
    const cleaned = stripComments(code);
    const passPatterns = [
      /overallPassed\s*:\s*true/,
      /pass.?rate\s*:\s*(?:100|1\.0|90)/i,
      /all\s*\d+\s*tests?\s*pass/i,
      /\d+\/\d+\s*(?:tests?\s*)?pass/i,
    ];
    const hasPassClaim = passPatterns.some(p => p.test(cleaned));
    if (!hasPassClaim) return false;
    const detailPatterns = [
      /"tests"\s*:\s*\[/,
      /"results"\s*:\s*\[/,
      /"assertions"\s*:\s*\[/,
      /"details"\s*:\s*\[/,
      /\b(TC-\d+\.\d+|test case)\b/i,
    ];
    const hasDetails = detailPatterns.some(p => p.test(cleaned));
    return !hasDetails;
  },
  fix: 'Include individual test results with the evidence: test names, pass/fail per test, assertion details. "overallPassed: true" alone is not evidence — it\'s a claim. T2 Bible Rule E3: "Every claim requires mechanical evidence."',
};

// ═══════════════════════════════════════════════
// TUI-13: SKIPPED_TMUX
// ═══════════════════════════════════════════════

export const TUI13_SKIPPED_TMUX: ViolationDetector = {
  id: 'TUI-13',
  category: 'protocol-violation',
  description: 'TUI test attempted without tmux — no terminal multiplexer means no capture-pane capability',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const hasDockerExec = /docker\s+exec/.test(cleaned);
    const hasOpencodeCommand = /opencode\s+(--agent|run)/.test(cleaned);
    if (!hasDockerExec && !hasOpencodeCommand) return false;
    const hasTmux = hasTmuxUsageInContext(cleaned);
    if (hasTmux) return false;
    const hasTuiTestIntent = /TUI|tui|terminal.*test|interactive.*test/i.test(cleaned);
    const hasCaptureAttempt = /capture-pane|send-keys/.test(cleaned);
    return hasTuiTestIntent || hasCaptureAttempt;
  },
  fix: 'Use tmux for TUI testing: tmux new-session -d -s "$CONTAINER" "docker exec -it $CONTAINER ...". tmux enables send-keys for input and capture-pane for output verification. Hallucinated Barrier #1: "I can\'t run TUI" — tmux + docker exec -it works.',
};

// ═══════════════════════════════════════════════
// TUI-14: SKIPPED_DB_MIGRATION_WAIT
// ═══════════════════════════════════════════════

export const TUI14_SKIPPED_DB_MIGRATION_WAIT: ViolationDetector = {
  id: 'TUI-14',
  category: 'protocol-violation',
  description: 'No sleep/wait between container start and verification — DB migration needs ~28s on first boot',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const dockerRunMatch = /docker\s+run\s+/.exec(cleaned);
    if (!dockerRunMatch) return false;
    const afterRun = cleaned.substring(dockerRunMatch.index);
    const verifyPatterns = [
      /docker\s+(ps|exec)/,
      /tmux\s+(new-session|send-keys)/,
      /grep.*model/,
    ];
    const firstVerify = verifyPatterns.reduce((earliest, pattern) => {
      const m = pattern.exec(afterRun);
      return m && (earliest === -1 || m.index < earliest) ? m.index : earliest;
    }, -1);
    if (firstVerify === -1) return false;
    const betweenRunAndVerify = afterRun.substring(0, firstVerify);
    const hasSleep = /\bsleep\s+(\d+)/;
    const sleepMatch = hasSleep.exec(betweenRunAndVerify);
    if (!sleepMatch) return true;
    const sleepDuration = parseInt(sleepMatch[1], 10);
    return sleepDuration < 15;
  },
  fix: 'Add "sleep 28" between docker run (Step 6) and any verification (Step 8). OpenCode performs DB migration on first boot which takes ~28s. Premature verification sees a dead or incomplete container.',
};

// ═══════════════════════════════════════════════
// TUI-15: DOCKER_ATTACH_USAGE
// ═══════════════════════════════════════════════

export const TUI15_DOCKER_ATTACH_USAGE: ViolationDetector = {
  id: 'TUI-15',
  category: 'protocol-violation',
  description: 'docker attach used instead of docker exec -it — attaches to sleep process TTY, produces ZERO output',
  severity: 'critical',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const attachPattern = /\bdocker\s+attach\b/g;
    let m;
    while ((m = attachPattern.exec(cleaned)) !== null) {
      if (isInsideHeredocOrString(cleaned, m.index)) continue;
      const contextChunk = cleaned.substring(Math.max(0, m.index - 200), m.index + 100);
      const isDocumenting = /(?:anti.pattern|wrong|don't|do not|avoid|forbidden|zero output)/i.test(contextChunk);
      if (!isDocumenting) return true;
    }
    return false;
  },
  fix: 'Use docker exec -it instead of docker attach. docker attach connects to the sleep process TTY (not opencode TTY), producing ZERO output. This is Anti-Pattern #1 from T2 Bible.',
};

// ═══════════════════════════════════════════════
// TUI-16: WILDCARD_PERMISSION_DEPLOY
// ═══════════════════════════════════════════════

export const TUI16_WILDCARD_PERMISSION_DEPLOY: ViolationDetector = {
  id: 'TUI-16',
  category: 'config-audit',
  description: 'Wildcard permissions {"*": {"*": "allow"}} in deployment config — every tool on the system is available',
  severity: 'high',
  detect(code: string, ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const wildcardPattern = /"\*"\s*:\s*\{\s*"\*"\s*:\s*"allow"\s*\}/;
    if (!wildcardPattern.test(cleaned)) return false;
    const isTestConfig = /test|snap|\/tmp\//i.test(cleaned) || ctx.filePath.includes('test');
    const isDeployConfig = /deploy|prod|production/i.test(ctx.filePath) ||
      /deploy|prod|production/i.test(cleaned);
    if (isDeployConfig) return true;
    if (isTestConfig) return false;
    return !isTestConfig;
  },
  fix: 'Remove wildcard permissions from deployment config. Use explicit tool whitelisting: {"tool-a": {"read": "allow"}, "tool-b": {"write": "allow"}}. Wildcard perms are acceptable in TEST config only, never deployment.',
};

// ═══════════════════════════════════════════════
// TUI-17: FOREIGN_TOOLS_VISIBLE
// ═══════════════════════════════════════════════

export const TUI17_FOREIGN_TOOLS_VISIBLE: ViolationDetector = {
  id: 'TUI-17',
  category: 'config-audit',
  description: 'Tool isolation not enforced — foreign agent tools (manta/shark/kraken) visible in agent tool list',
  severity: 'high',
  detect(code: string, _ctx: CodeContext): boolean {
    const cleaned = stripComments(code);
    const foreignAgentPatterns = [
      /\b(?:manta|shark|kraken|trident|hydra)\b/g,
    ];
    let hasForeignToolRefs = false;
    for (const pattern of foreignAgentPatterns) {
      let m;
      while ((m = pattern.exec(cleaned)) !== null) {
        const contextChunk = cleaned.substring(Math.max(0, m.index - 50), m.index + 50);
        const isAllowed = /(?:foreign|other|block|isolation|negative|visible|check)/i.test(contextChunk);
        if (!isAllowed) {
          hasForeignToolRefs = true;
          break;
        }
      }
      if (hasForeignToolRefs) break;
    }
    if (!hasForeignToolRefs) return false;
    const hasToolFiltering = /tool.*filter|whitelist|block.*tool|firewall|tool.*isolation|visible.*tool/i.test(cleaned);
    return !hasToolFiltering;
  },
  fix: 'Verify tool isolation: run "opencode run --agent YOUR_AGENT --print-logs list tools" inside the container. If manta/shark/kraken/trident/hydra tools appear, tool isolation is broken. Add tool filtering via tool.execute.before hook.',
};

// ═══════════════════════════════════════════════
// ENFORCEMENT RULES
// ═══════════════════════════════════════════════

export const TUI_TESTING_ENFORCEMENT_RULES: EnforcementRule[] = [
  {
    detector: TUI01_OPENCODE_RUN_AS_TEST,
    enforcementAction: 'block',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: TUI02_GREP_BASED_TESTING,
    enforcementAction: 'block',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: TUI03_BUNDLE_VERIFICATION_ONLY,
    enforcementAction: 'block',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: TUI04_HOST_ONLY_TESTING,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: false,
  },
  {
    detector: TUI05_MISSING_CONTAINER_EVIDENCE,
    enforcementAction: 'block',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: TUI06_WRONG_BINARY_PATH,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: true,
  },
  {
    detector: TUI07_MODEL_CONFIG_MISPLACED,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: true,
  },
  {
    detector: TUI08_TOOLS_ARRAY_TYPE,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: true,
  },
  {
    detector: TUI09_WRONG_IMAGE_TAG,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: true,
  },
  {
    detector: TUI10_HOST_CONFIG_MOUNT,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: true,
  },
  {
    detector: TUI11_EVIDENCE_FRAUD_CONTAINER_ONLY,
    enforcementAction: 'block',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: TUI12_EVIDENCE_FRAUD_PASS_NO_DETAIL,
    enforcementAction: 'flag',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: TUI13_SKIPPED_TMUX,
    enforcementAction: 'block',
    escalationTarget: 'execution',
    autoFixable: false,
  },
  {
    detector: TUI14_SKIPPED_DB_MIGRATION_WAIT,
    enforcementAction: 'block',
    escalationTarget: 'execution',
    autoFixable: true,
  },
  {
    detector: TUI15_DOCKER_ATTACH_USAGE,
    enforcementAction: 'block',
    escalationTarget: 'system',
    autoFixable: true,
  },
  {
    detector: TUI16_WILDCARD_PERMISSION_DEPLOY,
    enforcementAction: 'flag',
    escalationTarget: 'gate',
    autoFixable: false,
  },
  {
    detector: TUI17_FOREIGN_TOOLS_VISIBLE,
    enforcementAction: 'flag',
    escalationTarget: 'execution',
    autoFixable: false,
  },
];

// ═══════════════════════════════════════════════
// ALL DETECTORS MAP
// ═══════════════════════════════════════════════

const ALL_TUI_DETECTORS: Readonly<Record<string, ViolationDetector>> = {
  'TUI-01': TUI01_OPENCODE_RUN_AS_TEST,
  'TUI-02': TUI02_GREP_BASED_TESTING,
  'TUI-03': TUI03_BUNDLE_VERIFICATION_ONLY,
  'TUI-04': TUI04_HOST_ONLY_TESTING,
  'TUI-05': TUI05_MISSING_CONTAINER_EVIDENCE,
  'TUI-06': TUI06_WRONG_BINARY_PATH,
  'TUI-07': TUI07_MODEL_CONFIG_MISPLACED,
  'TUI-08': TUI08_TOOLS_ARRAY_TYPE,
  'TUI-09': TUI09_WRONG_IMAGE_TAG,
  'TUI-10': TUI10_HOST_CONFIG_MOUNT,
  'TUI-11': TUI11_EVIDENCE_FRAUD_CONTAINER_ONLY,
  'TUI-12': TUI12_EVIDENCE_FRAUD_PASS_NO_DETAIL,
  'TUI-13': TUI13_SKIPPED_TMUX,
  'TUI-14': TUI14_SKIPPED_DB_MIGRATION_WAIT,
  'TUI-15': TUI15_DOCKER_ATTACH_USAGE,
  'TUI-16': TUI16_WILDCARD_PERMISSION_DEPLOY,
  'TUI-17': TUI17_FOREIGN_TOOLS_VISIBLE,
};

// ═══════════════════════════════════════════════
// VALIDATION FUNCTION
// ═══════════════════════════════════════════════

export interface TuiTestValidationResult {
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

export function validateTestingProtocol(
  code: string,
  context: CodeContext,
): TuiTestValidationResult {
  const violations: TuiTestValidationResult['violations'] = [];

  for (const rule of TUI_TESTING_ENFORCEMENT_RULES) {
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

export function getTuiDetectorById(id: string): ViolationDetector | undefined {
  return ALL_TUI_DETECTORS[id];
}

export function detectAllTuiViolations(
  code: string,
  context: CodeContext,
): Array<{ detector: ViolationDetector; rule: EnforcementRule }> {
  const results: Array<{ detector: ViolationDetector; rule: EnforcementRule }> = [];
  for (const rule of TUI_TESTING_ENFORCEMENT_RULES) {
    if (rule.detector.detect(code, context)) {
      results.push({ detector: rule.detector, rule });
    }
  }
  return results;
}
