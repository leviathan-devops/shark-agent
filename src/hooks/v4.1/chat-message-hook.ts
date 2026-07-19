/**
 * Chat Message Hook — ctx.agentName detection + identity intercept
 *
 * v5.1.0: Identity intercept added (Trident v4.3.2 pattern).
 *   When user asks "who are you", the hook replaces output.message.content
 *   with a hardcoded identity string and returns early.
 *   The model NEVER generates text for identity questions.
 *
 *   This is the SAME pattern as Trident lines 645-680:
 *     chat.message hook -> detect identity query -> replace output -> return
 *     No model inference. No system prompt reading. Zero thinking.
 */
import type { Hooks } from '@opencode-ai/plugin';
import { isRecord, safeGetString, safeGetArray, safeGetRecord } from '../../shared/type-guards.js';
import { setCurrentAgent, extractAgentFromInput } from './agent-state.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { hookRegistry } from '../../shared/warhead-synthesizer.js';
import { logInfo } from '../../shared/shark-logger.js';

/** Minimal output shape for chat message mutation */
interface ChatMessageOutput {
  message?: { content?: string; text?: string; role?: string };
  content?: string;
  text?: string;
  parts?: Array<Record<string, unknown>>;
}

export function createChatMessageHook(): Hooks['chat.message'] {
  return async (input, output) => {
    if (!input) return;
    const ctx = input as { agentName?: string; sessionID?: string; agent?: string; name?: string };
    // Robust extraction: check multiple fields for cross-version compatibility
    const agent = extractAgentFromInput(ctx);

    const outputSafe = isRecord(output) ? (output as ChatMessageOutput) : {} as ChatMessageOutput;
    const msgObj = outputSafe.message || {};
    const userMessage = (typeof msgObj.content === 'string' ? msgObj.content : '')
      || (typeof msgObj.text === 'string' ? msgObj.text : '')
      || (typeof outputSafe.content === 'string' ? outputSafe.content : '')
      || (typeof outputSafe.text === 'string' ? outputSafe.text : '')
      || '';

    const isThisSharkAgent = isSharkAgent(agent);

    if (isThisSharkAgent) {
      setCurrentAgent(agent, ctx.sessionID, userMessage);
    } else if (agent) {
      setCurrentAgent(undefined, ctx.sessionID, userMessage);
    }

    // IDENTITY INTERCEPT — Trident v4.3.2 pattern
    // Intercept BEFORE model inference. Replace output with hardcoded
    // identity string. Model never generates text for "who are you".
    if (isThisSharkAgent) {
      const parts = Array.isArray(outputSafe.parts) ? outputSafe.parts : [];
      const messagePart = parts.find((p: Record<string, unknown>) => p && p.type === 'text');
      const content = (messagePart && typeof messagePart.text === 'string' ? messagePart.text : '') || userMessage || '';
      const lower = content.toLowerCase();
      const msgRole = typeof msgObj.role === 'string' ? msgObj.role : '';

      // Only intercept for assistant responses, not user inputs
      // When msgRole is 'user', this is input being processed — skip
      if (msgRole === 'user') {
        // Fire warhead hooks (chat.message event) even for user inputs
        try {
          await hookRegistry.fire('chat.message', input, output);
        } catch (err) {
          logInfo('[WarheadRegistry] chat.message hook error: ' + (err instanceof Error ? err.message : String(err)));
        }
        return;
      }

      if (lower.includes('who are you') || lower.includes('what are you') || lower.includes('identify yourself') || lower.includes('who am i')) {
        if (isRecord(output)) {
          const out = output as ChatMessageOutput;
          out.message = out.message || {};
          out.message.content = [
            'I am SHARK v5.1.0, a runtime-grade software engineering agent with planning brain.',
            '',
            'I do not write code. I do not run tests. I do not edit files.',
            'I engineer software systems that work in real runtime environments.',
            '',
            'NOT opencode. NOT Claude. NOT ChatGPT. NOT Hermes.',
            'I am SHARK.',
          ].join('\n');
        }
      }
    }

    // Fire warhead hooks (chat.message event)
    try {
      await hookRegistry.fire('chat.message', input, output);
    } catch (err) {
      logInfo('[WarheadRegistry] chat.message hook error: ' + (err instanceof Error ? err.message : String(err)));
    }
  };
}
