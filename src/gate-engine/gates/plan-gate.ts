export class BlockOrchestrator {
  private currentGate: string = 'plan';

  evaluateBefore(toolName: string, args: Record<string, unknown>): string | null {
    if (toolName === 'bash') {
      const command = typeof args.command === 'string' ? args.command : '';
      const destructive = ['mkfs', 'dd if=', ';:{'];
      for (const d of destructive) {
        if (command.includes(d)) return 'BLOCKED: Destructive command detected';
      }
    }
    return null;
  }

  setGate(gate: string): void { this.currentGate = gate; }
  getCurrentGate(): string { return this.currentGate; }
}
