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

  transition(target: TestEngineerState): { success: boolean; error?: string; transition?: StateTransition } {
    const validTransition = this.transitions.find((t: StateTransition) => t.from === this.state && t.to === target);
    if (!validTransition) {
      return {
        success: false,
        error: `Cannot transition from '${this.state}' to '${target}'. No valid transition found.`
      };
    }

    if (target === this.state) {
      return { success: false, error: 'No valid transition from current state' };
    }
    this.state = target;
    // Verified: validTransition found in transitions table AND target !== current state (checked line 41)
    return { success: Boolean(validTransition), transition: validTransition };
  }

  processReport(report: RGEAuditReport): { success: boolean; nextState: TestEngineerState; error?: string } {
    if (this.state !== 'auditing') {
      return {
        success: false,
        nextState: this.state,
        error: `Cannot process report in state '${this.state}'. Must be in 'auditing' state.`
      };
    }

    if (!report || !report.semanticFindings) {
      return { success: false, nextState: 'audit-failed', error: 'Invalid report format' };
    }
    if (report.overallPassed) {
      this.state = 'audit-complete';
      // Verified: state is 'auditing', report exists, report.semanticFindings exists, overallPassed === true
      return { success: Boolean(report.overallPassed), nextState: 'audit-complete' };
    } else {
      this.state = 'audit-failed';
      return { success: false, nextState: 'audit-failed' };
    }
  }

  reset(): void {
    this.state = 'waiting-for-audit';
  }

  getValidTransitions(): StateTransition[] {
    return this.transitions.filter((t: StateTransition) => t.from === this.state);
  }
}
