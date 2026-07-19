/**
 * Warhead Registry — Central Nervous System
 *
 * Defines the SharkWarhead interface and HookRegistry for
 * event-driven warhead hooks.
 */

export type HookEvent =
  | 'tool.execute.before'
  | 'tool.execute.after'
  | 'chat.message'
  | 'system.transform'
  | 'compacting'
  | 'event';

export interface SharkWarhead {
  readonly id: string;
  readonly priority: number;  // 0 = highest (injected first)
  readonly type: 'static' | 'dynamic';
  getT0(): string;   // Returns LIVE status string with real counter values
  register(hooks: HookRegistry): void;
  init?(): Promise<void>;
}

export type HookHandler = (input: unknown, output: unknown) => void | Promise<void>;

/**
 * Enforcement errors thrown by warhead hooks to block tool execution.
 * HookRegistry.fire() re-throws these to propagate the block upstream.
 */
export class EnforcementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnforcementError';
  }
}

/** Type guard: check if value is a plain object (not null, not array) */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

export class HookRegistry {
  private readonly hooks: Map<HookEvent, HookHandler[]> = new Map();

  on(event: HookEvent, handler: HookHandler): void {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    const handlers = this.hooks.get(event);
    if (handlers) {
      handlers.push(handler);
    }
  }

  async fire(event: HookEvent, input: unknown, output: unknown): Promise<void> {
    const handlers = this.hooks.get(event);
    if (!handlers || handlers.length === 0) return;
    let enforcementError: EnforcementError | null = null;
    for (const handler of handlers) {
      try {
        await handler(input, output);
      } catch (e: unknown) {
        if (e instanceof EnforcementError) {
          // Save first enforcement error but CONTINUE to remaining handlers
          if (!enforcementError) enforcementError = e;
        } else {
          console.error(`[WarheadRegistry] ${event} handler error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    // Re-throw the first enforcement error AFTER all handlers have fired
    if (enforcementError) throw enforcementError;
  }

  hookCount(): number {
    let count = 0;
    for (const handlers of this.hooks.values()) {
      count += handlers.length;
    }
    return count;
  }

  getHandlerCount(event: HookEvent): number {
    return this.hooks.get(event)?.length ?? 0;
  }
}
