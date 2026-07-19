export interface GateConfig {
  gates: string[];
  current: string;
}

export const DEFAULT_GATES: string[] = ['plan', 'build', 'test', 'verify', 'audit', 'delivery'];
