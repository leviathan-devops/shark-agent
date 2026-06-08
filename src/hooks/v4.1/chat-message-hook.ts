/**
 * Chat Message Hook — ctx.agentName detection + identity query
 *
 * v4.9: Uses ctx.agentName (not input.agent) for proper detection.
 * Identity query pattern for "who are you" / "what model" / "which model" responses.
 * setCurrentAgent called on EVERY chat.message invocation with robust message extraction.
 */
import type { Hooks } from '@opencode-ai/plugin';
import { setCurrentAgent } from './agent-state.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { getSharkIdentityPrompt } from '../../shared/identity-loader.js';

const identityQueryPattern = /\b(who are you|what are you|what model|which model|what is your name|identify yourself|your name|your purpose)\b/i;

export function createChatMessageHook(): Hooks['chat.message'] {
  return async (input, output) => {
    if (!input) return;
    const ctx = input as { agent?: string; nodeId?: string };
    const agent = ctx.agent || '';

    const outputKeys = Object.keys(output || {});
    const msgObj = (output as any)?.message;
    const userMessage = msgObj?.content
      || msgObj?.text
      || (output as any)?.content
      || (output as any)?.text
      || '';

    const isThisSharkAgent = isSharkAgent(agent);

    if (isThisSharkAgent) {
      setCurrentAgent(agent, ctx.nodeId, userMessage);
    } else if (agent) {
      setCurrentAgent(undefined, ctx.nodeId, userMessage);
    }

    if (isThisSharkAgent && identityQueryPattern.test(userMessage)) {
      const systemOutput = output as { system?: string[] };
      const identityPrompt = getSharkIdentityPrompt();
      if (identityPrompt && systemOutput.system) {
        systemOutput.system.unshift(identityPrompt);
      }
    }
  };
}
