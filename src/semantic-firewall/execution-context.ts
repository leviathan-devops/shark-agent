import * as path from 'node:path';
import { isSharkAgent } from '../shared/agent-identity.js';

export type GatePhase = 'plan' | 'build' | 'test' | 'verify' | 'audit' | 'delivery';

export interface EditHistoryEntry {
  toolName: string;
  filePath: string;
  timestamp: number;
  agentName: string;
}

export class ExecutionContext {
  private editHistory: EditHistoryEntry[] = [];
  private _currentGate: GatePhase = 'plan';
  private _currentAgent: string = '';
  private _projectRoot: string = '';

  constructor(sharkProjectRoot: string = '') {
    this._projectRoot = sharkProjectRoot || process.env.SHARK_PROJECT_ROOT || process.cwd();
  }

  get currentGate(): GatePhase { return this._currentGate; }
  get currentAgent(): string { return this._currentAgent; }
  get projectRoot(): string { return this._projectRoot; }

  setGate(gate: GatePhase): void { this._currentGate = gate; }
  setAgent(agent: string): void { this._currentAgent = agent; }

  recordEdit(toolName: string, filePath: string): void {
    this.editHistory.push({ toolName, filePath, timestamp: Date.now(), agentName: this._currentAgent });
    if (this.editHistory.length > 100) this.editHistory.shift();
  }

  isSharkProjectFile(filePath: string): boolean {
    if (!this._projectRoot) return false;
    const resolvedPath = path.resolve(filePath);
    return resolvedPath.startsWith(this._projectRoot);
  }

  hasRecentEdit(): boolean {
    const recent = this.editHistory
      .filter(e => Date.now() - e.timestamp < 60000)
      .filter(e => e.toolName === 'edit' || e.toolName === 'write');
    return recent.length > 0;
  }

  isOperationAllowedForGate(toolName: string, _targetFile: string): boolean {
    if (this._currentGate === 'build') {
      if (toolName === 'bash') return true;
      if (toolName === 'write' || toolName === 'edit') return true;
    }
    if (this._currentGate === 'test') {
      if (toolName === 'shark-test-runner') return true;
      if (toolName === 'shark-browser-test') return true;
    }
    return false;
  }

  shouldAllowEngineeringOperation(toolName: string, args: Record<string, unknown>): boolean {
    const command = typeof args.command === 'string' ? args.command : '';
    const filePath = typeof args.filePath === 'string' ? args.filePath : '';

    if (this._currentAgent && isSharkAgent(this._currentAgent)) {
      // Allow build commands if we're operating within the SHARK project
      if (command.includes('bun build')) {
        // Verify the command targets a path within the SHARK project
        if (this._projectRoot) {
          const projectPrefix = this._projectRoot.replace(/\/+$/, '');
          if (process.cwd().startsWith(projectPrefix)) return true;
          if (command.includes(projectPrefix)) return true;
        }
        if (filePath && this.isSharkProjectFile(filePath)) return true;
      }
      // Allow file operations within the project
      if (filePath && this.isSharkProjectFile(filePath)) return true;
    }

    return false;
  }
}
