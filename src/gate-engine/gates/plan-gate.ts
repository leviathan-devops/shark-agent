export class BlockOrchestrator {
  private currentGate: string = 'plan';

  evaluateBefore(toolName: string, args: Record<string, unknown>): string | null {
    if (toolName === 'bash') {
      const command = typeof args.command === 'string' ? args.command : '';
      const destructive = ['rm -rf', 'rm -r', 'rm -rf /', 'rm -rf *', 'mkfs', 'dd if=', ';:{'];
      for (const d of destructive) {
        if (command.includes(d)) return 'BLOCKED: Destructive command detected';
      }
    }

    // Gate-based tool restriction — writes are blocked outside BUILD/TEST/VERIFY/AUDIT
    const writeTools = ['write', 'write_file', 'edit', 'mcp_edit', 'create', 'mcp_create', 'patch', 'mcp_patch'];
    if (writeTools.includes(toolName) && this.currentGate) {
      const writeAllowedGates = ['plan', 'build', 'test', 'verify', 'audit'];
      if (!writeAllowedGates.includes(this.currentGate.toLowerCase())) {
        return `Tool ${toolName} is not allowed in ${this.currentGate} gate. Use BUILD gate for write operations.`;
      }
    }

    return null;
  }

  setGate(gate: string): void { this.currentGate = gate; }
  getCurrentGate(): string { return this.currentGate; }
}
