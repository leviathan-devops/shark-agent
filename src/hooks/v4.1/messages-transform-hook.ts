/**
 * Messages Transform Hook — prepends SHARK identity binding header to first message.
 *
 * MECHANISM: Trident v4.3.2 experimental.chat.messages.transform pattern
 *   (dist lines 233064-233086).
 *
 * CONTENT: Pure SHARK v5.1.0 identity. Zero Trident references.
 *   Same identity files, same agent name, same tools, same version.
 *
 * This is the EARLIEST identity injection point. It modifies the conversation's
 * first system message so that SHARK's identity binding is the first text
 * the model reads — before any provider-injected "You are Gemma 4" prompt.
 */
import type { Hooks } from '@opencode-ai/plugin';
import { getIdentityT1Injectables as getT1Injectables } from '../../shared/warhead-synthesizer.js';
import { getCurrentAgent } from './agent-state.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { getTokenizer } from '../../nlp-pipeline/tokenizer.js';
import { getIntentProcessor } from '../../nlp-pipeline/intent-processor.js';
import { getPlanningBrain } from '../../shark/planning-brain/index.js';
import { getGateManager } from '../../tools/shark-gate.js';
import { logInfo } from '../../shared/shark-logger.js';
import { generateTurnGuidance, getIntelligenceOrchestrator } from '../../eie/index.js';
import { cleanExpiredWarheads, getLatestWarhead } from '../../eie/warhead-generator.js';

/** NLP-enriched message with analysis context attached at runtime */
interface MessageWithNlpContext {
  role: string;
  content: string;
  _nlpContext: {
    tokenCount: number;
    sentenceCount: number;
    intent: string;
    confidence: number;
  };
  [key: string]: unknown;
}

export function createMessagesTransformHook(): Hooks['experimental.chat.messages.transform'] {
  return async (input: Record<string, unknown>, output: Record<string, unknown>) => {
    if (!isSharkAgent(getCurrentAgent())) return;

    const msgs = output?.messages;
    if (!msgs || !Array.isArray(msgs) || msgs.length === 0) return;

    const t1 = getT1Injectables();
    const header = t1.identityBindingHeader;
    if (!header || header.indexOf('SHARK') === -1) return;

    // ── NLP Pipeline: tokenize + classify incoming messages ──
    try {
      const tok = getTokenizer();
      const ip = getIntentProcessor();
      if (tok && ip) {
        for (const msg of msgs) {
          if (msg.role === 'user' && typeof msg.content === 'string') {
            const analysis = tok.analyze(msg.content);
            const intent = ip.classify(msg.content);
            // Enrich message with NLP analysis for downstream hooks
            (msg as MessageWithNlpContext)._nlpContext = {
              tokenCount: analysis.tokenCount,
              sentenceCount: analysis.sentenceCount,
              intent: intent.category,
              confidence: intent.confidence,
            };
          }
        }
      }
    } catch (err) {
      logInfo('[MessagesTransform] NLP Pipeline error: ' + (err));
    }

    // ── PlanningDecisionLayer: proactive intelligence injection ──
    // The decision layer runs the full PB pipeline (constructs → graph → rules
    // → hive → T1 synthesis) and returns a lightweight injectable string.
    // This is injected into the first USER message (NEVER system.transform).
    try {
      const planningBrain = getPlanningBrain();
      const decisionLayer = planningBrain?.getDecisionLayer?.();
      if (decisionLayer) {
        const gate = getGateManager()?.getCurrentGate?.() || 'PLAN';
        const toolHistory = planningBrain?.getToolHistoryForDecision?.() || [];
        // filesystemState is null — PB tracks filesystem via ContextDocUpdater
        const injectable = await decisionLayer.onMessagesTransform(
          msgs as Array<{ role: string; content: string; _nlpContext?: unknown }>,
          gate,
          toolHistory,
          null,
        );
        if (injectable) {
          // Prepend to the first USER message (NOT the system prompt)
          const firstUserMsg = msgs.find((m: Record<string, unknown>) => m.role === 'user');
          if (firstUserMsg && typeof firstUserMsg.content === 'string') {
            firstUserMsg.content = injectable + '\n\n---\n\n' + firstUserMsg.content;
          }
        }
      }
    } catch (dlErr) {
      // NEVER throw in the message transform hot path
      logInfo('[MessagesTransform] DecisionLayer error (non-fatal): ' + (dlErr instanceof Error ? dlErr.message : String(dlErr)));
    }

    // ── EIE: Engineering Intelligence Engine turn guidance ──────────
    // Inject [SHARK INTELLIGENCE] guidance into first user message.
    // Primary intelligence channel — the model receives engineering
    // guidance (gate context, focus areas, evidence needs) every turn.
    try {
      const eieGuidance = generateTurnGuidance(process.cwd());
      if (eieGuidance && msgs.length > 0) {
        const firstUserIdx = msgs.findIndex((m: Record<string, unknown>) => m.role === 'user');
        if (firstUserIdx >= 0) {
          const userMsg = msgs[firstUserIdx];
          if (typeof userMsg.content === 'string') {
            userMsg.content = `${eieGuidance}\n\n---\n\n${userMsg.content}`;
          }
        }
      }
    } catch (eieErr) {
      // EIE failure should never break the agent
      logInfo('[MessagesTransform] EIE guidance error (non-fatal): ' + (eieErr instanceof Error ? eieErr.message : String(eieErr)));
    }

    // ── Warhead Injection: one-shot .md guidance consumption ────────
    // Warheads are T1 injectables (300-600 tokens) generated by the EIE
    // for major events (gate rejection, PSM activation, error recovery,
    // compaction). Consumed ONE-SHOT: read then delete the file so each
    // warhead is injected exactly once.
    //
    // Injected as a NEW system message at the END of the messages array
    // (push, never prepend) to preserve the prefix cache — the identity
    // binding header stays at the front where the model reads it first.
    //
    // All logic is try-catch wrapped (safeHook swallows errors at the
    // outer level too). If .shark/warheads/ doesn't exist or is empty,
    // no warhead is injected — graceful degradation.
    try {
      const ws = process.cwd();
      // Step 1: Clean expired warheads (>5 min = 300000ms TTL)
      cleanExpiredWarheads(ws);
      // Step 2: Read latest warhead (one-shot: read + delete)
      const warhead = getLatestWarhead(ws);
      // Step 3: Append as new system message at END of array
      if (warhead) {
        msgs.push({ role: 'system', content: warhead });
      }
    } catch (warheadErr) {
      // Warhead failure must never break the message transform pipeline
      logInfo('[MessagesTransform] Warhead injection error (non-fatal): ' + (warheadErr instanceof Error ? warheadErr.message : String(warheadErr)));
    }

    // ── Orchestrator Guidance: push CME verdict + PSE state every turn ──
    // The IntelligenceOrchestrator is the SINGLE OUTPUT GATEWAY. This ensures
    // synthesized guidance (trajectory health, loop detection, evidence needs)
    // is pushed as a system message EVERY TURN. By calling generateTurnGuidance
    // again here (after warhead injection), any findings emitted during the
    // previous turn's tool.execute.before/after are reflected in the guidance.
    try {
      const orchestrator = getIntelligenceOrchestrator();
      const guidance = orchestrator.generateTurnGuidance(process.cwd());
      if (guidance) {
        msgs.push({ role: 'system', content: guidance });
      }
    } catch (orchErr) {
      logInfo('[MessagesTransform] Orchestrator guidance error (non-fatal): ' + (orchErr instanceof Error ? orchErr.message : String(orchErr)));
    }

    const firstMsg = msgs[0];

    // Pattern A: messages array with 'info' property (modern opencode)
    if (firstMsg.info) {
      const currentSystem = firstMsg.info.system || '';
      if (currentSystem.indexOf('SHARK v5.1.0 IDENTITY BINDING') !== -1) return;
      firstMsg.info.system = header + '\n\n' + currentSystem;
      return;
    }

    // Pattern B: messages array with 'parts' property (legacy)
    if (firstMsg.parts) {
      const hasIdentity = firstMsg.parts.some((p: Record<string, unknown>) =>
        (p as { text?: string }).text && (p as { text?: string }).text!.indexOf('SHARK v5.1.0 IDENTITY BINDING') !== -1
      );
      if (hasIdentity) return;
      firstMsg.parts.unshift({ type: 'text', text: header });
      return;
    }
  };
}
