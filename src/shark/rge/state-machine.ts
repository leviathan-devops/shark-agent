import { RGEAuditReport } from './report-types.js';

export type TestEngineerState = 'waiting-for-audit' | 'auditing' | 'audit-complete' | 'audit-failed' | 'proceed' | 'return-to-coder';

export interface StateTransition {
  from: TestEngineerState;
  to: TestEngineerState;
  condition: string;
}

export class RGEStateMachine {
  private state: TestEngineerState = 'waiting-for-audit';
  private transitions: StateTransition[] = [
    { from: 'waiting-for-audit', to: 'auditing', condition: 'rge-audit command invoked' },
    { from: 'auditing', to: 'audit-complete', condition: 'report.overallPassed === true' },
    { from: 'auditing', to: 'audit-failed', condition: 'report.overallPassed === false' },
    { from: 'audit-complete', to: 'proceed', condition: 'container tests can start' },
    { from: 'audit-failed', to: 'return-to-coder', condition: 'report.returnTo === "coder"' },
    { from: 'audit-failed', to: 'auditing', condition: 'report regenerated after fixes' },
    { from: 'proceed', to: 'waiting-for-audit', condition: 'next stage begins' },
    { from: 'return-to-coder', to: 'waiting-for-audit', condition: 'coder resubmits' },
  ];

  getState(): TestEngineerState {
    return this.state;
  }

  canTransitionTo(target: TestEngineerState): boolean {
    return this.transitions.some((t: StateTransition) => t.from === this.state && t.to === target);
  }

  transition(target: TestEngineerState): { success: boolean; error?: string } {
    const validTransition = this.transitions.find((t: StateTransition) => t.from === this.state && t.to === target);
    if (!validTransition) {
      return {
        success: false,
        error: `Cannot transition from '${this.state}' to '${target}'. No valid transition found.`
      };
    }

    this.state = target;
    return { success: true };
  }

  processReport(report: RGEAuditReport): { success: boolean; nextState: TestEngineerState; error?: string } {
    if (this.state !== 'auditing') {
      return {
        success: false,
        nextState: this.state,
        error: `Cannot process report in state '${this.state}'. Must be in 'auditing' state.`
      };
    }

    const target: TestEngineerState = report.overallPassed ? 'audit-complete' : 'audit-failed';
    if (!this.canTransitionTo(target)) {
      return {
        success: false,
        nextState: this.state,
        error: `Invalid transition from '${this.state}' to '${target}'`
      };
    }

    this.state = target;
    return { success: true, nextState: target };
  }

  reset(): void {
    this.state = 'waiting-for-audit';
  }

  getValidTransitions(): StateTransition[] {
    return this.transitions.filter((t: StateTransition) => t.from === this.state);
  }
}
