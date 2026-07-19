/**
 * Warhead #1: IdentityEnforcement (priority 1)
 *
 * Tracks identity intercepts across all three delivery paths.
 * Provides live T0() with intercept counts.
 */
import type { SharkWarhead, HookRegistry } from '../warhead-registry.js';
import { isRecord } from '../warhead-registry.js';
import { isSharkAgent } from '../agent-identity.js';

export class IdentityEnforcement implements SharkWarhead {
  readonly id = 'identity-enforcement';
  readonly priority = 1;
  readonly type = 'static' as const;

  private identityInterceptCount = 0;
  private scanReplaceCount = 0;
  private unshiftCount = 0;

  /** Increment the UNSHIFT fallback counter (called from system-transform-hook) */
  /**
   * @unused — identity header injection tracks unshift count via its own increment.
   * Retained in case the warhead needs to track identity placement separately.
   */
  incrementUnshift(): void {
    this.unshiftCount++;
  }

  register(hooks: HookRegistry): void {
    // HOOK: chat.message identity intercept tracking
    hooks.on('chat.message', (input: unknown, output: unknown) => {
      if (!isRecord(input)) return;
      const toolInput = input as { agent?: string };
      const agent = toolInput.agent || '';
      if (!isSharkAgent(agent)) return;

      try {
        if (!isRecord(output)) return;
        const toolOutput = output as { parts?: Array<{ type: string; text?: string }>; message?: { content?: string } };
        const msgPart = toolOutput.parts?.find((p: { type: string; text?: string }) => p.type === 'text');
        const content = msgPart?.text || toolOutput.message?.content || '';
        const lower = content.toLowerCase();
        if (lower.includes('who are you') || lower.includes('what are you')) {
          this.identityInterceptCount++;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[IdentityEnforcement] chat.message handler error: ${message}`);
      }
    });

    // HOOK: system.transform SCAN+REPLACE tracking
    hooks.on('system.transform', () => {
      // SCAN+REPLACE is tracked incrementally
      this.scanReplaceCount++;
    });
  }

  getT0(): string {
    return `[IDENTITY] Intercepts: ${this.identityInterceptCount} | SCAN+REPLACE: ${this.scanReplaceCount}`;
  }
}
