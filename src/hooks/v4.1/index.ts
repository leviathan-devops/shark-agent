/**
 * Shark Hooks v5.1 — Dual-Brain Parallel Architecture
 * WITH 2-Lobe Enforcement Brain integration.
 *
 * Enforcement pipeline:
 *   BEFORE: Frontal Lobe (Karpathy) intent detection -> CRITICAL/HIGH | MEDIUM/LOW | INFO/PASS
 *   AFTER:  RGE (code quality) + SRE (mechanical verification) -> REJECT | ACCEPT
 */
import type { Hooks } from '@opencode-ai/plugin';
import { Guardian } from '../../shared/guardian.js';
import { GateManager } from '../../shared/gates.js';
import { EvidenceCollector } from '../../shared/evidence.js';
import { createGuardianHook } from './guardian-hook.js';
import { createGateHook } from './gate-hook.js';
import { createChatMessageHook } from './chat-message-hook.js';
import { createMessagesTransformHook } from './messages-transform-hook.js';
import { createCommandExecuteHook } from './command-execute-hook.js';
import { createToolSummarizerHook } from './tool-summarizer-hook.js';
import { createSessionHook } from './session-hook.js';
import { createCompactingHook } from './compacting-hook.js';
import { createSystemTransformHook } from './system-transform-hook.js';
import { safeHook } from './safe-hook.js';
import { setGateHookBrains } from './gate-hook.js';
import { SHARK_PLUGIN_IDENTITY } from '../../shared/identity-loader.js';
import type { StateStore } from '../../shared/state-store.js';
import type { SharkMessenger } from '../../shared/messenger.js';
import type { BrainConcurrencyManager } from '../../shark/brains/brain-concurrency.js';
import type { ExecutionBrain } from '../../shark/brains/execution-brain.js';
import type { SystemBrain } from '../../shark/brains/system-brain.js';
import { EnforcementBrain, StructuredBlockError } from '../../shark/enforcement-brain/index.js';
import { isRecord, safeGetString, safeGetRecord } from '../../shared/type-guards.js';
import { extractHookArgs, extractToolName, extractSessionId } from '../../shared/hook-utils.js';
import type { EnforcementResult } from '../../shark/enforcement-brain/types.js';
import { getPlanningBrain } from '../../shark/planning-brain/index.js';
import { createWriteTimeGate } from './write-time-gate.js';
import { createPostWriteAudit } from './post-write-audit.js';
import { SemanticFirewall } from '../../semantic-firewall/semantic-firewall.js';
import { ExecutionContext } from '../../semantic-firewall/execution-context.js';
import type { GatePhase } from '../../semantic-firewall/execution-context.js';
import { setRegisteredSharkAgent } from './system-transform-hook.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { MerkleChain } from '../../evidence-engine/merkle-chain.js';
import { validateEvidence } from '../../evidence-engine/evidence-validator.js';
import { GateEngine, setGateEvaluatorWorkspacePath } from '../../gate-engine/gate-engine.js';
import type { GateID } from '../../gate-engine/gate-engine.js';

import { isSharkAgent, shouldEnforceForAgent } from '../../shared/agent-identity.js';
import { getCurrentAgent } from './agent-state.js';
import { hookRegistry } from '../../shared/warhead-synthesizer.js';
import { EnforcementError } from '../../shared/warhead-registry.js';
import { logInfo } from '../../shared/shark-logger.js';
import { AnalysisOrderDispatcher } from '../../shared/analysis-order-dispatcher.js';
import { handleToolAfter } from './tool-after-handler.js';
import { getStateTracker, prepareBlockGuidance, getFindingBus, wireBrainConsumer } from '../../eie/index.js';
import { applyPseGraduatedEscalation, resetPseOccurrences } from '../../eie/pse-loop-prevention.js';
import { eieBlock } from '../../eie/eie-block.js';

// ── Freeze fix: withTimeout utility to prevent enforcement freezes ──
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT: ${label} (${ms}ms)`)), ms);
  });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(timer!); }
}

export function createSharkHooks(
  guardian: Guardian,
  gateManager: GateManager,
  evidenceCollector: EvidenceCollector,
  stateStore: StateStore,
  messenger: SharkMessenger,
  sharkIdentityPrompt?: string,
  sharkPluginIdentity?: { sharkAgents: Set<string> },
  concurrencyManager?: BrainConcurrencyManager,
  executionBrain?: ExecutionBrain,
  systemBrain?: SystemBrain,
  enforcementBrain?: EnforcementBrain,
  semanticFirewall?: SemanticFirewall,
  executionContext?: ExecutionContext,
  merkleChain?: MerkleChain,
  gateEngine?: GateEngine,
  evValidator?: typeof validateEvidence
): Hooks {
  if (executionBrain && systemBrain) {
    setGateHookBrains(executionBrain, systemBrain);
  }
  const hookOptions = {
    pluginName: 'shark-agent',
    managedAgents: (sharkPluginIdentity ?? SHARK_PLUGIN_IDENTITY).sharkAgents,
    agentPrefix: 'shark-',
    orchestratorName: 'shark',
  };

  setRegisteredSharkAgent('shark');

  // ── FIX: Initialize GateEngine workspace path for eieVerify() ──
  // Without this, GateEngine.eieVerify() returns { passed: true } because
  // _gateEvaluatorWorkspacePath is undefined — evidence quality is never checked.
  // Setting process.cwd() enables semantic verification of evidence artifacts.
  try {
    setGateEvaluatorWorkspacePath(process.cwd());
  } catch { /* non-fatal */ }

  // ── Wire FindingBus: subscribe IntelligenceOrchestrator as 'brain' consumer ──
  // Idempotent — subscribes exactly once. The orchestrator is the SINGLE OUTPUT
  // GATEWAY: all engine findings flow through bus → orchestrator → model guidance.
  try {
    wireBrainConsumer();
  } catch { /* non-fatal — bus wiring */ }

  const writeTimeHandler = semanticFirewall && executionContext
    ? createWriteTimeGate(semanticFirewall, executionContext)
    : null;
  const postWriteHandler = semanticFirewall
    ? createPostWriteAudit(semanticFirewall, path.join(process.cwd(), '.shark'))
    : null;

  // Create hooks ONCE at factory scope — not inside per-invocation handlers
  const guardianHandler = createGuardianHook(guardian, gateManager);
  const summarizerHook = createToolSummarizerHook();
  const gateHookFn = createGateHook(gateManager, evidenceCollector, undefined);

  // Track last matrix untested count for change detection (shared with after-handler)
  const lastMatrixUntestedRef = { value: -1 };

  // Track last known gate for PSE occurrence reset on gate transition (spec §8.3)
  const lastKnownGateRef = { value: '' };

  // ── Wire AnalysisOrderDispatcher into EnforcementBrain ──────
  if (enforcementBrain && semanticFirewall) {
    const basePath = gateManager?.getBasePath?.() || path.join(process.cwd(), '.shark');
    const analysisDispatcher = new AnalysisOrderDispatcher(basePath);
    analysisDispatcher.setSemanticFirewall(semanticFirewall);

    // Wire HookRegistry (already imported statically)
    if (hookRegistry) {
      analysisDispatcher.setHookRegistry(hookRegistry);
    }

    // Wire MerkleChain — use parameter directly (already available)
    if (merkleChain) {
      analysisDispatcher.setMerkleChain(merkleChain);
    }

    enforcementBrain.setAnalysisDispatcher(analysisDispatcher);
  }

  // ── Wire Semantic Engines into Execution Brain ──────────────
  // This connects the 3-phase pipeline (blockTheatricalCode) to the
  // RGE, SRE SlopRemovalEngine, SemanticFirewall, and ICE IntentEngine.
  // FIX 4: Use single instances from EnforcementBrain, NOT new instances.
  // FIX 1: Wire ICE IntentEngine into the pipeline.
  if (executionBrain && semanticFirewall && enforcementBrain) {
    try {
      const slopRemovalEngine = enforcementBrain.getSlopRemovalEngine();
      const rgeEngine = enforcementBrain.getRgeEngine();
      const intentEngine = enforcementBrain.getIntentEngine();
      executionBrain.setSemanticEngines?.({
        semanticFirewall,
        rgeEngine,
        slopRemovalEngine,
        intentEngine,
      });
      logInfo('[Hooks] Semantic engines wired into ExecutionBrain (4-engine pipeline active)');
    } catch (e) {
      logInfo('[Hooks] Semantic engine wiring failed (non-fatal): ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  return {
    'event': createSessionHook(gateManager, evidenceCollector, undefined, stateStore, messenger, concurrencyManager),
    'chat.message': createChatMessageHook(),
    'command.execute.before': safeHook(createCommandExecuteHook(), hookOptions),
    'experimental.chat.messages.transform': safeHook(createMessagesTransformHook(), hookOptions),

    /* tool.execute.before: Frontal Lobe intent detection + Guardian protection
     *
     * Pipeline stages:
     *   0. Sync ExecutionContext with current agent
     *   1. Pre-Guardian enforcement checks (5 sub-stages)
     *      1a. Enforcement Brain (Frontal Lobe) — intent detection
     *      1b. Planning Brain — PSM gate reset
     *      1c. Write-Time Gate — block before disk write
     *      1d. Execution Brain — block theatrical code
     *      1e. Danger-commands — destructive arg detection
     *   2. Guardian hook (the big one)
     *   3. Fire warhead registry (before-execution) */
    'tool.execute.before': async (input: Record<string, unknown>, output: Record<string, unknown>) => {
      // ══ GATE TOOLS WHITELIST ══
      // Gate tools ARE the pipeline — they must NEVER be blocked by enforcement.
      // Blocking them creates an instant deadlock (agent can't advance gates).
      const GATE_TOOL_WHITELIST = new Set([
        'shark-gate', 'shark-audit', 'shark-test-runner', 'shark-deliver',
        'shark-evidence', 'shark-evidence-query', 'shark-status', 'shark-checkpoint',
      ]);
      if (GATE_TOOL_WHITELIST.has(extractToolName(input) || '')) {
        return undefined; // Always pass through — skip ALL enforcement
      }

      // ── FIX C: Hook activity logging (proves the hook fires) ──
      try {
        fs.appendFileSync(path.join(process.cwd(), '.shark', 'hook-log.json'), JSON.stringify({
          hook: 'tool.execute.before', tool: extractToolName(input),
          gate: gateManager?.getCurrentGate() || 'unknown', timestamp: Date.now()
        }) + '\n');
      } catch { /* non-fatal — logging */ }

      // ── 0. Sync ExecutionContext with current agent state (SHARK agents only) ──
      if (executionContext) {
        const sessionAgent = getCurrentAgent(input);
        if (sessionAgent && isSharkAgent(sessionAgent)) {
          executionContext.setAgent(sessionAgent);
        }
      }

      // ── EIE: Update state tracker for context matching ──────────
      try {
        const tracker = getStateTracker();
        const eieToolName = extractToolName(input);
        const eieToolArgs = extractHookArgs(input, output);
        const eieFilePath = typeof eieToolArgs?.filePath === 'string' ? eieToolArgs.filePath
          : typeof eieToolArgs?.path === 'string' ? eieToolArgs.path : undefined;
        tracker.updateTool(eieToolName, eieFilePath);
        tracker.setPhase('pre-execution');
        const eieGate = gateManager?.getCurrentGate() || 'plan';
        tracker.updateGate(eieGate);

        // ── PSE: Reset occurrence map on gate transition (spec §8.3) ──
        // The occurrence map is gate-scoped — each gate starts fresh.
        // This prevents accumulation across gates from triggering false escalations.
        if (lastKnownGateRef.value !== '' && lastKnownGateRef.value !== eieGate) {
          resetPseOccurrences();
          logInfo(`[PSE] Gate transition ${lastKnownGateRef.value} → ${eieGate}: occurrence map reset`);
        }
        lastKnownGateRef.value = eieGate;
      } catch { /* non-fatal — EIE state tracking */ }

      // ════════════════════════════════════════════════════════════════
      // ── TEST GATE GUIDANCE — tell agent how to pass (proactive) ────
      // Fires BEFORE any enforcement block so the model sees guidance
      // on every tool call while in the TEST gate.
      // ════════════════════════════════════════════════════════════════
      {
        const guidanceGate = gateManager?.getCurrentGate();
        if (guidanceGate === 'test') {
          // Check if ContainerTestResult.json exists in any evidence path
          const evidenceTestPaths = [
            path.join(process.cwd(), '.shark', 'evidence', 'test', 'ContainerTestResult.json'),
            path.join(process.cwd(), '.shark', 'evidence', 'verify', 'ContainerTestResult.json'),
            path.join(process.cwd(), '.shark', 'evidence', 'delivery', 'ContainerTestResult.json'),
            path.join(process.cwd(), '.shark', 'ContainerTestResult.json'),
          ];
          const hasTestEvidence = evidenceTestPaths.some(p => fs.existsSync(p));
          if (!hasTestEvidence) {
            if (!Array.isArray(output.system)) output.system = [];
            (output.system as string[]).push('TEST GATE: Call shark-test-runner to generate ContainerTestResult.json.');
            (output.system as string[]).push('Run: shark-test-runner action=run — this produces the required test evidence.');
          }
        }
      }

      try {
        // ════════════════════════════════════════════════════════════════
        // ── GATE ENFORCEMENT — Block wrong actions for current gate ────
        // FIX A: Direct gate-state check that runs BEFORE all other
        // enforcement subsystems. Does NOT depend on agent detection,
        // SemanticFirewall, or EnforcementBrain — just gateManager state.
        // ════════════════════════════════════════════════════════════════
        {
          const gateEnfGate = gateManager?.getCurrentGate();
          const gateEnfTools = new Set(['write', 'edit', 'create', 'write_file', 'patch']);
          if (gateEnfGate && gateEnfTools.has(extractToolName(input))) {
            const gateEnfArgs = extractHookArgs(input, output);
            const gateEnfPath = typeof gateEnfArgs?.filePath === 'string' ? gateEnfArgs.filePath
              : typeof gateEnfArgs?.path === 'string' ? gateEnfArgs.path
              : typeof gateEnfArgs?.file === 'string' ? gateEnfArgs.file : '';

            // PLAN gate: ONLY block SOURCE CODE files — allow all docs, evidence, config
            if (gateEnfGate === 'plan') {
              const lowerPath = gateEnfPath.toLowerCase();
              // Source code extensions that are blocked during PLAN
              const isSourceCode =
                lowerPath.endsWith('.ts') ||
                lowerPath.endsWith('.js') ||
                lowerPath.endsWith('.tsx') ||
                lowerPath.endsWith('.jsx') ||
                lowerPath.endsWith('.mjs') ||
                lowerPath.endsWith('.cjs') ||
                lowerPath.endsWith('.py');
              if (isSourceCode) {
                // Push guidance BEFORE throw so model reads it after the error
                if (!Array.isArray(output.system)) output.system = [];
                (output.system as string[]).push('PLAN GATE: Write SPEC.md at the project root with ## Architecture and ## Error Handling sections. Use shark-gate to advance.');
                (output.system as string[]).push('SPEC.md needs ## Architecture and ## Error Handling sections. Write it at the project root.');
                logInfo(`[GateEnforcement] BLOCKED write to ${gateEnfPath} during PLAN gate`);
                throw new Error('EIE: PLAN gate active. Source code blocked. Write SPEC.md, then call shark-gate advance.');
              }
            }

            // VERIFY/TEST/AUDIT gates: warn on source writes (soft block — prefer bash)
            if (gateEnfGate === 'verify' || gateEnfGate === 'test' || gateEnfGate === 'audit') {
              const codeExts = ['.ts', '.js', '.mjs', '.cjs', '.jsx', '.tsx'];
              const isCode = codeExts.some(ext => gateEnfPath.toLowerCase().endsWith(ext));
              if (isCode && !gateEnfPath.toLowerCase().includes('test')) {
                if (!Array.isArray(output.system)) output.system = [];
                (output.system as string[]).push(`[GATE] ${gateEnfGate.toUpperCase()} gate: prefer bash for verification, not write.`);
              }
            }
          }
        }

        // ════════════════════════════════════════════════════════════════
        // ── BASH BYPASS PREVENTION — detect file creation via bash during PLAN gate ──
        // The agent uses the bash/terminal/shell tool to write files
        // (echo/cat heredoc, output redirection), bypassing the write tool
        // gate enforcement above. This block catches that.
        // ════════════════════════════════════════════════════════════════
        {
          const bashGate = gateManager?.getCurrentGate();
          const bashToolName = extractToolName(input);
          if (bashGate === 'plan' && (bashToolName === 'bash' || bashToolName === 'terminal' || bashToolName === 'shell')) {
            const bashArgs = extractHookArgs(input, output);
            const command = String(bashArgs?.command || bashArgs?.cmd || '');
            // Detect file creation patterns
            const createsFile = /(\.ts|\.js|\.tsx|\.jsx)\s*$/i.test(command) &&
              /(echo|cat|printf|tee|>|>>|heredoc|EOF)/i.test(command);
            const hasWriteRedirect = />\s*['"]?[^'"|&\s]+\.(ts|js|tsx|jsx)['"]?/i.test(command);

            if (createsFile || hasWriteRedirect) {
              if (!Array.isArray(output.system)) output.system = [];
              (output.system as string[]).push('PLAN GATE: Cannot create source files via bash. Write SPEC.md first.');
              (output.system as string[]).push('SPEC.md needs ## Architecture and ## Error Handling sections.');
              logInfo(`[BashBypass] BLOCKED bash file creation during PLAN gate: ${command.slice(0, 120)}`);
              throw new Error('EIE: PLAN gate active. Bash file creation blocked. Write SPEC.md first, then call shark-gate advance (no gate parameter) to advance to the next gate.');
            }
          }
        }

        // ════════════════════════════════════════════════════════════════
        // ── 1. PRE-GUARDIAN ENFORCEMENT CHECKS ──────────────────────────
        // ════════════════════════════════════════════════════════════════

        // ── 0.5. Sync Enforcement Brain gate state with GateManager ──────
        // GateManager stores lowercase ('plan'); EnforcementBrain/IntentClassifier
        // require uppercase GatePhase ('PLAN'). Uppercase before setGate or the
        // validation in IntentClassifier.setGate() silently rejects it.
        if (enforcementBrain && gateManager) {
          const rawGate = gateManager.getCurrentGate();
          const currentGate = (typeof rawGate === 'string' ? rawGate.toUpperCase() : 'PLAN') as unknown as import('../../shark/enforcement-brain/types.js').GatePhase;
          enforcementBrain.setGate(currentGate);
        }

        // ── 1c. Write-Time Gate — block before write reaches disk ────────
        if (writeTimeHandler && executionContext && shouldEnforceForAgent(getCurrentAgent(input))) {
          // Explicit SF gate sync: pass currentGate from GateManager directly
          // rather than relying on the ExecutionContext.getGateManager() singleton chain.
          const currentGateFromGM = gateManager?.getCurrentGate() || 'plan';
          const wtToolName = extractToolName(input);
          const wtTools = new Set(['write', 'edit', 'write_file', 'create', 'patch']);
          if (wtTools.has(wtToolName)) {
            try {
              await withTimeout(writeTimeHandler(input, output, currentGateFromGM), 5000, 'writeTimeGate');
            } catch (e) {
              if (e && typeof e === 'object' && (e as Error).name === 'StructuredBlockError') {
                throw e;  // Re-throw blocks — must not swallow enforcement decisions
              }
              logInfo('[writeTimeGate] timeout or error: ' + (e instanceof Error ? e.message : String(e)));
            }
          }
        }

        // ── 1a. Enforcement Brain (Frontal Lobe) — intent detection; SHARK agents only ──
        if (enforcementBrain) {
          const beforeSessionAgent = getCurrentAgent(input);
          if (beforeSessionAgent && isSharkAgent(beforeSessionAgent)) {
            const toolName = extractToolName(input);
            const toolArgs = extractHookArgs(input, output);
            const results = await withTimeout(enforcementBrain.evaluateBefore(toolName, toolArgs), 5000, 'evaluateBefore');

            // ── FindingBus: emit enforcement findings before any block ──
            // Routes ICE/Frontal Lobe intent findings to the orchestrator via the bus.
            try {
              const bus = getFindingBus();
              const fbGate = gateManager?.getCurrentGate() || 'plan';
              for (const r of results) {
                const sev = r.level.toLowerCase();
                if (sev === 'pass' || sev === 'info') continue;
                bus.emit({
                  source: r.lobe === 'rge' ? 'rge' : r.lobe === 'sre' ? 'sre' : r.lobe === 'ice' ? 'ice' : 'enforcement-brain',
                  engine: r.lobe === 'rge' ? 'RGE' : r.lobe === 'sre' ? 'SRE' : r.lobe === 'ice' ? 'ICE' : 'EIE',
                  category: r.lobe === 'rge' ? 'typescript-antipattern' : r.lobe === 'sre' ? 'theatrical-code' : 'intent-violation',
                  severity: sev as 'critical' | 'high' | 'medium' | 'low',
                  message: r.message || '',
                  evidence: { file: r.filePath, patternId: r.findingId, toolName },
                  gateContext: fbGate,
                  toolContext: toolName,
                });
              }
            } catch { /* FindingBus emit is non-fatal */ }

            const blocks = results.filter((r: EnforcementResult) => r.level === 'CRITICAL' || r.level === 'HIGH');
            if (blocks.length > 0) {
              throw new StructuredBlockError(blocks[0]);
            }
            const warns = results.filter((r: EnforcementResult) => r.level === 'MEDIUM' || r.level === 'LOW');
            if (warns.length > 0) {
              if (!Array.isArray(output.system)) output.system = [];
              (output.system as unknown[]).push(`[ENFORCEMENT] ${warns[0].message}`);
            }
          }
        }

        // ── 1b. Planning Brain (before execution) + PSE graduated escalation ──
        try {
          const planningBrain = getPlanningBrain();
          if (planningBrain && shouldEnforceForAgent(getCurrentAgent(input))) {
            const toolName = extractToolName(input);
            const toolArgs = extractHookArgs(input, output);
            const currentGate = gateManager.getCurrentGate();
            const result = planningBrain.onBeforeExecution(toolName, toolArgs, currentGate);

            // Push any non-PSE bullet (VerbFrameLexicon context warnings, etc.)
            if (result.bullet) {
              if (!Array.isArray(output.system)) output.system = [];
              (output.system as unknown[]).push(result.bullet);
            }

            // ════════════════════════════════════════════════════════════════
            // PSE GRADUATED ESCALATION (spec §8)
            //
            // When the PSE engine detects a loop, the PlanningBrain returns
            // pseLoopType + pseOccurrence (without enforcing internally).
            // This layer applies the graduated protocol:
            //   Occurrence 1  → INFORM:  bullet, no block
            //   Occurrence 2  → WARN:    bullet + PSM warhead queued, no block
            //   Occurrence 3+ → BLOCK:   eieBlock + PSM + GUIDED profile
            //
            // FindingBus.emit() fires at every occurrence.
            // Orchestrator.setPendingWarhead() fires at occurrence 2+.
            // eieBlock() (which throws) fires at occurrence 3+.
            // ════════════════════════════════════════════════════════════════
            if (result.pseLoopType) {
              const escalation = applyPseGraduatedEscalation({
                loopType: result.pseLoopType,
                gate: currentGate,
                toolName,
              });

              if (escalation.shouldBlock) {
                // Occurrence 3+: HARD BLOCK via eieBlock (canonical EIE block)
                // eieBlock pushes bullets to output.system BEFORE throwing.
                if (!Array.isArray(output.system)) output.system = [];
                logInfo(`[PSE] LOOP ESCALATION: ${escalation.patternId} occurrence ${escalation.occurrence} — BLOCKING via eieBlock`);
                eieBlock(
                  output as { system: string[] },
                  getStateTracker().state,
                  `Behavioral loop detected (${escalation.patternId}, occurrence ${escalation.occurrence}). ` +
                  `PSM activation required. ${escalation.patternName}.`,
                );
                // eieBlock always throws — this line is unreachable
              }

              // Occurrence 1 (INFORM) or 2 (WARN): push bullet, no block
              if (escalation.bullet) {
                if (!Array.isArray(output.system)) output.system = [];
                (output.system as unknown[]).push(escalation.bullet);
                logInfo(`[PSE] Loop detected: ${escalation.patternId} occurrence ${escalation.occurrence} (${escalation.level})`);
              }
            }
          }
        } catch (err) {
          // CRITICAL: StructuredBlockError from context enforcement and claim
          // enforcement MUST propagate to abort the tool call.
          // EIE blocks (from eieBlock) also propagate — they throw Error("EIE: ...").
          if (err instanceof StructuredBlockError || (err && typeof err === 'object' && (err as Error).name === 'StructuredBlockError')) {
            logInfo(`[PlanningBrain] BLOCK enforced: ${(err as Error).message}`);
            throw err; // RE-THROW — this aborts the tool execution
          }
          // EIE blocks (eieBlock throws Error with "EIE:" prefix) — propagate
          if (err instanceof Error && err.message.startsWith('EIE: ')) {
            logInfo(`[PlanningBrain] EIE BLOCK enforced: ${err.message}`);
            throw err;
          }
          // Non-block errors (e.g. init failures) are non-fatal — log and continue
          logInfo('[PlanningBrain] onBeforeExecution non-fatal error: ' + (err instanceof Error ? err.message : String(err)));
        }

        // ── 1c. Write-Time Gate — block before write reaches disk ────────
        // [MOVED to before enforcement brain (1a)]

        // ── 1d. Execution Brain — blockTheatricalCode (SHARK agents only) ─
        if (executionBrain && shouldEnforceForAgent(getCurrentAgent(input))) {
          const tName = extractToolName(input);
          if (tName === 'write' || tName === 'edit' || tName === 'write_file' || tName === 'create') {
            const tArgs = extractHookArgs(input, output);
            const content = safeGetString(tArgs, 'content') || safeGetString(tArgs, 'newString');
            if (content) {
              const sessionAgent = getCurrentAgent(input) || '';
              const currentGate = gateManager?.getCurrentGate() || 'plan';
              const context = { filePath: typeof tArgs.filePath === 'string' ? tArgs.filePath : '', toolName: tName, gate: currentGate, surroundingCode: '', agent: sessionAgent };
              const result = await executionBrain.blockTheatricalCode(content, context);
              if (result.blocked && result.violations.length > 0) {
                const firstViolation = result.violations[0];
                const detector = firstViolation.detector || { id: 'UNKNOWN', category: 'theatrical', description: 'Theatrical code detected', severity: 'critical' as const, fix: 'Replace mock/stub code with real implementation.' };
                const correction = detector.fix || 'Replace mock/stub code with real implementation.';
                const desc = detector.description || 'Code contains theatrical patterns';
                throw new StructuredBlockError({
                  level: 'CRITICAL',
                  lobe: 'execution-brain',
                  findingId: 'EB-THEATRICAL-' + (detector.id || 'BLOCK'),
                  message: `[EB] Theatrical: ${desc}. ${correction}`,
                });
              }
            }
          }
        }

        // ════════════════════════════════════════════════════════════════
        // ── 2. GUARDIAN HOOK (created once at factory scope) ────────────
        // ════════════════════════════════════════════════════════════════
        if (guardianHandler) {
          try {
            await withTimeout(guardianHandler(input as any, output as any), 5000, 'guardianHook');
          } catch (e) {
            // Re-throw block errors so enforcement still works
            if (e && typeof e === 'object' && (e as Error).name === 'StructuredBlockError') throw e;
            logInfo('[guardianHook] timeout or error: ' + (e instanceof Error ? e.message : String(e)));
          }
        }

        // ════════════════════════════════════════════════════════════════
        // ── 3. FIRE WARHEAD REGISTRY (before-execution) ─────────────────
        // ════════════════════════════════════════════════════════════════
        try {
          const beforeAgent = getCurrentAgent(input) || '';
          if (shouldEnforceForAgent(beforeAgent)) {
            await hookRegistry.fire('tool.execute.before', 
              { ...input, agent: beforeAgent, args: output?.args || {} }, 
              output
            );
          }
        } catch (err) {
          if (err && typeof err === 'object' && (err as Error).name === 'EnforcementError') throw err;
          logInfo('[WarheadRegistry] before hook error: ' + (err instanceof Error ? err.message : String(err)));
        }
      } catch (err) {
        // ── EIE: Push bullet guidance before re-throw ──────────────
        // Bullets are <80 char guidance strings pushed to output.system
        // BEFORE the throw so the model reads them after the error.
        try {
          const tracker = getStateTracker();
          const eieAdapter = {
            message: (msg: { role: string; content: string }) => {
              if (!Array.isArray(output.system)) output.system = [];
              (output.system as string[]).push(msg.content);
            },
          };
          prepareBlockGuidance(eieAdapter, tracker.state);
        } catch { /* EIE failure must never block enforcement */ }

        logInfo('[EnforcementCatch] Blocked: ' + (err instanceof Error ? err.message : String(err)));
        throw err;
      }
    },

    /* tool.execute.after: RGE code quality + SRE mechanical verification.
     * Full post-execution pipeline delegated to tool-after-handler.ts.
     * See handleToolAfter() for the 16-stage enforcement pipeline. */
    'tool.execute.after': async (input: Record<string, unknown>, output: Record<string, unknown>) => {
      await handleToolAfter(input, output, {
        enforcementBrain,
        gateManager,
        merkleChain,
        gateEngine,
        evValidator,
        postWriteHandler: postWriteHandler as ((input: Record<string, unknown>, output: Record<string, unknown>) => Promise<void>) | null,
        summarizerHook: summarizerHook as ((input: Record<string, unknown>, output: Record<string, unknown>) => Promise<void>) | null,
        gateHookFn: (gateHookFn ?? null) as ((input: Record<string, unknown>, output: Record<string, unknown>) => Promise<void>) | null,
        lastMatrixUntestedRef,
      });
    },

    'experimental.session.compacting': safeHook(createCompactingHook(gateManager), hookOptions),
    'experimental.chat.system.transform': createSystemTransformHook(gateManager, undefined),
  };
}