import * as path from 'node:path';
import { SemanticFirewall } from '../../semantic-firewall/semantic-firewall.js';
import { ExecutionContext } from '../../semantic-firewall/execution-context.js';
import { isRecord, safeGetString } from '../../shared/type-guards.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { getCurrentAgent } from './agent-state.js';
import { StructuredBlockError } from '../../shark/enforcement-brain/index.js';
import { VerbFrameLexicon } from '../../shark/karpathy/verb-frame-lexicon.js';
import { BlockOrchestrator } from '../../gate-engine/gates/plan-gate.js';
import { resolveSecurePath } from '../../security/path-containment.js';
import { logInfo } from '../../shared/shark-logger.js';
import type { RuleConfig, AnalysisPhase } from '../../semantic-firewall/types.js';

const WRITE_TIME_RULES: RuleConfig[] = [
  { name: 'no-empty-catch', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-unsafe-cast', severity: 'HIGH', enabled: true, orders: 3 },
  { name: 'no-floating-promises', severity: 'MEDIUM', enabled: true, orders: 4 },
  { name: 'evidence-bearing-results', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-hardcoded-paths', severity: 'MEDIUM', enabled: true, orders: 2 },
  { name: 'cleanup-paired-intervals', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'handle-zero-length', severity: 'LOW', enabled: true, orders: 2 },
  { name: 'dead-export', severity: 'MEDIUM', enabled: true, orders: 3 },
  { name: 'scope-violation', severity: 'HIGH', enabled: true, orders: 5 },
];

export function createWriteTimeGate(firewall: SemanticFirewall, context: ExecutionContext) {
  return async (input: Record<string, unknown>, output: Record<string, unknown>, overrideGate?: string) => {
    const toolName = typeof input?.tool === 'string' ? input.tool : '';
    const WRITE_TOOLS = ['write', 'write_file', 'mcp_write_file', 'edit', 'mcp_edit', 'patch', 'mcp_patch', 'create', 'mcp_create', 'bash'];
    if (!WRITE_TOOLS.includes(toolName)) return;
    const inputSafe = isRecord(input) ? input : {};
    const sessionId = safeGetString(inputSafe, 'sessionID');
    const agent = getCurrentAgent(sessionId) || '';
    if (!isSharkAgent(agent)) return;

    // ── Compute currentGate ONCE at the top for all downstream checks ──
    const currentGate = overrideGate || (context?.currentGate as string) || 'plan';

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1a: PLAN gate — path-based enforcement.
    // Allow documentation writes (.md, docs/, SPEC.md, .shark/).
    // Block source code writes (src/*.ts, src/*.js).
    // ═══════════════════════════════════════════════════════════════════════
    if (currentGate === 'plan') {
      const planArgs = ((input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {}) as Record<string, unknown>;
      const targetPath = typeof planArgs.filePath === 'string' ? planArgs.filePath
        : typeof planArgs.path === 'string' ? planArgs.path
        : '';

      // ALLOW: documentation files (.md, docs/, SPEC.md, architecture)
      if (targetPath.endsWith('.md') || targetPath.includes('/docs/') ||
          targetPath.includes('SPEC.md') || targetPath.includes('architecture') ||
          targetPath.includes('TASK_QUEUE') || targetPath.includes('CONTEXT')) {
        logInfo('[write-time-gate] PLAN gate: documentation write allowed — ' + targetPath);
        return;
      }

      // ALLOW: evidence files in .shark/
      if (targetPath.includes('.shark/')) {
        return;
      }

      // BLOCK: source code files (.ts, .js, /src/)
      if (targetPath.endsWith('.ts') || targetPath.endsWith('.tsx') ||
          targetPath.endsWith('.js') || targetPath.endsWith('.jsx') ||
          targetPath.includes('/src/')) {
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'semantic-firewall',
          findingId: 'PLAN_GATE_SOURCE_BLOCKED',
          message: 'Source code requires BUILD gate. Write your plan as SPEC.md first, then call shark-gate advance (no gate parameter) to advance to the next gate.',
          correction: 'Write your architecture and requirements in SPEC.md, then call shark-gate advance (no gate parameter) to advance to the next gate.',
        });
      }

      // For other files during PLAN, allow with log
      logInfo('[write-time-gate] PLAN gate: non-source write allowed — ' + targetPath);
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CALIBRATION FIX: VERIFY gate — allow config/output writes, block src/ changes.
    //
    // The VERIFY gate previously blocked ALL writes (including tsconfig.json,
    // package.json, .shark/ evidence, test-output/). This prevented the agent
    // from completing verification because it couldn't write build output files.
    //
    // Now: allow writes to .shark/, tsconfig.json, package.json, *.json config,
    // and test-output/. Block only source code in src/ (.ts/.js).
    // ═══════════════════════════════════════════════════════════════════════
    if (currentGate === 'verify') {
      const verifyArgs = ((input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {}) as Record<string, unknown>;
      const verifyPath = typeof verifyArgs.filePath === 'string' ? verifyArgs.filePath
        : typeof verifyArgs.path === 'string' ? verifyArgs.path
        : '';

      const lowerPath = verifyPath.toLowerCase();

      // ALLOW: evidence and config files
      const isConfigOrOutput =
        lowerPath.includes('test-output/') ||
        lowerPath.includes('.shark/') ||
        lowerPath.endsWith('tsconfig.json') ||
        lowerPath.endsWith('package.json') ||
        lowerPath.endsWith('.json') ||
        lowerPath.endsWith('.md') ||
        lowerPath.endsWith('.yaml') ||
        lowerPath.endsWith('.yml');

      // Block: source code files (.ts, .js in /src/)
      const isSourceChange =
        (lowerPath.includes('/src/') || lowerPath.includes('\\src\\')) &&
        (lowerPath.endsWith('.ts') || lowerPath.endsWith('.js') ||
         lowerPath.endsWith('.tsx') || lowerPath.endsWith('.jsx'));

      if (isSourceChange && !isConfigOrOutput) {
        if (!Array.isArray(output.system)) output.system = [];
        (output.system as string[]).push("VERIFY: Don't modify source code. Fix config or output instead.");
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'semantic-firewall',
          findingId: 'VERIFY_GATE_SOURCE_BLOCKED',
          message: 'VERIFY gate: source code modification blocked. Fix config or output files instead.',
          correction: 'In VERIFY gate, only write config (.json), evidence (.shark/), or output files. Do not modify src/ code.',
        });
      }

      // Allow config/output writes — log and return early
      if (isConfigOrOutput || verifyPath === '') {
        logInfo('[write-time-gate] VERIFY gate: config/output write allowed — ' + verifyPath);
        return; // Early return — skip VerbFrameLexicon and other write blocks
      }

      // Non-source, non-config files: allow with warning
      logInfo('[write-time-gate] VERIFY gate: write allowed — ' + verifyPath);
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CALIBRATION FIX: TEST gate — allow ALL project writes.
    //
    // The agent NEEDS to iterate during testing: read results → fix code →
    // update tests → create config → re-run tests. Blocking writes here
    // kills the iteration loop and causes the enforcement death spiral.
    //
    // Only block DANGEROUS system paths. Everything else is allowed.
    // ═══════════════════════════════════════════════════════════════════════
    if (currentGate === 'test') {
      const testArgs = ((input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {}) as Record<string, unknown>;
      const testPath = typeof testArgs.filePath === 'string' ? testArgs.filePath
        : typeof testArgs.path === 'string' ? testArgs.path
        : '';

      // Block ONLY dangerous system paths
      const dangerousPath = testPath.startsWith('/etc/') || testPath.startsWith('/boot/') ||
                            testPath.startsWith('/sys/') || testPath.startsWith('/proc/');
      if (dangerousPath) {
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'semantic-firewall',
          findingId: 'SF-SYSTEM-PATH-BLOCKED',
          message: 'EIE: Cannot write to system paths: ' + testPath,
          correction: 'Stay within the project workspace.',
        });
      }

      // Allow ALL project writes — testing requires iteration
      logInfo('[write-time-gate] TEST gate: write allowed (permissive) — ' + testPath);
      return; // Skip VerbFrameLexicon, scope checks, in-memory analysis — TEST is permissive
    }

    if (WRITE_TOOLS.includes(toolName) && context) {
      const gateArgs = ((input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {}) as Record<string, unknown>;
      const filePath = typeof gateArgs.filePath === 'string'
        ? gateArgs.filePath
        : typeof gateArgs.path === 'string'
        ? gateArgs.path
        : '';
      if (filePath && !context.isSharkProjectFile(filePath)) {
        if (!context.isOperationAllowedForGate(toolName, filePath)) {
          const shortFile = filePath.length > 40 ? '...' + filePath.slice(-37) : filePath;
          throw new StructuredBlockError({
            level: 'CRITICAL',
            lobe: 'semantic-firewall',
            findingId: 'SF-SCOPE-VIOLATION',
            message: '[SF] Write blocked. "' + shortFile + '" outside project scope.'
          });
        }
      }
    }
    const args = ((input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {}) as Record<string, unknown>;
    // Context-aware engineering operation check is handled by the
    // AnalysisOrderDispatcher's deterministic rules + semantic firewall.
    // No early-return bypass — all gate/firewall checks ALWAYS run.

    // Path traversal protection via fs.realpath
    const filePath = isRecord(args) ? safeGetString(args, 'filePath') : '';
    if (filePath && WRITE_TOOLS.includes(toolName)) {
      try {
        resolveSecurePath(filePath, process.cwd());
      } catch (err) {
        throw new StructuredBlockError({
          level: 'CRITICAL', lobe: 'semantic-firewall', findingId: 'SF-PATH-TRAVERSAL',
          message: `Path traversal blocked: ${err instanceof Error ? err.message : String(err)}`,
          correction: 'Stay within the project workspace'
        });
      }
    }

    // Wire isAllowedInGate — VerbFrameLexicon gate-aware tool check
    try {
      const lexicon = new VerbFrameLexicon();
      const currentGate = overrideGate || (context.currentGate as string);
      if (!lexicon.isAllowedInGate(toolName, currentGate)) {
        // Build gate-specific allowed tools list
        const gateTools: Record<string, string> = {
          'PLAN': 'glob, read, grep, list, search (READ tools)',
          'BUILD': 'write, edit, bash, run (BUILD tools)',
          'TEST': 'test, bash, execute, verify (TEST tools)',
          'VERIFY': 'glob, read, audit, review (VERIFY tools)',
          'AUDIT': 'glob, read, audit, analyze (AUDIT tools)',
          'DELIVERY': 'deliver, ship, deploy, verify (DELIVERY tools)',
        };
        const gateKey = currentGate.toUpperCase();
        const allowedTools = gateTools[gateKey] || `${gateKey} tools`;
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'semantic-firewall',
          findingId: 'SF-GATE-VIOLATION',
          message: `[SF] Blocked "${toolName}" in ${currentGate}. Use ${allowedTools}.`,
        });
      }
    } catch (err) {
      if (err instanceof StructuredBlockError) throw err;
      // VerbFrameLexicon error — non-fatal, continue
    }

    // Auto-redirect /tmp/ writes to project root
    const projectRoot = process.cwd();
    if (args?.filePath && typeof args.filePath === 'string' && args.filePath.startsWith('/tmp/')) {
      const originalPath = args.filePath;
      args.filePath = path.join(projectRoot, path.basename(args.filePath));
      logInfo(`[write-time-gate] Redirected write from ${originalPath} to ${args.filePath}`);
    }

    // Wire BlockOrchestrator — additional gate-aware enforcement layer
    try {
      const orchestrator = new BlockOrchestrator();
      const currentGate = overrideGate || (context.currentGate as string);
      orchestrator.setGate(currentGate);
      const blockReason = orchestrator.evaluateBefore(toolName, args as Record<string, unknown>);
      if (blockReason) {
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'semantic-firewall',
          findingId: 'SF-ORCHESTRATOR-BLOCK',
          message: `[SF] ${blockReason}`,
        });
      }
    } catch (err) {
      if (err instanceof StructuredBlockError) throw err;
      // BlockOrchestrator error — non-fatal, continue
    }

    // ── In-Memory Semantic Analysis (gate-aware) ────────────────
    // Analyze the CONTENT being written (not disk files) using analyzeInMemory().
    // This creates a temporary in-memory TS Program and runs AST rules against
    // the provided content — catches empty catches, unsafe casts, theatrical
    // patterns, etc.
    //
    // PHASE 2A (Two-Tier BUILD Enforcement):
    //   BUILD gate: ALWAYS run pre-write analysis, but with softer enforcement.
    //     - CRITICAL + AST-verified (SRE/SF engine, has evidence chain) → BLOCK
    //     - HIGH or non-AST-verified → WARN, allow write (post-write audit catches)
    //   Non-BUILD gates (PLAN, TEST, VERIFY, AUDIT, DELIVERY): run in-memory
    //     analysis BEFORE the write — block CRITICAL and HIGH findings.
    //
    const isBuildGate = currentGate.toLowerCase() === 'build';

    // ── Helper: is this finding AST-verified (not just regex)? ──
    const isAstVerified = (f: { engine?: string; evidenceChain?: unknown[] }): boolean => {
      return !!(f.engine === 'SRE' || f.engine === 'SF' ||
             (f.evidenceChain && Array.isArray(f.evidenceChain) && f.evidenceChain.length > 0));
    };

    if (isBuildGate) {
      // ════════════════════════════════════════════════════════════
      // BUILD GATE: Run pre-write analysis with softer enforcement.
      // CRITICAL + AST-verified → BLOCK
      // HIGH or non-AST-verified → WARN, allow write
      // ════════════════════════════════════════════════════════════
      const writeContent = typeof args.content === 'string' ? args.content
        : typeof args.newString === 'string' ? args.newString
        : '';
      const contentFilePath = typeof args.filePath === 'string' ? args.filePath
        : typeof args.path === 'string' ? args.path
        : 'unknown.ts';

      if (writeContent && writeContent.length > 0) {
        const sfResults = await firewall.analyzeInMemory(writeContent, contentFilePath);

        if (sfResults && sfResults.length > 0) {
          const criticalFindings = sfResults.filter((f) =>
            f.severity === 'CRITICAL' && isAstVerified(f)
          );
          const highFindings = sfResults.filter((f) =>
            f.severity === 'HIGH' && !isAstVerified(f)
          );

          // CRITICAL + AST-verified → BLOCK
          if (criticalFindings.length > 0) {
            const first = criticalFindings[0];
            throw new StructuredBlockError({
              level: 'CRITICAL',
              lobe: 'semantic-firewall',
              findingId: 'BUILD_THEATRICAL_BLOCKED',
              message: `Theatrical code detected: ${criticalFindings.map((f: { ruleId: string }) => f.ruleId).join(', ')}` +
                       (first.fixSuggestion ? ` Fix: ${first.fixSuggestion}` : ''),
            });
          }

          // HIGH or non-AST-verified → WARN, allow write
          if (highFindings.length > 0) {
            logInfo(`[write-time-gate] BUILD warnings (allowed): ${highFindings.map((f: { ruleId: string }) => f.ruleId).join(', ')}`);
            // Log but don't block — post-write audit will catch issues on disk
          }
        }
      }

      // Allow the write to proceed — post-write audit runs after
      logInfo('[write-time-gate] BUILD gate — pre-write analysis complete, write allowed');
    } else {
      // ════════════════════════════════════════════════════════════
      // NON-BUILD GATES (TEST, VERIFY, AUDIT, DELIVERY):
      // Run in-memory analysis BEFORE write. Block CRITICAL + HIGH.
      // ════════════════════════════════════════════════════════════
      const writeContent = typeof args.content === 'string' ? args.content
        : typeof args.newString === 'string' ? args.newString
        : '';
      const contentFilePath = typeof args.filePath === 'string' ? args.filePath
        : typeof args.path === 'string' ? args.path
        : 'unknown.ts';

      if (writeContent && writeContent.length > 0) {
        const inMemoryFindings = await firewall.analyzeInMemory(writeContent, contentFilePath);
        const blockingFindings = inMemoryFindings.filter(
          (f: { enforcementAction: string; severity: string }) =>
            f.enforcementAction === 'block' && (f.severity === 'CRITICAL' || f.severity === 'HIGH')
        );
        if (blockingFindings.length > 0) {
          const first = blockingFindings[0];
          throw new StructuredBlockError({
            level: 'CRITICAL',
            lobe: 'semantic-firewall',
            findingId: 'SF-' + first.ruleId.replace('SF:', '').toUpperCase(),
            message: `[${first.severity}] ${first.message}` + (first.fixSuggestion ? ` Fix: ${first.fixSuggestion}` : ''),
          });
        }
      } else {
        // No content to analyze in-memory — fall back to disk-based analyze()
        const result = firewall.analyze('write-time' as AnalysisPhase, WRITE_TIME_RULES);
        if (!result.passed) {
          const critical = result.diagnostics.filter((d: { severity: string }) => d.severity === 'CRITICAL' || d.severity === 'HIGH');
          if (critical.length > 0) {
            const first = critical[0];
            throw new StructuredBlockError({ level: 'CRITICAL', lobe: 'semantic-firewall', findingId: 'SF-' + first.rule.toUpperCase(), message: '[' + first.severity + '] ' + first.message });
          }
        }
      }
    }

    if (WRITE_TOOLS.includes(toolName) && toolName !== 'bash') {
      const filePath = typeof args.filePath === 'string' ? args.filePath : '';
      if (filePath) context.recordEdit(toolName, filePath);
    }
  };
}
