/**
 * ExecutionContext — Tracks agent identity, edit history, and project root.
 * Gate state is read from GateManager singleton — NOT stored here.
 * One source of truth. Multiple gate trackers CANNOT diverge.
 */

import * as path from 'node:path';
import { getGateManager } from '../tools/shark-gate.js';

export type GatePhase = 'plan' | 'build' | 'test' | 'verify' | 'audit' | 'delivery';

export interface EditHistoryEntry {
  toolName: string;
  filePath: string;
  timestamp: number;
  agentName: string;
}

export class ExecutionContext {
  private editHistory: EditHistoryEntry[] = [];
  private _currentAgent: string = '';
  private _projectRoot: string = '';

  constructor(sharkProjectRoot: string = '') {
    this._projectRoot = sharkProjectRoot || process.env.SHARK_PROJECT_ROOT || process.cwd();
  }

  /** Current gate read from GateManager singleton — one source of truth */
  get currentGate(): GatePhase {
    return (getGateManager()?.getCurrentGate() || 'plan') as GatePhase;
  }

  get currentAgent(): string { return this._currentAgent; }
  get projectRoot(): string { return this._projectRoot; }

  setAgent(agent: string): void { this._currentAgent = agent; }

  /** Returns the project root path (Bible §6 context-aware enforcement) */
  getProjectRoot(): string { return this._projectRoot; }

  /** Returns the current agent name (Bible §6 context-aware enforcement) */
  getAgent(): string { return this._currentAgent; }

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
      .filter((e: EditHistoryEntry) => Date.now() - e.timestamp < 60000)
      .filter((e: EditHistoryEntry) => e.toolName === 'edit' || e.toolName === 'write');
    return recent.length > 0;
  }

  isOperationAllowedForGate(toolName: string, _targetFile: string): boolean {
    const gate = this.currentGate;
    if (gate === 'build') {
      if (toolName === 'bash') return true;
      if (toolName === 'write' || toolName === 'edit') return true;
    }
    if (gate === 'test') {
      if (toolName === 'shark-test-runner') return true;
      if (toolName === 'shark-browser-test') return true;
    }
    return false;
  }
}
