/**
 * Warhead #5: CrossPluginIsolation (priority 5)
 *
 * Ensures SHARK-specific hooks only fire for SHARK agents.
 * Tracks non-SHARK agent access attempts.
 */
import type { SharkWarhead, HookRegistry } from '../warhead-registry.js';
import { EnforcementError, isRecord } from '../warhead-registry.js';
import { isSharkAgent } from '../agent-identity.js';

export class CrossPluginIsolation implements SharkWarhead {
  readonly id = 'cross-plugin-isolation';
  readonly priority = 5;
  readonly type = 'static' as const;

  private nonSharkBlocks = 0;

  register(hooks: HookRegistry): void {
    // HOOK: Track cross-plugin isolation — ACTUALLY BLOCK non-SHARK agents
    hooks.on('tool.execute.before', (input: unknown) => {
      if (!isRecord(input)) return;
      const toolInput = input as { session?: { agentName?: string }; agent?: string };
      const agent = toolInput.session?.agentName || toolInput.agent || '';
      if (agent && !isSharkAgent(agent)) {
        this.nonSharkBlocks++;
        // BLOCK — not pass through. Non-SHARK agents must not execute SHARK hooks.
        throw new EnforcementError(
          `[CROSS-PLUGIN] Agent "${agent}" is not a SHARK agent. ` +
          `SHARK hooks do not apply. Pass to another plugin's handler.`
        );
      }
    });
  }

  getT0(): string {
    return `[ISOLATION] Non-SHARK blocked: ${this.nonSharkBlocks}`;
  }
}
