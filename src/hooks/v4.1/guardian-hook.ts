/**
 * Guardian Hook — Layered Enforcement Architecture (Trident-style)
 *
 * V4.9.x Rewrite: Consolidated 14 inline pattern arrays into 8 logical
 * layer evaluators, mirroring Trident's ALL_LAYERS pattern.
 *
 * Architectural changes from V4.9:
 *   - Single `if (!isShark) return;` guard clause (was 5 repeated checks)
 *   - 8 layer evaluators replace scattered for-loops
 *   - ALL throws use StructuredBlockError (never plain Error)
 *   - Evidence gate is BLOCKING in TEST/VERIFY/DELIVERY gates
 *   - Zone protection stays inline via Guardian class methods
 *   - LayerEngine runs as part of the SAME pipeline (not a second pass)
 *
 * V4.9: Container Testing Firewalls
 * - BANS "opencode run" for testing (does NOT fire hooks)
 * - Blocks static grep/theatrical tests
 * - Forces proper container testing workflow
 * - Enforces semantic container isolation
 */

import type { Hooks } from '@opencode-ai/plugin';
import { Guardian } from '../../shared/guardian.js';
import { extractCommandFromArgs } from './utils.js';
import { getCurrentAgent, getLastUserMessage } from './agent-state.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import type { GateManager } from '../../shared/gates.js';
import { isAllowed } from '../../shared/gates.js';
import { isRecord, safeGetString, safeGetRecord } from '../../shared/type-guards.js';
import { classifyCommand, classifyCommandDeep, isBannedOpencodeRun, isWrongContainerCommand } from '../../shared/firewall/command-classifier.js';
import { hasTheatricalPipe, getTheatricalPipeReason } from '../../shared/firewall/pipe-analyzer.js';
import { analyzeContent } from '../../shared/firewall/content-analyzer.js';

import * as path from 'node:path';
import * as fs from 'node:fs';
import { StructuredBlockError } from '../../shark/enforcement-brain/index.js';

// ═══════════════════════════════════════════════════════════════
// INLINED from deleted firewall-patterns.ts
// ═══════════════════════════════════════════════════════════════

type Gate = 'plan' | 'build' | 'test' | 'verify' | 'audit' | 'delivery';

const CROSS_AGENT_TOOLS = new Set([
  'hermes_remember', 'hermes_recall', 'hermes_context',
  'hive_remember', 'hive_context', 'hive_status',
  'memremember', 'memsearch', 'memread', 'membrowse', 'memcommit',
  'knowledge_remember', 'knowledge_recall', 'knowledge_query',
  'manta-gate', 'manta-status', 'manta-evidence',
  'manta_gate', 'manta_status', 'manta_evidence',
  'trident-status', 'trident-audit', 'trident-report', 'trident-help',
  'kraken_remember', 'kraken_recall', 'kraken_dispatch',
  'spawn_manta_agent', 'spawn_kraken_agent',
  'memlink_parent',
]);

// Contextual firewall rules migrated to deterministic-rules/detect-contextual-firewall.ts
import { logInfo } from '../../shared/shark-logger.js';
import { isToolAllowed } from '../../security/tool-allowlist.js';

// ═══════════════════════════════════════════════════════════════
// REFERENCE ARRAYS — Kept for compatibility
// ═══════════════════════════════════════════════════════════════

const DANGEROUS_TOOLS = new Set([
  'terminal', 'mcp_terminal', 'bash', 'mcp_bash',
  'write_file', 'mcp_write_file',
  'patch', 'mcp_patch',
  'edit', 'mcp_edit',
  'delete_file', 'mcp_delete_file'
]);

const LEGITIMATE_PATTERNS = [
  /mkdir\s+-p/i, /cp\s+-r/i, /mv\s+/i, /cat\s+[^\|>]+$/i,
  /head\s+-[0-9]+\s+/i, /tail\s+-[0-9]+\s+/i,
  /grep\s+-[rEn]+.*[^\|]$/i, /find\s+.*-name/i, /test\s+-d/i, /test\s+-x/i,
];

// ═══════════════════════════════════════════════════════════════
// LAYER CONTEXT — shared evaluation context
// ═══════════════════════════════════════════════════════════════

interface LayerContext {
  tool: string;
  command: string | null;
  args: Record<string, unknown> | null;
  guardian: Guardian;
  currentGate: Gate;
  sessionID?: string;
}

/**
 * Each layer evaluator either returns void (PASS) or throws
 * StructuredBlockError (BLOCK). Layers run in sequence; the first
 * BLOCK stops the pipeline.
 */
type GuardianLayerEvaluator = (ctx: LayerContext) => void;

// ═══════════════════════════════════════════════════════════════
// LAYER 1: CONTEXTUAL_FIREWALL — migrated to deterministic-rules/detect-contextual-firewall.ts
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// LAYER 2: CROSS_AGENT — L5.7 administrative tool isolation
// ═══════════════════════════════════════════════════════════════

function layerCrossAgent(ctx: LayerContext): void {
  if (CROSS_AGENT_TOOLS.has(ctx.tool)) {
    throw new StructuredBlockError({
      level: 'CRITICAL',
      lobe: 'semantic-firewall',
      findingId: 'L5.7-CROSS_AGENT',
      message: `Tool ${ctx.tool} is restricted to administrative agents.`,
      correction: 'Use Shark-native tools instead of cross-agent tools.',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// LAYER 3: ZONE_WRITE — Guardian class zone/edit/write protection
// ═══════════════════════════════════════════════════════════════

function layerZoneWrite(ctx: LayerContext): void {
  // Dangerous command blocking
  if (ctx.command && ctx.guardian.isDangerousCommand(ctx.command)) {
    throw new StructuredBlockError({
      level: 'CRITICAL',
      lobe: 'semantic-firewall',
      findingId: 'DANGEROUS_COMMAND_BLOCKED',
      message: `[GUARDIAN] DANGEROUS_COMMAND_BLOCKED: ${ctx.command}`,
      correction: 'This command is classified as dangerous and is blocked.',
    });
  }

  // Zone-based write protection
  if ((ctx.tool.includes('write') || ctx.tool.includes('patch')) && ctx.args) {
    const writePath = (ctx.args.filePath as string) || (ctx.args.path as string) || null;
    if (writePath && !ctx.guardian.canWrite(writePath, ctx.currentGate)) {
      throw new StructuredBlockError({
        level: 'CRITICAL',
        lobe: 'semantic-firewall',
        findingId: 'ZONE_VIOLATION',
        message: `[GUARDIAN] ZONE_VIOLATION: ${ctx.guardian.classifyZone(writePath)} zone — ${writePath} is forbidden during ${ctx.currentGate} phase.`,
        correction: `Wait for a permitted gate or write to an allowed zone.`,
      });
    }
    if (writePath) ctx.guardian.registerCreate(writePath);
  }

  // Source file edit protection
  if ((ctx.tool === 'edit' || ctx.tool === 'mcp_edit') && ctx.args) {
    const ea = ctx.args as { filePath?: string };
    if (ea?.filePath) {
      if (!ctx.guardian.canEdit(ea.filePath, ctx.currentGate)) {
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'semantic-firewall',
          findingId: 'EDIT_BLOCKED',
          message: `[GUARDIAN] Edit blocked: ${ea.filePath} is forbidden during ${ctx.currentGate} phase.`,
          correction: 'Duplicate the file first or wait for a permitted gate.',
        });
      }
      ctx.guardian.registerEdit(ea.filePath);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// LAYER 4: SOURCE_PROTECTION — src/ write-blockade
//
// FIXED (v5.1): Gate-aware enforcement via GATE_ALLOWED_OPERATIONS.
// During BUILD gate, writes to src/ are EXPECTED — that's when code
// is created. Only enforce source protection when writeToSrc is false
// (PLAN, TEST, VERIFY, AUDIT, DELIVERY gates).
// ═══════════════════════════════════════════════════════════════

function layerSourceProtection(ctx: LayerContext): void {
  // ═══════════════════════════════════════════════════════════════
  // Check 1: File modification protection — gate-aware (relaxed during BUILD)
  //
  // In BUILD gate, writeToSrc is allowed — canModifyFile is not enforced.
  // In all other gates (PLAN, TEST, VERIFY, AUDIT, DELIVERY), source file
  // modification is blocked unless the file has prior edit history or is
  // within the filesystem grace period.
  // ═══════════════════════════════════════════════════════════════
  if (!isAllowed(ctx.currentGate, 'writeToSrc')) {
    // Only enforce when NOT in BUILD gate
    if (ctx.command) {
      const mc = ctx.guardian?.canModifyFile(ctx.command);
      if (mc && !mc.allowed) {
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'semantic-firewall',
          findingId: 'SOURCE_MODIFICATION_BLOCKED',
          message: `Cannot modify files during ${ctx.currentGate} gate. Advance to BUILD gate first.`,
          correction: 'Duplicate the file before modifying.',
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Check 2: Shell redirect detection — ALWAYS enforced, regardless of gate
  //
  // Only applies to bash/terminal tools with a command field. Shell redirects
  // to src/ bypass write-time content analysis (the file is overwritten at
  // the OS level, so hooks can't inspect what was written). Block unconditionally.
  //
  // For write tools (write, edit, patch, create), the content field can
  // naturally contain paths like `> src/scanner.ts` in markdown blockquotes or
  // code comments — these are NOT shell redirects and must not trigger blocks.
  // The write target path is already validated by layerZoneWrite.
  // ═══════════════════════════════════════════════════════════════
  if (ctx.tool === 'bash' && ctx.command && ctx.args) {
    const rawArgs = typeof ctx.args === 'string' ? ctx.args : JSON.stringify(ctx.args);

    // Check for redirect patterns that bypass write-time content analysis
    if (/>\s*.*src\//i.test(rawArgs) ||
        />>\s*.*src\//i.test(rawArgs) ||
        /tee\s+.*src\//i.test(rawArgs)) {
      throw new StructuredBlockError({
        level: 'CRITICAL',
        lobe: 'semantic-firewall',
        findingId: 'SOURCE_INSPECTION_BLOCKED',
        message: 'Shell redirect to src/ detected. Use the write tool instead — it provides content validation.',
        correction: 'Do not redirect output to src/ files. Use the write tool instead.',
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// LAYER 5: TEST_FRAMEWORK — L2/L5.13 fake test & theatrical verification
// ═══════════════════════════════════════════════════════════════

function layerTestFramework(ctx: LayerContext): void {
  if (!ctx.command) return;

  // L2: Fake Test Runner — use command classifier
  const classification = classifyCommandDeep(ctx.command);
  if (classification.category === 'TEST') {
    // Allow in TEST/VERIFY gates, block in PLAN/BUILD/AUDIT/DELIVERY
    const allowedGates: Gate[] = ['test', 'verify'];
    if (!allowedGates.includes(ctx.currentGate)) {
      throw new StructuredBlockError({
        level: 'CRITICAL',
        lobe: 'semantic-firewall',
        findingId: 'FIREWALL-L2',
        message: `[FIREWALL L2] Fake test runner: "${classification.command}" runs tests without container. Use shark-test-runner for authenticated container testing.`,
        correction: 'Use shark-test-runner for authenticated container testing.',
      });
    }
  }

  // L5.13: Theatrical verification — grep/wc on dist files
  // Uses pipe analyzer for "cat | wc" patterns on dist/
  if (hasTheatricalPipe(ctx.command) && ctx.command.includes('dist')) {
    throw new StructuredBlockError({
      level: 'CRITICAL',
      lobe: 'semantic-firewall',
      findingId: 'FIREWALL-L5.13',
      message: `[FIREWALL L5.13] THEATRICAL TEST BLOCKED: ${getTheatricalPipeReason(ctx.command)}`,
      correction: 'Test actual function in container TUI.',
    });
  }

  // Missing container
  const lower = ctx.command.toLowerCase();
  if (/verify.*test.*without.*container|skip.*container.*test|just\s+run\s+opencode.*test/i.test(lower)) {
    throw new StructuredBlockError({
      level: 'CRITICAL',
      lobe: 'semantic-firewall',
      findingId: 'MISSING_CONTAINER',
      message: `[GUARDIAN] MISSING CONTAINER: All Shark plugin testing MUST happen in a sandboxed container.`,
      correction: 'Create one with shark-spawn-container.',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// LAYER 6: CONTAINER — L5.12 wrong container & banned opencode run
// ═══════════════════════════════════════════════════════════════

function layerContainer(ctx: LayerContext): void {
  if (!ctx.command) return;

  // Wrong container commands — use command classifier
  if (isWrongContainerCommand(ctx.command)) {
    throw new StructuredBlockError({
      level: 'CRITICAL',
      lobe: 'semantic-firewall',
      findingId: 'WRONG_CONTAINER_COMMAND_BLOCKED',
      message: `[GUARDIAN] WRONG_CONTAINER_COMMAND_BLOCKED: ${ctx.command}`,
      correction: 'Use Shark container tooling instead.',
    });
  }

  // BANNED: opencode run for testing (does not fire hooks)
  if (isBannedOpencodeRun(ctx.command)) {
    throw new StructuredBlockError({
      level: 'CRITICAL',
      lobe: 'semantic-firewall',
      findingId: 'FIREWALL-L5.12',
      message: `[FIREWALL L5.12] BANNED: "opencode run" does NOT fire hooks. Use TUI via tmux + docker exec -it for all plugin testing.`,
      correction: 'Use TUI via tmux + docker exec -it for all plugin testing.',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// LAYER 7: PRIVILEGE — L5.12/L5.13/L5.19 security enforcement
// ═══════════════════════════════════════════════════════════════

function layerPrivilege(ctx: LayerContext): void {
  // ═══════════════════════════════════════════════════════════════
  // HARD FIREWALL: rm -rf — PERMANENTLY BLOCKED. No exceptions.
  // Must fire BEFORE any other check in this layer.
  // ═══════════════════════════════════════════════════════════════
  if (ctx.command && /rm\s+-rf/i.test(ctx.command)) {
    throw new StructuredBlockError({
      level: 'CRITICAL',
      lobe: 'semantic-firewall',
      findingId: 'RM_RF_PERMANENTLY_BLOCKED',
      message: `[GUARDIAN] CRITICAL: rm -rf is PERMANENTLY BLOCKED. Use targeted file deletion instead.`,
      correction: 'Use targeted file deletion (e.g., rm <specific-file>) instead of recursive force delete.',
    });
  }

  if (!ctx.command) return;

  const classification = classifyCommandDeep(ctx.command);

  // CRITICAL risk: privilege escalation or container escape
  if (classification.risk === 'CRITICAL') {
    if (classification.category === 'PRIVILEGE') {
      throw new StructuredBlockError({
        level: 'CRITICAL',
        lobe: 'semantic-firewall',
        findingId: 'FIREWALL-L5.12-PRIV',
        message: `[FIREWALL L5.12] PRIVILEGE_ESCALATION_BLOCKED: ${classification.command} — ${classification.risk} risk.`,
        correction: 'Privilege escalation operations are not permitted.',
      });
    }
    if (classification.category === 'CONTAINER_ESCAPE') {
      throw new StructuredBlockError({
        level: 'CRITICAL',
        lobe: 'semantic-firewall',
        findingId: 'FIREWALL-L5.19',
        message: `[FIREWALL L5.19] CONTAINER_ESCAPE_BLOCKED: ${classification.command} — Host access and container breakout are FORBIDDEN.`,
        correction: 'All operations must remain sandboxed.',
      });
    }
  }

  // HIGH risk: network egress
  if (classification.risk === 'HIGH' && classification.category === 'NETWORK') {
    throw new StructuredBlockError({
      level: 'CRITICAL',
      lobe: 'semantic-firewall',
      findingId: 'FIREWALL-L5.13-NET',
      message: `[FIREWALL L5.13] NETWORK_EGRESS_BLOCKED: ${classification.command} — External network access is not allowed in sandbox.`,
      correction: 'External network access is not permitted.',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// LAYER 8: THEATRICAL — L1/L5.14/L5.17 content & claim detection
// ═══════════════════════════════════════════════════════════════

function layerTheatrical(ctx: LayerContext): void {
  // L1: Theatrical Detection — pipe-to-wc, pipe-to-tee
  if (ctx.command && hasTheatricalPipe(ctx.command)) {
    throw new StructuredBlockError({
      level: 'CRITICAL',
      lobe: 'semantic-firewall',
      findingId: 'FIREWALL-L1',
      message: `[FIREWALL L1] THEATRICAL_BLOCKED: ${getTheatricalPipeReason(ctx.command)}`,
      correction: 'Run actual tests in container.',
    });
  }

  // L5.14 + L5.17: Content analysis for write/edit tools
  if (ctx.tool === 'write' || ctx.tool === 'edit' || ctx.tool === 'write_file' || ctx.tool === 'mcp_write_file' || ctx.tool === 'mcp_edit' || ctx.tool === 'patch' || ctx.tool === 'mcp_patch' || ctx.tool === 'create' || ctx.tool === 'mcp_create') {
    const content = (ctx.args as Record<string, unknown>)?.content as string
      || (ctx.args as Record<string, unknown>)?.newString as string
      || '';

    // Check last user message for derailment instructions
    const lastMsg = getLastUserMessage(ctx.sessionID);
    if (lastMsg) {
      const lastMsgFeatures = analyzeContent(lastMsg);
      if (lastMsgFeatures.hasDeletionIntent) {
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'semantic-firewall',
          findingId: 'FIREWALL-L5.17',
          message: `[FIREWALL L5.17] THEATRICAL_DELETION_BLOCKED: User instructed to delete/start from scratch. Do not comply. Fix existing code instead.`,
          correction: 'Fix existing code instead of starting from scratch.',
        });
      }
    }

    if (content) {
      const features = analyzeContent(content);

      if (features.isTheatricalSimulation) {
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'semantic-firewall',
          findingId: 'FIREWALL-L5.14',
          message: `[FIREWALL L5.14] CONTENT_BLOCKED: ${features.reason}`,
          correction: 'Use actual tool calls, not formatted output.',
        });
      }

      if (features.hasDeletionIntent) {
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'semantic-firewall',
          findingId: 'FIREWALL-L5.17',
          message: `[FIREWALL L5.17] THEATRICAL_DELETION_BLOCKED: Do not delete code and start from scratch. Fix the existing code properly.`,
          correction: 'Fix the existing code properly.',
        });
      }

      if (features.hasOffTopicReferences) {
        throw new StructuredBlockError({
          level: 'CRITICAL',
          lobe: 'semantic-firewall',
          findingId: 'FIREWALL-L5.17',
          message: `[FIREWALL L5.17] OFF_TOPIC_BLOCKED: ${features.reason}`,
          correction: 'Remove off-topic references.',
        });
      }
    }
  }

  // L5.17: Excuse patterns in all args
  if (ctx.args && typeof ctx.args === 'object') {
    const allText = JSON.stringify(ctx.args);
    const excuseFeatures = analyzeContent(allText);
    if (excuseFeatures.hasExcuseLanguage) {
      throw new StructuredBlockError({
        level: 'CRITICAL',
        lobe: 'semantic-firewall',
        findingId: 'FIREWALL-L5.17',
        message: `[FIREWALL L5.17] EXCUSE_BLOCKED: Stop making excuses. Fix the problem properly.`,
        correction: 'Fix the problem properly.',
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SHARK_LAYERS — ordered pipeline of all 8 layer evaluators
// ═══════════════════════════════════════════════════════════════

const SHARK_LAYERS: GuardianLayerEvaluator[] = [
  // layerContextualFirewall removed — migrated to deterministic-rules/detect-contextual-firewall.ts
  layerCrossAgent,          // L5.7 administrative tool isolation
  layerZoneWrite,           // Guardian zone/edit/write protection
  layerSourceProtection,    // src/ write-blockade
  layerTestFramework,       // L2/L5.13 fake test & theatrical verification
  layerContainer,           // L5.12 wrong container & banned opencode run
  layerPrivilege,           // L5.12/L5.13/L5.19 security enforcement
  layerTheatrical,          // L1/L5.14/L5.17 content & claim detection
];

// ═══════════════════════════════════════════════════════════════
// (v4.8.4 Evidence gate + lazy singletons removed — decommissioned)
// ═══════════════════════════════════════════════════════════════
// MAIN HOOK — Single guard, layered pipeline, blocking evidence gate
// ═══════════════════════════════════════════════════════════════

export function createGuardianHook(guardian: Guardian, gateManager: GateManager): Hooks['tool.execute.before'] {
  return async (input, output) => {
    const { tool, sessionID } = input as { tool: string; sessionID?: string; callID?: string };
    const args = (output as { args?: Record<string, unknown> })?.args ?? (isRecord(input) ? safeGetRecord(input, 'args') : null);
    const command = extractCommandFromArgs(args);

    const sessionAgent = getCurrentAgent(sessionID);
    if (!sessionAgent) return;

    // ══ SINGLE GUARD CLAUSE — one check, not five ══
    const isShark = isSharkAgent(sessionAgent);
    if (!isShark) return;

    // ══ TOOL ALLOWLIST CHECK — deny-default ══
    // Any tool NOT in the SHARK allowlist is blocked before pattern checks run.
    if (!isToolAllowed(tool)) {
      throw new StructuredBlockError({
        level: 'CRITICAL',
        lobe: 'semantic-firewall',
        findingId: 'TOOL_BLOCKED',
        message: `Tool "${tool}" is not in the SHARK allowlist`,
        correction: 'Use only shark-* tools or approved external tools (read, glob, grep, write, edit, bash, todowrite)'
      });
    }

    const currentAgent = sessionAgent;
    const currentGate = gateManager.getCurrentGate() as Gate;

    // Log hook firing evidence for T2 Bible §Checklist (to .shark/shark-agent.log)
    logInfo(`tool.execute.before: agent=${sessionAgent}, tool=${tool}, gate=${currentGate}`);
    if (command) {
      const truncatedCmd = command.length > 80 ? command.substring(0, 80) + '...' : command;
      logInfo(`tool.execute.before command: ${truncatedCmd}`);
    }

    // ══ LAYER PIPELINE — run all 8 layers in sequence ══
    // The first layer that throws StructuredBlockError stops execution.
    const ctx: LayerContext = { tool, command, args: args || null, guardian, currentGate, sessionID };
    for (const layer of SHARK_LAYERS) {
      layer(ctx);
    }

    // ══ LAYER ENGINE — (v4.8.4 Firewall Layer Engine removed — decommissioned) ══
  };
}
