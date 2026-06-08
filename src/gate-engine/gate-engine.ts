export type GateID = 'plan' | 'build' | 'test' | 'verify' | 'audit' | 'delivery';

export interface GateCriteria {
  requiredEvidence: string[];
  minEvidence: number;
  requiresBuild: boolean;
  requiresTest: boolean;
}

export interface GateState {
  currentGate: GateID;
  previousGates: GateID[];
  evidence: Map<string, boolean>;
  iteration: number;
}

const GATE_CRITERIA: Record<GateID, GateCriteria> = {
  plan: { requiredEvidence: ['spec', 'architecture', 'error-strategy'], minEvidence: 3, requiresBuild: false, requiresTest: false },
  build: { requiredEvidence: ['compiled', 'source-verified', 'deps-installed'], minEvidence: 3, requiresBuild: false, requiresTest: false },
  test: { requiredEvidence: ['container-test', 'unit-test', 'browser-test'], minEvidence: 2, requiresBuild: true, requiresTest: false },
  verify: { requiredEvidence: ['trident-report', 'semantic-firewall-pass', 'no-critical'], minEvidence: 3, requiresBuild: true, requiresTest: true },
  audit: { requiredEvidence: ['spec-alignment', 'test-authenticity', 'theatrical-scan'], minEvidence: 3, requiresBuild: true, requiresTest: true },
  delivery: { requiredEvidence: ['ship-package', 'checksum', 'evidence-archive'], minEvidence: 3, requiresBuild: true, requiresTest: true },
};

const GATE_ORDER: GateID[] = ['plan', 'build', 'verify', 'test', 'audit', 'delivery'];

export class GateEngine {
  private state: GateState = { currentGate: 'plan', previousGates: [], evidence: new Map(), iteration: 1 };

  getCurrentGate(): GateID { return this.state.currentGate; }
  getState(): GateState { return { ...this.state, evidence: new Map(this.state.evidence) }; }

  submitEvidence(evidenceId: string, passed: boolean): void {
    this.state.evidence.set(evidenceId, passed);
  }

  canAdvance(): { allowed: boolean; missing: string[]; failed: string[] } {
    const criteria = GATE_CRITERIA[this.state.currentGate];
    const missing: string[] = [];
    const failed: string[] = [];
    for (const req of criteria.requiredEvidence) {
      if (!this.state.evidence.has(req)) missing.push(req);
      else if (!this.state.evidence.get(req)) failed.push(req);
    }
    return { allowed: missing.length === 0 && failed.length === 0, missing, failed };
  }

  advance(): boolean {
    const check = this.canAdvance();
    if (!check.allowed || this.state.currentGate === 'delivery') return false;
    const currentIdx = GATE_ORDER.indexOf(this.state.currentGate);
    if (currentIdx === -1 || currentIdx >= GATE_ORDER.length - 1) return false;
    this.state.previousGates.push(this.state.currentGate);
    this.state.currentGate = GATE_ORDER[currentIdx + 1];
    this.state.iteration++;
    return true;
  }

  reset(gate: GateID = 'plan'): void {
    this.state = { currentGate: gate, previousGates: [], evidence: new Map(), iteration: 1 };
  }

  getCriteria(gate: GateID): GateCriteria { return { ...GATE_CRITERIA[gate] }; }

  serialize(): string {
    return JSON.stringify({ currentGate: this.state.currentGate, previousGates: this.state.previousGates, evidence: Array.from(this.state.evidence.entries()), iteration: this.state.iteration });
  }

  deserialize(json: string): void {
    try {
      const data: Record<string, unknown> = JSON.parse(json);
      this.state = {
        currentGate: (typeof data.currentGate === 'string' && data.currentGate) || 'plan',
        previousGates: Array.isArray(data.previousGates) ? data.previousGates as GateID[] : [],
        evidence: new Map(Array.isArray(data.evidence) ? data.evidence as [string, boolean][] : []),
        iteration: typeof data.iteration === 'number' ? data.iteration : 1,
      };
    } catch { this.reset('plan'); }
  }
}
