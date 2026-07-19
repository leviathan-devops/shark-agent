/**
 * @deprecated Replaced by CME TrajectoryEngine (src/shark/planning-brain/cme/).
 * PatternTriggerEngine — Proactive Context Injection
 *
 * Monitors the tool call history for patterns that indicate the agent is
 * about to do something wrong, and injects context BEFORE the agent fails.
 *
 * Spec §9.3 — the proactive intelligence layer.
 * Each trigger rule has a regex pattern, a context message to inject,
 * and a priority (HIGH injects even if the tool would be blocked anyway).
 *
 * P5: All shared state mutations are wrapped in try/catch with rollback handling.
 */

export interface TriggerRule {
  pattern: RegExp;
  message: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class PatternTriggerEngine {
  private rules: TriggerRule[] = [];

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.addRule({
      pattern: /container test|docker exec|tmux attach|tile/i,
      message: '[CONTEXT] Container TUI: T1 protocol. Use tmux + docker exec -it.',
      priority: 'HIGH',
    });
    this.addRule({
      pattern: /rge|P[0-9]+|type guard|type cast/i,
      message: '[CONTEXT] RGE: P2 guards required before type casts.',
      priority: 'HIGH',
    });
    this.addRule({
      pattern: /theatrical|mock|stub|placeholder/i,
      message: '[CONTEXT] No mock/stub in production. Delete theatrical code.',
      priority: 'HIGH',
    });
    this.addRule({
      pattern: /evidence|verify|pass.?rate/i,
      message: '[CONTEXT] Evidence: machine-generated. No node -e JSON.',
      priority: 'MEDIUM',
    });
    this.addRule({
      pattern: /gate advance|delivery|ship/i,
      message: '[CONTEXT] Gate: behavioral-pass matrix for delivery.',
      priority: 'MEDIUM',
    });
    this.addRule({
      pattern: /i think|probably|maybe|i believe|im guessing/i,
      message: '[CONTEXT] Stop guessing. Read context files first.',
      priority: 'LOW',
    });
  }

  addRule(rule: TriggerRule): void {
    try {
      const len = this.rules.length;
      this.rules.push(rule);
      if (this.rules.length !== len + 1) {
        throw new Error('P5 rollback: rules.push failed');
      }
    } catch (err) {
      console.error('[PatternTriggerEngine] addRule error:', err instanceof Error ? err.message : String(err));
    }
  }

  evaluate(toolHistory: string[]): string | null {
    try {
      const combined = toolHistory.join(' ').toLowerCase();
      const priorityWeight = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
      const sorted = [...this.rules].sort(
        (a: TriggerRule, b: TriggerRule) => priorityWeight[a.priority] - priorityWeight[b.priority]
      );

      for (const rule of sorted) {
        if (rule.pattern.test(combined)) {
          return rule.message;
        }
      }
      return null;
    } catch (err) {
      console.error('[PatternTriggerEngine] evaluate error:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  getRules(): { pattern: string; message: string; priority: string }[] {
    return this.rules.map((r: TriggerRule) => ({
      pattern: r.pattern.source,
      message: r.message,
      priority: r.priority,
    }));
  }
}
