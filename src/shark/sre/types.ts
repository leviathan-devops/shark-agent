export interface SREEngineConfig {
  requireAllCritical: boolean;
  requireAllHigh: boolean;
  minPassRate: number;
  minMechanicalRatio: number;
  hardFirstPositionThreshold: number;
  hardFirstDeliverableIds: string[];
}

export interface MVS {
  build: string;
  version: string;
  created: string;
  engineConfig: SREEngineConfig;
  deliverables: DeliverableDef[];
}

export interface DeliverableDef {
  id: string;
  name: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  reason: string;
  level0?: Level0Spec;
  level1?: Level1Spec;
  level2?: Level2Spec;
  level3?: Level3Spec;
  level4?: Level4Spec;
}

export interface Level0Spec {
  file?: string;
  minTotalLines?: number;
  requiredExports?: string[];
  requiredMethods?: string[];
  mustNotContain?: string[];
  minStringLength?: number;
  requiredSubstrings?: string[];
  minSubstringsMatched?: number;
}

export interface Level1Spec {
  requiredCallSites?: CallSiteRequirement[];
  noDeadExports?: string[];
}

export interface CallSiteRequirement {
  method: string;
  instance?: string;
  callerFile?: string;
  callerClass?: string;
  inMethod?: string;
  minCalls?: number;
  minCallersTotal?: number;
  mustBeCalledWithinClass?: boolean;
}

export interface Level2Spec {
  sandboxDir?: string;
  teardown?: string;
  testCases: TestCaseDef[];
}

export interface TestCaseDef {
  name: string;
  setup?: string;
  actions?: TestAction[];
  checks: TestCheck[];
  teardown?: string;
}

export interface TestAction {
  setup?: string;
  call?: string;
  expectNoThrow?: boolean;
  expectContains?: string;
  expectKey?: string;
  expectValue?: unknown;
  create?: string;
}

export interface TestCheck {
  type?: string;
  path?: string;
  call?: string;
  expectKey?: string;
  expectValue?: unknown;
  expectType?: string;
  expectContains?: string;
  expect?: boolean;
  reason?: string;
  minBytes?: number;
  min?: number;
  tolerance?: number;
  substrings?: string[];
  assert?: string;
  expected?: unknown;
}

export interface Level3Spec {
  directory?: string;
  requiredFiles?: string[];
  fileCheck?: FileCheckDef;
}

export interface FileCheckDef {
  path: string;
  minBytes?: number;
  contentPattern?: string;
}

export interface Level4Spec {
  minimumPassed?: number;
  totalPrinciples?: number;
}

export interface SourcePresenceResult {
  file: string;
  exists: boolean;
  lineCount: number;
  exportsFound: string[];
  methodsFound: string[];
  prohibitedContentFound: string[];
  passed: boolean;
}

export interface ExportCallInfo {
  exportName: string;
  sourceFile: string;
  callCount: number;
  callerFiles: string[];
  dead: boolean;
}

export interface CallSiteReport {
  passed: boolean;
  exports: ExportCallInfo[];
  violations: string[];
}

export interface TestCaseResult {
  name: string;
  checks: Array<{
    description: string;
    passed: boolean;
    actual: unknown;
    expected: unknown;
    reason?: string;
  }>;
  passed: boolean;
}

export interface ExecutionResult {
  passed: boolean;
  testCaseResults: TestCaseResult[];
  violations: string[];
}

export interface SideEffectViolation {
  check: string;
  details: string;
  severity: 'WARNING' | 'FAILURE';
}

export interface SideEffectResult {
  passed: boolean;
  violations: SideEffectViolation[];
  before?: Record<string, number>;
  after?: Record<string, number>;
  evidenceFresh?: boolean;
  versionMatch?: boolean;
  pluginCountOk?: boolean;
}

export interface PrincipleResult {
  name: string;
  label: string;
  pass: boolean;
  violations: string[];
}

export interface PrincipleReport {
  passed: boolean;
  principlesPassed: number;
  totalPrinciples: number;
  principleResults: PrincipleResult[];
}

export interface DerailmentEntry {
  pattern: string;
  match: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  details: string;
}

export interface DerailmentReport {
  passed: boolean;
  derailments: DerailmentEntry[];
}

export interface HardFirstResult {
  passed: boolean;
  criticalPosition: number;
  threshold: number;
  violations: string[];
}

export interface E10Report {
  violation: boolean;
  detected: boolean;
  details: string;
  p0Offense: boolean;
  forbiddenPhrases: string[];
}

export interface CheckRecord {
  name: string;
  category: 'mechanical' | 'textual';
}

export interface RatioReport {
  mechanical: number;
  textual: number;
  ratio: number;
  passed: boolean;
  records: CheckRecord[];
}

export interface LevelVerdict {
  passed: boolean;
  passedChecks: number;
  totalChecks: number;
  violations: string[];
}

export interface DeliverableVerdict {
  id: string;
  name: string;
  severity: string;
  level0?: LevelVerdict;
  level1?: LevelVerdict;
  level2?: LevelVerdict;
  level3?: LevelVerdict;
  level4?: LevelVerdict;
  passed: boolean;
}

export interface ShipGateVerdict {
  overallPassed: boolean;
  passRate: number;
  timestamp: string;
  verdict: string;
  levels: {
    level0: LevelVerdict;
    level1: LevelVerdict;
    level2: LevelVerdict;
    level3: LevelVerdict;
    level4: LevelVerdict;
    level5: LevelVerdict;
    hardFirst: HardFirstResult;
    mechanicalRatio: RatioReport;
    e10: E10Report;
    selfVerification: LevelVerdict;
  };
}

export const MVS_PATH = 'MANDATORY_VERIFICATION_SPEC.json';
export const SRE_EVIDENCE_DIR = '.shark/sre-evidence';
export const SRE_HASH_PATH = 'CONTEXT_MANAGEMENT/SRE_HASH.txt';
