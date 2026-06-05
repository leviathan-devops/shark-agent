/**
 * Guardian Hook — tool.execute.before integration
 * 
 * V4.8.4: Contextual Firewall with Agent Isolation
 * Blocks dangerous tools for Shark agents only, fails open for others.
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
import { getCurrentAgent, setCurrentAgent, getLastUserMessage } from './agent-state.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { CROSS_AGENT_TOOLS, CONTEXTUAL_FIREWALL_RULES, type Gate } from '../../shared/firewall-patterns.js';
import type { StateStore } from '../../shared/state-store.js';
import type { GateManager } from '../../shared/gates.js';

import * as path from 'node:path';
import { IntentClassifier } from '../firewall/intent-classifier.js';
import { buildContext } from '../firewall/firewall-context.js';
import { LayerEngine } from '../firewall/layer-engine.js';
import { EvidenceGate } from '../firewall/evidence-gate.js';
import { FirewallAudit } from '../firewall/firewall-audit.js';
import { createBlockResponse, StructuredBlockError } from '../firewall/block-response.js';
import { DEFAULT_LAYERS } from '../firewall/layers/index.js';
import { logInfo } from '../../shared/shark-logger.js';

const DANGEROUS_TOOLS = new Set([
  'terminal', 'mcp_terminal', 'bash', 'mcp_bash',
  'write_file', 'mcp_write_file',
  'patch', 'mcp_patch',
  'edit', 'mcp_edit',
  'delete_file', 'mcp_delete_file'
]);

const THEATRICAL_PATTERNS = [
  /\|.*wc\s+-l/i, /wc\s+-l.*\|/i, /cat.*\|.*wc/i, /grep.*\|.*wc/i,
  /\|.*tee/i, /\|.*>.*\./i, /wc\s+-l.*dist\//i, /wc\s+-l.*src\//i,
  /wc\s+-l.*build\//i, /grep.*setCurrentAgent.*src/i,
  /grep.*isSharkAgent.*src/i, /grep.*guardian.*src/i,
];

const LEGITIMATE_PATTERNS = [
  /mkdir\s+-p/i, /cp\s+-r/i, /mv\s+/i, /cat\s+[^\|>]+$/i,
  /head\s+-[0-9]+\s+/i, /tail\s+-[0-9]+\s+/i,
  /grep\s+-[rEn]+.*[^\|]$/i, /find\s+.*-name/i, /test\s+-d/i, /test\s+-x/i,
];

const FAKE_TEST_PATTERNS = [
  /node\s+run-tests?\.js/i, /node\s+verify.*\.mjs/i,
  /npm\s+(run\s+)?test/i, /yarn\s+(run\s+)?test/i,
  /jest/i, /vitest/i, /mocha/i, /jasmine/i,
  /bun\s+test/i, /pytest/i, /python.*-m.*pytest/i,
  /go\s+test/i, /cargo\s+test/i, /ruby\s+-Itest/i, /rspec/i,
];

const SOURCE_INSPECTION_PATTERNS = [
  /^\s*(echo|cat|printf).*>.*src\//i,
  /^\s*sed\s+-i.*src\//i,
  /^\s*tee\s+.*src\//i,
  />\s*.*src\//i,
  /&\s*>>\s*.*src\//i,
];

const WRONG_CONTAINER_PATTERNS = [
  /opencode\s+container\s+(run|start|exec)/i, /opencode\s+run\s+/i,
];

// V4.9: Container Testing Firewalls
const BANNED_OPENCODE_RUN_PATTERNS = [
  /opencode\s+run\s+--agent\s+shark/i,
  /opencode\s+run\s+--prompt/i,
  /opencode\s+run\s+--print-output/i,
];

const THEATRICAL_VERIFICATION_PATTERNS = [
  /grep.*dist\/index\.js/i,
  /grep.*plugins\/.*dist/i,
  /wc.*plugins\/.*dist/i,
  /"agent.*replied.*works"/i,
  /"responded.*therefore"/i,
  /"works".*grep.*dist/i,
];

const MISSING_CONTAINER_PATTERNS = [
  /verify.*test.*without.*container/i,
  /skip.*container.*test/i,
  /just\s+run\s+opencode.*test/i,
];

// V4.9: Privilege escalation blocking
const PRIVILEGE_ESCALATION_PATTERNS = [
  /sudo\s+/i, /su\s+-/i, /chown\s+/i, /chmod\s+0?777/i,
  /passwd/i, /useradd/i, /usermod/i, /groupadd/i,
  /pkexec/i, /doas/i, /visudo/i,
];

// V4.9: Network egress blocking
const NETWORK_EGRESS_PATTERNS = [
  /curl\s+(https?:\/\/|http:\/\/)/i,
  /wget\s+(https?:\/\/|http:\/\/)/i,
  /\bcurl\s+[a-zA-Z0-9]+\.[a-zA-Z]{2,}/i,
  /\bwget\s+[a-zA-Z0-9]+\.[a-zA-Z]{2,}/i,
  /nc\s+-[a-z]*[ev]\s+\d{1,3}\.\d{1,3}\./i,
  /ssh\s+[^@]+@\d{1,3}\.\d{1,3}/i,
  /telnet\s+\d{1,3}\.\d{1,3}\./i,
];

// V4.9: Container escape prevention — ALL host access is FORBIDDEN
const CONTAINER_ESCAPE_PATTERNS = [
  /docker\s+run.*--privileged/i,
  /docker\s+run.*-v\s+\/:/i,
  /docker\s+run.*\/var\/run\/docker\.sock/i,
  /docker\s+run.*--pid=host/i,
  /docker\s+run.*--net=host/i,
  /docker\s+run.*--cap-add=SYS_ADMIN/i,
  /docker\s+run.*\/dev\/[a-z]+\s*:\s*\/dev/i,
  /mount\s+-t\s+/i,
  /mount\s+-o\s+(remount|bind)/i,
  /nsenter\s+/i,
  /\/proc\/1\/root/i,
  /chroot\s+/i,
  /\b(nsenter|unshare)\b/i,
  /\bmodprobe\b/i,
  /\binsmod\b/i,
  /\bkexec\b/i,
  /\bdmesg\b/i,
  /\/etc\/shadow/i,
  /\/etc\/sudoers/i,
  /systemctl\s+(start|stop|restart)/i,
  /service\s+\w+\s+(start|stop|restart)/i,
];

// V4.9: Content-aware derailment detection
const THEATRICAL_DELETION_IN_CONTENT = [
  /\bdelete\s+all\s+(of\s+)?(the\s+)?(code|files|content)\b/i,
  /\bstart\s+(from\s+)?(scratch|fresh|clean|zero)\b/i,
  /\bbuild\s+(a\s+)?(from\s+)?scratch\b/i,
  /\bcreate\s+(a\s+)?(minimal|simple|basic)\s+(version|impl)/i,
  /\bstrip\s+(out|down|everything)\b/i,
  /\bremove\s+(everything|all)\b/i,
  /\bjust\s+(delete|remove|strip)\b/i,
  /\bnuclear\s+(option|approach|reset)\b/i,
  /\bclean\s+(slate|start)\b/i,
  /\bstart\s+over\b/i,
];

const OFF_TOPIC_IN_CONTENT = [
  /\b(evil\.com|malware\.com|hack\.com|exploit\.com)\b/i,
  /\b(AWS|Azure|GCP)\s+(cloud|service|bucket)\b/i,
  /\bdownload\s+(from|at)\s+(http|ftp)/i,
  /\bfetch\s+(from|at)\s+(http|ftp)/i,
];

const EXCUSE_PATTERNS_IN_CONTENT = [
  /\b(not\s+my|not\s+our)\s+(job|problem|fault|responsibility)\b/i,
  /\bcan'?t\s+(really|actually)\s+(help|do|fix)\b/i,
  /\bthat'?s\s+(just|not)\s+(how|what)\s+(it\s+)?(works?|happens)\b/i,
  /\bjust\s+ignore\s+(it|this|that)\b/i,
  /\b(skip|ignore)\s+(the\s+)?(bug|issue|problem)\b/i,
];

// V4.9: Theatrical claim markers in chat messages
const THEATRICAL_CLAIM_PATTERNS = [
  /⚙\s+\w[\w-]+/i,                    // Faux tool rune: ⚙ tool-name
  /\*\*Tool:\s+\w[\w-]+\*\*/i,         // Markdown tool header: **Tool: tool-name**
  /✅\s+\w[\w-]+:/i,                   // Verification checkmark: ✅ tool-name:
  /❌\s+\w[\w-]+:/i,                   // Failure checkmark: ❌ tool-name:
  /^```(?:json)?\s*$/i,                // Code block start claiming JSON
];

// v4.8.4 Firewall lazy singletons
let _classifier: IntentClassifier | null = null;
let _layerEngine: LayerEngine | null = null;
let _auditLogger: FirewallAudit | null = null;

function getClassifier(): IntentClassifier { if (!_classifier) _classifier = new IntentClassifier(); return _classifier; }
function getLayerEngine(): LayerEngine { if (!_layerEngine) _layerEngine = new LayerEngine(new EvidenceGate(process.cwd())); return _layerEngine; }
function getAuditLogger(): FirewallAudit { if (!_auditLogger) _auditLogger = new FirewallAudit(process.cwd()); return _auditLogger; }

// Helper functions
function checkCrossAgentTools(tool: string): void {
  if (CROSS_AGENT_TOOLS.has(tool)) {
    throw new Error(`[L5.7 BLOCKED] Tool ${tool} is restricted to administrative agents.`);
  }
}

function checkSourceInspection(command: string): void {
  for (const pattern of SOURCE_INSPECTION_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`[GUARDIAN] SOURCE_INSPECTION_BLOCKED: ${command}`);
    }
  }
}

function checkWrongContainer(command: string): void {
  for (const pattern of WRONG_CONTAINER_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`[GUARDIAN] WRONG_CONTAINER_COMMAND_BLOCKED: ${command}`);
    }
  }
}

function evaluateContextualRule(command: string | null, currentGate: Gate): void {
  if (!command) return;
  for (const rule of CONTEXTUAL_FIREWALL_RULES) {
    if (rule.pattern.test(command)) {
      if (rule.forbiddenIn.includes(currentGate)) {
        throw new Error(`[C-FIREWALL ${rule.label}] This action is forbidden during the ${currentGate} phase. ${rule.description}`);
      }
      if (rule.allowedIn.includes(currentGate)) continue;
      const highStakesGates: Gate[] = ['verify', 'audit', 'delivery'];
      if (highStakesGates.includes(currentGate)) {
        throw new Error(`[C-FIREWALL ${rule.label}] Ambiguous action blocked during high-stakes phase: ${currentGate}. ${rule.description}`);
      }
    }
  }
}

export function createGuardianHook(guardian: Guardian, gateManager: GateManager): Hooks['tool.execute.before'] {
  return async (input, output) => {
    const { tool, sessionID } = input as { tool: string; sessionID?: string; callID?: string };
    const args = (output as { args?: Record<string, unknown> })?.args ?? (input as any)?.args;
    const command = extractCommandFromArgs(args);

    const sessionAgent = getCurrentAgent(sessionID);

    if (!sessionAgent) return;

    const isShark = isSharkAgent(sessionAgent);
    const currentAgent = sessionAgent;
    const currentGate = gateManager.getCurrentGate() as Gate;

    // Log hook firing evidence for T2 Bible §Checklist (to .shark/shark-agent.log)
    if (isShark) {
      logInfo(`tool.execute.before: agent=${sessionAgent}, tool=${tool}, gate=${currentGate}`);
      if (command) {
        const truncatedCmd = command.length > 80 ? command.substring(0, 80) + '...' : command;
        logInfo(`tool.execute.before command: ${truncatedCmd}`);
      }
    }

    // 1. Contextual Firewall (L1-L4) - only for Shark
    if (isShark) {
      evaluateContextualRule(command, currentGate);
    }

    // 2. L5.7: Cross-agent tool blocking - for all agents
    checkCrossAgentTools(tool);

    // L0 REMOVED: Shark is a software engineering juggernaut — no device-based execution restrictions

    // L2: Fake Test Runner - only for Shark agents
    if (isShark && command) {
      for (const pattern of FAKE_TEST_PATTERNS) {
        if (pattern.test(command)) {
          throw new Error(`[FIREWALL L2] npm test / run test / exec test bypass`);
        }
      }
    }

    // For Shark agents: additional checks
    if (isShark) {
      // Dangerous command blocking
      if (command && guardian.isDangerousCommand(command)) {
        throw new Error(`[GUARDIAN] DANGEROUS_COMMAND_BLOCKED: ${command}`);
      }

      // Zone-based write protection
      if ((tool.includes('write') || tool.includes('patch')) && args) {
        const a = args as Record<string, unknown>;
        const writePath = (a.path as string) || null;
        if (writePath && !guardian.canWrite(writePath, currentGate)) {
          throw new Error(`[GUARDIAN] ZONE_VIOLATION: ${guardian.classifyZone(writePath)} zone — ${writePath} is forbidden during ${currentGate} phase.`);
        }
        if (writePath) guardian.registerCreate(writePath);
      }

      // Source file edit protection
      if ((tool === 'edit' || tool === 'mcp_edit') && args) {
        const ea = args as { filePath?: string };
        if (ea?.filePath) {
          if (!guardian.canEdit(ea.filePath, currentGate)) throw new Error(`[GUARDIAN] Edit blocked: ${ea.filePath} is forbidden during ${currentGate} phase.`);
          guardian.registerEdit(ea.filePath);
        }
      }

      // Source file modify check
      if (command) {
        const mc = guardian.canModifyFile(command);
        if (!mc.allowed) throw new Error(`[GUARDIAN] SOURCE_FILE_MODIFY_BLOCKED: ${mc.filePath}`);
      }

      if (command) checkSourceInspection(command);

      // L3: Also check raw args for redirect patterns (bash strips > redirect from command field)
      if (args && typeof args === 'object') {
        const rawArgs = JSON.stringify(args);
        if (/>\s*.*src\//i.test(rawArgs) || />>\s*.*src\//i.test(rawArgs) || /tee\s+.*src\//i.test(rawArgs)) {
          throw new Error(`[GUARDIAN] SOURCE_INSPECTION_BLOCKED: Write redirection to src/ detected in tool args`);
        }
      }

      if (command) checkWrongContainer(command);

      // V4.9: Container Testing Firewall Enforcement
      if (command) {
        // BAN: opencode run for testing (does not fire hooks)
        for (const pattern of BANNED_OPENCODE_RUN_PATTERNS) {
          if (pattern.test(command)) {
            throw new Error(`[FIREWALL L5.12] BANNED: "opencode run" does NOT fire hooks. Use TUI via tmux + docker exec -it for all plugin testing. Command: ${command}`);
          }
        }
        // BAN: theatrical/grep verification on dist files
        for (const pattern of THEATRICAL_VERIFICATION_PATTERNS) {
          if (pattern.test(command)) {
            throw new Error(`[FIREWALL L5.13] THEATRICAL TEST BLOCKED: Static grep/wc on dist files is NOT a valid test. Test actual function in container TUI. Command: ${command}`);
          }
        }
        // BAN: testing without container
        for (const pattern of MISSING_CONTAINER_PATTERNS) {
          if (pattern.test(command)) {
            throw new Error(`[GUARDIAN] MISSING CONTAINER: All Shark plugin testing MUST happen in a sandboxed container. Create one with shark-spawn-container. Command: ${command}`);
          }
        }

        // V4.9: PRIVILEGE_ESCALATION_PATTERNS enforcement
        for (const pattern of PRIVILEGE_ESCALATION_PATTERNS) {
          if (pattern.test(command)) {
            throw new Error(`[FIREWALL L5.12] PRIVILEGE_ESCALATION_BLOCKED: sudo/su/chown/chmod/passwd are not allowed in sandbox. Command: ${command}`);
          }
        }

        // V4.9: NETWORK_EGRESS_PATTERNS enforcement
        for (const pattern of NETWORK_EGRESS_PATTERNS) {
          if (pattern.test(command)) {
            throw new Error(`[FIREWALL L5.13] NETWORK_EGRESS_BLOCKED: External network access (curl/wget/nc/ssh) is not allowed in sandbox. Command: ${command}`);
          }
        }

        // V4.9: CONTAINER_ESCAPE_PATTERNS — HARD BLOCK: no host access, no privilege escalation, no container breakout
        for (const pattern of CONTAINER_ESCAPE_PATTERNS) {
          if (pattern.test(command)) {
            throw new Error(`[FIREWALL L5.19] CONTAINER_ESCAPE_BLOCKED: Host access and container breakout are FORBIDDEN. All operations must remain sandboxed. Command: ${command}`);
          }
        }

        // L1: Theatrical Detection — pipe-to-wc, pipe-to-tee for ALL tools (not just bash)
        for (const pattern of THEATRICAL_PATTERNS) {
          if (pattern.test(command)) {
            throw new Error(`[FIREWALL L1] THEATRICAL_BLOCKED: Pipe-to-wc/tee counting does NOT verify code. Run actual tests in container. Command: ${command}`);
          }
        }
      }

      // V4.9: THEATRICAL_CLAIM_PATTERNS in messages
      if (args && typeof args === 'object') {
        const messageText = (args as Record<string, unknown>)?.message as string || (args as Record<string, unknown>)?.notes as string || '';
        if (messageText) {
          for (const pattern of THEATRICAL_CLAIM_PATTERNS) {
            if (pattern.test(messageText)) {
              throw new Error(`[FIREWALL L5.14] THEATRICAL_CLAIM_BLOCKED: Do not simulate tool execution with markdown/emoji/faux runes. Use actual tools.`);
            }
          }
        }
      }

      // V4.9: Content-aware derailment detection (write/edit tools)
      if (tool === 'write' || tool === 'edit' || tool === 'write_file' || tool === 'patch') {
        const content = (args as Record<string, unknown>)?.content as string || (args as Record<string, unknown>)?.newString as string || '';
        
        // Debug: log what we're checking
        const lastMsg = getLastUserMessage(sessionID);
        
        
        // Check last user message for derailment instructions FIRST
        if (lastMsg) {
          
          for (const pattern of THEATRICAL_DELETION_IN_CONTENT) {
            if (pattern.test(lastMsg)) {
              
              throw new Error(`[FIREWALL L5.17] THEATRICAL_DELETION_BLOCKED: User instructed to delete/start from scratch. Do not comply. Fix existing code instead.`);
            }
          }
        } else {
          
        }
        
        if (content) {
          // Check for theatrical deletion in file content
          for (const pattern of THEATRICAL_DELETION_IN_CONTENT) {
            if (pattern.test(content)) {
              
              throw new Error(`[FIREWALL L5.17] THEATRICAL_DELETION_BLOCKED: Do not delete code and start from scratch. Fix the existing code properly.`);
            }
          }
          // Check for off-topic content
          for (const pattern of OFF_TOPIC_IN_CONTENT) {
            if (pattern.test(content)) {
              
              throw new Error(`[FIREWALL L5.17] OFF_TOPIC_BLOCKED: Content contains references to unrelated external resources.`);
            }
          }
        }

      }

      // V4.9: Excuse patterns in all args
      if (args && typeof args === 'object') {
        const allText = JSON.stringify(args);
        for (const pattern of EXCUSE_PATTERNS_IN_CONTENT) {
          if (pattern.test(allText)) {
            throw new Error(`[FIREWALL L5.17] EXCUSE_BLOCKED: Stop making excuses. Fix the problem properly.`);
          }
        }
      }
    }

    // v4.8.4 Firewall Layer Engine - only for Shark
    if (isShark && (command || (args && Object.keys(args).length > 0))) {
      try {
        const classifier = getClassifier();
        const layerEngine = getLayerEngine();
        const auditLogger = getAuditLogger();

        const fwCtx = buildContext(
          { tool, args: args || {} },
          { args: args || {} },
          classifier,
          { brainInitialized: !!currentAgent, evidencePath: path.join(process.cwd(), '.shark', 'evidence'), currentGate: null },
          sessionID || '',
          currentAgent || 'shark',
        );

        const blockResult = layerEngine.evaluate(fwCtx, DEFAULT_LAYERS);
        if (blockResult) {
          auditLogger.log({
            timestamp: new Date().toISOString(), agent: currentAgent || 'shark', tool,
            operationType: fwCtx.operationType, layer: blockResult.layer, reason: blockResult.reason,
            command: command || null, correction: blockResult.correction, sessionId: sessionID || '',
          });
          throw createBlockResponse(blockResult);
        }
      } catch (err) {
        if (err instanceof StructuredBlockError) throw err;
        // Silently absorb firewall engine errors
      }
    }
  };
}