/**
 * Warhead #3: ContainerTesting (priority 3)
 *
 * Tracks container test results and pass rates.
 * Provides live T0() with test statistics.
 */
import type { SharkWarhead, HookRegistry } from '../warhead-registry.js';
import { isRecord } from '../warhead-registry.js';
import { isSharkAgent } from '../agent-identity.js';
import { safeParseJSON } from '../type-guards.js';

/** Maximum test history entries */
const MAX_TEST_HISTORY = 20;

export class ContainerTesting implements SharkWarhead {
  readonly id = 'container-testing';
  readonly priority = 3;
  readonly type = 'static' as const;

  private containerTestsRun = 0;
  private containerTestsPassed = 0;

  register(hooks: HookRegistry): void {
    // HOOK: Track container test results
    hooks.on('tool.execute.after', (input: unknown, output: unknown) => {
      if (!isRecord(input)) return;
      const toolInput = input as { tool?: string; agent?: string };
      if (!toolInput.tool) return;

      // Agent filter
      const agent = toolInput.agent || '';
      if (!isSharkAgent(agent)) return;

      if (toolInput.tool !== 'shark-test-runner') return;

      try {
        this.containerTestsRun++;
        if (this.containerTestsRun > MAX_TEST_HISTORY) {
          console.warn('[ContainerTesting] Test count exceeding history limit');
        }

        if (!isRecord(output)) {
          console.error('[ContainerTesting] Test output is not a record');
          return;
        }
        const toolOutput = output as { output?: string };
        const outputStr = toolOutput.output ?? '';
        if (typeof outputStr !== 'string' || outputStr.length === 0) return;

        const result = safeParseJSON<{ overallPassed?: boolean }>(outputStr);

        if (result && typeof result.overallPassed === 'boolean' && result.overallPassed) {
          this.containerTestsPassed++;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[ContainerTesting] Test result tracking error: ${message}`);
      }
    });
  }

  getT0(): string {
    const rate = this.containerTestsRun > 0 ? Math.round((this.containerTestsPassed / this.containerTestsRun) * 100) : 0;
    return `[CONTAINER] Tests: ${this.containerTestsRun} | Passed: ${this.containerTestsPassed} | Rate: ${rate}%`;
  }
}
