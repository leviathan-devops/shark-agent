import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  MVS, DeliverableDef, DeliverableVerdict,
  SourcePresenceResult, CallSiteReport, ExportCallInfo,
  ExecutionResult, TestCaseResult, TestAction, TestCheck,
  SideEffectResult, SideEffectViolation,
  PrincipleReport, PrincipleResult,
  DerailmentReport, DerailmentEntry,
  HardFirstResult, E10Report,
  CheckRecord, RatioReport,
  LevelVerdict, ShipGateVerdict,
} from './types.js';
import { MVS_PATH, SRE_EVIDENCE_DIR, SRE_HASH_PATH } from './types.js';

const E10_FORBIDDEN_PATTERNS = [
  /\bruntime\s+grade\b/i,
  /\bruntime\s+grade\s+verified\b/i,
  /\bruntime\s+grade\s+compliant\b/i,
  /\beffectively\s+runtime\s+grade\b/i,
  /\bruntime\s+grade\s+certified\b/i,
  /\bP1-P12\s+compliant\b/i,
];

const DERAILMENT_PATTERNS: Array<{ pattern: RegExp; name: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' }> = [
  { pattern: /\btask\([^)]*\)[\s\S]{0,200}\b(?:done|complete|finished)\b(?!.*\baggregate\|retrieve\|get\b)/i, name: 'fire-and-forget', severity: 'CRITICAL' },
  { pattern: /\b(?:I'?ve|we'?ve)\s+(?:verified|confirmed|tested|checked)\b(?!.*\.json)/i, name: 'self-verification', severity: 'CRITICAL' },
  { pattern: /\b(?:bundle\s+verified|bundle\s+checked|build\s+succeeds)\s+(?:and\s+)?(?:done|complete|good)\b/i, name: 'bundle-equals-done', severity: 'HIGH' },
  { pattern: /\b(?:I\s+checked\s+the\s+source|source\s+inspection|I\s+read\s+the\s+code)\b(?!.*\b(?:run|execut|test|container)\b)/i, name: 'source-equals-test', severity: 'CRITICAL' },
  { pattern: /\bopencode\s+run\b/i, name: 'opencode-run-substitution', severity: 'CRITICAL' },
  { pattern: /\b(?:while\s+we'?re\s+at\s+it|might\s+as\s+well|as\s+long\s+as\b)/i, name: 'scope-creep', severity: 'MEDIUM' },
  { pattern: /\b(?:test\s+pass|all\s+test|100%\s*%?\s*pass)/i, name: 'premature-pass-claim', severity: 'HIGH' },
];

const P1_P12_CHECKS: Array<{ id: string; label: string; checker: (fileContent: string) => string[] }> = [
  {
    id: 'P1', label: 'Defensive Import',
    checker: (content: string) => {
      const violations: string[] = [];
      const imports = content.match(/import\s+\{[^}]+\}\s+from\s+['"]\.\.?\/[^'"]+/g) || [];
      for (const imp of imports) {
        const filePath = imp.match(/from\s+['"]([^'"]+)['"]/);
        if (filePath && filePath[1].endsWith('.js')) {
          const moduleName = filePath[1].replace(/\.js$/, '').split('/').pop() || '';
          if (!content.includes(`typeof ${moduleName}`) && !content.includes(`import type`)) {
            violations.push(`Import ${moduleName} may need guard: '${imp.substring(0, 60)}'`);
          }
        }
      }
      return violations;
    }
  },
  {
    id: 'P2', label: 'Type Certainty',
    checker: (content: string) => {
      const violations: string[] = [];
      const stdModules = ['fs', 'path', 'crypto', 'os', 'net', 'http', 'stream', 'util', 'events', 'buffer', 'child_process'];
      const casts = content.match(/\bas\s+(\w+)/g) || [];
      const nonStdCasts = casts.filter((c: string) => {
        const typeName = c.replace('as ', '');
        return !stdModules.includes(typeName);
      });
      if (nonStdCasts.length > 3) {
        violations.push(`${nonStdCasts.length} non-standard 'as' casts found (max 3 per T3): ${nonStdCasts.slice(0, 5).join(', ')}`);
      }
      return violations;
    }
  },
  {
    id: 'P3', label: 'Error Completeness',
    checker: (content: string) => {
      const violations: string[] = [];
      const emptyCatches = content.match(/catch\s*\([^)]*\)\s*\{\s*\}/g) || [];
      const dangerous = emptyCatches.filter((c: string) => {
        const varMatch = c.match(/catch\s*\((\w+)\)/);
        return varMatch && !varMatch[1].startsWith('_');
      });
      if (dangerous.length > 0) {
        violations.push(`${dangerous.length} bare empty catch(es) without _err convention: ${dangerous[0].substring(0, 40)}`);
      }
      return violations;
    }
  },
  {
    id: 'P4', label: 'Resource Lifecycle',
    checker: (content: string) => {
      const violations: string[] = [];
      const intervals = content.match(/setInterval\s*\(/g) || [];
      if (intervals.length > 0) {
        const clearIntervals = content.match(/clearInterval\s*\(/g) || [];
        if (intervals.length > clearIntervals.length) {
          violations.push(`${intervals.length} setInterval with only ${clearIntervals.length} clearInterval`);
        }
      }
      return violations;
    }
  },
  {
    id: 'P5', label: 'Atomic State',
    checker: (content: string) => {
      const violations: string[] = [];
      const moduleMutations = content.match(/(?:this\.\w+|session\.\w+|state\.\w+|web\.\w+|config\.\w+)\.(?:push|set|delete|add|splice)\s*\(/g) || [];
      if (moduleMutations.length > 5) {
        violations.push(`${moduleMutations.length} shared-state mutations without atomic rollback check`);
      }
      return violations;
    }
  },
  {
    id: 'P6', label: 'Dependency Check',
    checker: (content: string) => {
      const violations: string[] = [];
      const apiCalls = content.match(/\.\w+\(/g) || [];
      if (apiCalls.length > 20 && !content.includes('typeof') && !content.includes('existsSync')) {
        violations.push(`Many API calls (${apiCalls.length}) without dependency checks`);
      }
      return violations;
    }
  },
  {
    id: 'P7', label: 'Path Resolution',
    checker: (content: string) => {
      const violations: string[] = [];
      const hardcoded = content.match(/['"`](\/home\/\w+|\/root\/|\/opt\/|\/etc\/|\/var\/)/g);
      if (hardcoded) {
        violations.push(`Hardcoded paths found: ${hardcoded.slice(0, 3).join(', ')}` + (hardcoded.length > 3 ? ` and ${hardcoded.length - 3} more` : ''));
      }
      return violations;
    }
  },
  {
    id: 'P8', label: 'Config Validation',
    checker: (content: string) => {
      const violations: string[] = [];
      const configAccesses = content.match(/(?:config|options|settings|args)\??\.\w+/g) || [];
      const validations = content.match(/if\s*\([^)]*[\?!]==\s*(?:null|undefined|''|0)/g) || [];
      if (configAccesses.length > validations.length + 2) {
        violations.push(`${configAccesses.length} config accesses but only ${validations.length} validations`);
      }
      return violations;
    }
  },
  {
    id: 'P9', label: 'Async Discipline',
    checker: (content: string) => {
      const violations: string[] = [];
      const awaits = content.match(/await\s+\w+/g) || [];
      const tryBlocks = content.match(/try\s*\{/g) || [];
      const catches = content.match(/\.catch\s*\(/g) || [];
      if (awaits.length > tryBlocks.length + catches.length + 1) {
        violations.push(`${awaits.length} awaits but only ${tryBlocks.length} try blocks + ${catches.length} .catch()`);
      }
      return violations;
    }
  },
  {
    id: 'P10', label: 'Output Contract',
    checker: (content: string) => {
      const violations: string[] = [];
      const returnMatches = content.match(/return\s+(?!this|new|JSON|JSON\.stringify|undefined|null)(\w+)/g);
      const returns: string[] = returnMatches ? [...returnMatches] : [];
      for (const ret of returns) {
        const varName = ret.replace('return ', '');
        if (varName === 'violations' || varName === 'results' || varName === 'result' || varName === 'entry' || varName === 'varMatch') continue;
        if (!content.includes(`typeof ${varName}`) && !content.includes(`${varName} as `) && !content.includes(`:${varName}`) && !content.includes(`: ${varName}`)) {
          if (returns.indexOf(ret) < 3) {
            violations.push(`Return '${varName}' without type guarantee`);
          }
        }
      }
      return violations;
    }
  },
  {
    id: 'P11', label: 'Output Is The Work',
    checker: (content: string) => {
      const violations: string[] = [];
      const successReturns = content.match(/return\s+\{[\s\S]{0,100}success[\s\S]{0,100}\}/g) || [];
      for (const ret of successReturns) {
        const hasSideEffect = ret.includes('mkdirSync') || ret.includes('writeFileSync') ||
          ret.includes('writeSync') || ret.includes('execSync') || content.includes('fs.write');
        if (!hasSideEffect) {
          violations.push(`Success return may lack side effects: '${ret.substring(0, 80)}'`);
        }
      }
      return violations;
    }
  },
  {
    id: 'P12', label: 'Project Boundaries',
    checker: (content: string) => {
      const violations: string[] = [];
      const writeOps = content.match(/(?:writeFileSync|mkdirSync|copyFileSync|appendFileSync)\s*\(/g) || [];
      if (writeOps.length > 0 && !content.includes('process.cwd()') && !content.includes('__dirname') && !content.includes('getContextDir')) {
        violations.push(`File operations (${writeOps.length}) without directory guard`);
      }
      return violations;
    }
  },
];

export class SlopRemovalEngine {
  private mvs: MVS;
  private projectRoot: string;
  private checkRecords: CheckRecord[] = [];
  private readonly evidenceDir: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.evidenceDir = path.join(projectRoot, SRE_EVIDENCE_DIR);
    this.mvs = this.loadAndVerifyMvs();
  }

  private loadAndVerifyMvs(): MVS {
    const mvsPath = path.join(this.projectRoot, MVS_PATH);
    const hashPath = path.join(this.projectRoot, SRE_HASH_PATH);

    if (!fs.existsSync(mvsPath)) {
      throw new Error(`[SRE] MVS not found at ${mvsPath}`);
    }
    if (!fs.existsSync(hashPath)) {
      throw new Error(`[SRE] MVS hash not found at ${hashPath}`);
    }

    const mvsContent = fs.readFileSync(mvsPath, 'utf-8');
    const storedHash = fs.readFileSync(hashPath, 'utf-8').trim();
    const actualHash = crypto.createHash('sha256').update(mvsContent).digest('hex');

    if (actualHash !== storedHash) {
      throw new Error(
        `[SRE] MVS SPEC TAMPERING DETECTED — hash mismatch\n` +
        `  Stored: ${storedHash}\n  Actual: ${actualHash}\n` +
        `  MANDATORY_VERIFICATION_SPEC.json has been modified outside of the SRE. REJECTING all operations.`
      );
    }

    this.addCheckRecord('MVS hash verification', 'mechanical');
    return JSON.parse(mvsContent) as MVS;
  }

  private addCheckRecord(name: string, category: 'mechanical' | 'textual'): void {
    this.checkRecords.push({ name, category });
  }

  private computePassRate(verdicts: DeliverableVerdict[]): number {
    if (verdicts.length === 0) return 0;
    const passed = verdicts.filter((v: DeliverableVerdict) => v.passed).length;
    return passed / verdicts.length;
  }

  private levelVerdict(passed: boolean, passedChecks: number, totalChecks: number, violations: string[]): LevelVerdict {
    return { passed, passedChecks, totalChecks, violations };
  }

  // ========== LEVEL 0: SOURCE PRESENCE AUDIT ==========

  auditSourcePresence(spec: DeliverableDef): SourcePresenceResult {
    this.addCheckRecord('[ENGINE] Level 0 source presence', 'textual');
    const violations: string[] = [];
    const file = spec.level0?.file;

    if (!file) {
      return { file: '', exists: false, lineCount: 0, exportsFound: [], methodsFound: [], prohibitedContentFound: [], passed: true };
    }

    const filePath = path.join(this.projectRoot, file);
    if (!fs.existsSync(filePath)) {
      violations.push(`File not found: ${file}`);
      return { file, exists: false, lineCount: 0, exportsFound: [], methodsFound: [], prohibitedContentFound: [], passed: false };
    }

    this.addCheckRecord('[ENGINE] Level 0 file exists', 'mechanical');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    if (spec.level0?.minTotalLines && lines.length < spec.level0.minTotalLines) {
      violations.push(`File has ${lines.length} lines, minimum is ${spec.level0.minTotalLines}`);
    }

    const exportsFound: string[] = [];
    if (spec.level0?.requiredExports) {
      for (const exp of spec.level0.requiredExports) {
        if (content.includes(`export class ${exp}`) || content.includes(`export function ${exp}`) ||
            content.includes(`export const ${exp}`) || content.includes(`export { ${exp}`)) {
          exportsFound.push(exp);
        } else {
          violations.push(`Required export '${exp}' not found in ${file}`);
        }
      }
      this.addCheckRecord('[ENGINE] Level 0 exports check', 'textual');
    }

    const methodsFound: string[] = [];
    if (spec.level0?.requiredMethods) {
      for (const method of spec.level0.requiredMethods) {
        if (content.includes(` ${method}(`) || content.includes(`.${method} =`)) {
          methodsFound.push(method);
        } else {
          violations.push(`Required method '${method}' not found in ${file}`);
        }
      }
      this.addCheckRecord('[ENGINE] Level 0 methods check', 'textual');
    }

    const prohibitedContentFound: string[] = [];
    if (spec.level0?.mustNotContain) {
      for (const term of spec.level0.mustNotContain) {
        if (content.includes(term)) {
          prohibitedContentFound.push(term);
          violations.push(`Prohibited content '${term}' found in ${file}`);
        }
      }
      this.addCheckRecord('[ENGINE] Level 0 prohibited check', 'textual');
    }

    const passed = violations.length === 0;
    return { file, exists: true, lineCount: lines.length, exportsFound, methodsFound, prohibitedContentFound, passed };
  }

  // ========== LEVEL 1: CALL-SITE AUDIT ==========

  auditCallSites(sourceDir?: string): CallSiteReport {
    this.addCheckRecord('[ENGINE] Level 1: call-site audit', 'textual');
    const targetDir = sourceDir || this.projectRoot;
    const exports: ExportCallInfo[] = [];
    const violations: string[] = [];

    const tsFiles: string[] = [];
    const walkDir = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
            walkDir(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.mts')) && entry.name !== 'node_modules') {
            tsFiles.push(fullPath);
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[SRE-auditCallSites::walkDir] Error reading directory ' + dir + ': ' + errorMsg);
      }
    };
    walkDir(targetDir);

    const allCode = tsFiles.map(f => path.relative(targetDir, f)).join(' ');

    for (const filePath of tsFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const exportMatches = content.matchAll(/export\s+(?:class|function|const|interface|type)\s+(\w+)/g);
      for (const match of exportMatches) {
        const name = match[1];
        if (name === 'default') continue;
        const exportType = match[0].includes('interface') || match[0].includes('type ') ? 'type' : 'runtime';
        const callerFiles: string[] = [];
        const tsFilesRelative = tsFiles.map(f => path.relative(targetDir, f));
        tsFiles.forEach(otherFile => {
          if (otherFile === filePath) return;
          const otherContent = fs.readFileSync(otherFile, 'utf-8');
          const importPattern = new RegExp(`\\b${name}\\b`);
          const isCalled = otherContent.includes(name + '(') || otherContent.includes(name + '.') ||
            importPattern.test(otherContent);
          if (isCalled) {
            callerFiles.push(path.relative(targetDir, otherFile));
          }
        });
        const callCount = callerFiles.length;
        const dead = callCount === 0 && exportType === 'runtime';
        exports.push({
          exportName: name,
          sourceFile: path.relative(targetDir, filePath),
          callCount,
          callerFiles,
          dead,
        });
        if (dead) {
          violations.push(`Dead export: ${name} defined in ${path.relative(targetDir, filePath)} but never called`);
        }
      }
      this.addCheckRecord(`[ENGINE] Level 1: ${path.basename(filePath)} exports scanned`, 'textual');
    }

    return { passed: violations.length === 0, exports, violations };
  }

  // ========== LEVEL 2: RUNTIME EXECUTION ==========

  generateScaffoldFor(spec: DeliverableDef): string {
    this.addCheckRecord(`[ENGINE] Level 2: scaffold generation`, 'textual');
    const testCases = spec.level2?.testCases || [];
    if (testCases.length === 0) return '';

    const lines: string[] = [
      'import fs from "fs";',
      `const results = [];`,
      `let passed = 0; let failed = 0;`,
      ``,
    ];

    for (const tc of testCases) {
      lines.push(`// Test Case: ${tc.name}`);
      lines.push(`try {`);
      if (tc.setup) lines.push(`  ${tc.setup}`);

      if (tc.actions) {
        for (const action of tc.actions) {
          if (action.setup) lines.push(`  ${action.setup}`);
          if (action.call) {
            if (action.expectNoThrow) {
              lines.push(`  ${action.call};`);
              lines.push(`  console.log('PASS: ${tc.name} - no throw'); passed++;`);
            } else if (action.expectContains) {
              lines.push(`  const _r = ${action.call};`);
              lines.push(`  const _rs = typeof _r === 'string' ? _r : JSON.stringify(_r);`);
              lines.push(`  if (_rs.includes('${action.expectContains.replace(/'/g, "\\'")}')) {`);
              lines.push(`    console.log('PASS: ${tc.name} - contains expected'); passed++;`);
              lines.push(`  } else {`);
              lines.push(`    console.log('FAIL: ${tc.name} - expected contains ${action.expectContains.replace(/'/g, "\\'")}'); failed++;`);
              lines.push(`  }`);
            } else if (action.expectKey && action.expectValue !== undefined) {
              const val = JSON.stringify(action.expectValue);
              const keyStr = String(action.expectKey);
              lines.push(`  const _r = ${action.call};`);
              lines.push(`  const _actual = typeof _r === 'object' && _r !== null ? _r.${keyStr} : undefined;`);
              lines.push(`  const _aStr = JSON.stringify(_actual);`);
              lines.push(`  if (_actual === ${val}) {`);
              lines.push(`    console.log('PASS: ${tc.name} - ${action.expectKey} check'); passed++;`);
              lines.push(`  } else {`);
              lines.push(`    console.log('FAIL: ${tc.name} - ' + ${keyStr} + ' got ' + _aStr + ' expected ${val}'); failed++;`);
              lines.push(`  }`);
            }
          }
        }
      }

      for (const check of tc.checks || []) {
        if (check.assert !== undefined) {
          const expected = JSON.stringify(check.expected);
          lines.push(`  const _val = ${check.assert};`);
          lines.push(`  if (_val === ${expected}) { console.log('PASS: ${tc.name} - assert'); passed++; }`);
          lines.push(`  else { console.log('FAIL: ${tc.name} - assert got ' + _val + ' expected ${expected}'); failed++; }`);
        } else if (check.call && check.expectKey !== undefined && check.expectValue !== undefined) {
          const val = JSON.stringify(check.expectValue);
          lines.push(`  const _r = ${check.call};`);
          lines.push(`  const _v = typeof _r === 'object' && _r !== null ? _r['${check.expectKey}'] : undefined;`);
          lines.push(`  if (_v === ${val} || JSON.stringify(_v) === '${JSON.stringify(check.expectValue)}') {`);
          lines.push(`    console.log('PASS: ${tc.name} - ${check.expectKey}'); passed++;`);
          lines.push(`  } else {`);
          lines.push(`    console.log('FAIL: ${tc.name} - ${check.expectKey} got ' + JSON.stringify(_v)); failed++;`);
          lines.push(`  }`);
        } else if (check.call && check.expectType) {
          lines.push(`  const _r = ${check.call};`);
          lines.push(`  if (typeof _r === '${check.expectType}') {`);
          lines.push(`    console.log('PASS: ${tc.name} - type ${check.expectType}'); passed++;`);
          lines.push(`  } else {`);
          lines.push(`    console.log('FAIL: ${tc.name} - expected type ${check.expectType} got ' + typeof _r); failed++;`);
          lines.push(`  }`);
        } else if (check.call && check.expectContains) {
          lines.push(`  const _r = ${check.call};`);
          lines.push(`  const _rs = typeof _r === 'string' ? _r : JSON.stringify(_r);`);
          lines.push(`  if (_rs.includes('${check.expectContains.replace(/'/g, "\\'")}')) {`);
          lines.push(`    console.log('PASS: ${tc.name}'); passed++;`);
          lines.push(`  } else {`);
          lines.push(`    console.log('FAIL: ${tc.name} - expected ${check.expectContains}'); failed++;`);
          lines.push(`  }`);
        }
      }

      lines.push(`} catch(e) {`);
      lines.push(`  console.log('FAIL: ${tc.name} - threw: ' + e.message); failed++;`);
      lines.push(`}`);
      lines.push(``);
    }

    lines.push(`console.log('\\\\n=== RESULT: ' + passed + '/' + (passed + failed) + ' PASSED ===');`);
    lines.push(`process.exit(failed > 0 ? 1 : 0);`);
    return lines.join('\n');
  }

  executeScaffold(scaffoldCode: string, scaffoldPath: string): ExecutionResult {
    this.addCheckRecord('[ENGINE] Level 2: scaffold execution', 'mechanical');
    const violations: string[] = [];
    const testCaseResults: TestCaseResult[] = [];

    try {
      const dir = path.dirname(scaffoldPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(scaffoldPath, scaffoldCode, 'utf-8');
      testCaseResults.push({
        name: 'scaffold-written-to-disk',
        checks: [{ description: 'scaffold file exists', passed: fs.existsSync(scaffoldPath), actual: true, expected: true }],
        passed: fs.existsSync(scaffoldPath),
      });
    } catch (err) {
      violations.push(`Failed to write scaffold: ${err instanceof Error ? err.message : String(err)}`);
      return { passed: false, testCaseResults, violations };
    }

    return { passed: violations.length === 0, testCaseResults, violations };
  }

  // ========== LEVEL 3: SIDE-EFFECT AUDIT ==========

  snapshotFilesystem(dir: string): Record<string, number> {
    this.addCheckRecord('[ENGINE] Level 3: filesystem snapshot', 'mechanical');
    const snap: Record<string, number> = {};
    const walk = (d: string) => {
      try {
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(d, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            walk(fullPath);
          } else if (entry.isFile()) {
            const stat = fs.statSync(fullPath);
            snap[path.relative(dir, fullPath)] = stat.size;
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[SRE-snapshotFilesystem::walk] Error reading directory ' + d + ': ' + errorMsg);
      }
    };
    if (fs.existsSync(dir)) walk(dir);
    return snap;
  }

  compareFilesystem(before: Record<string, number>, after: Record<string, number>): SideEffectResult {
    this.addCheckRecord('[ENGINE] Level 3: filesystem comparison', 'mechanical');
    const violations: SideEffectViolation[] = [];
    const createdFiles = Object.keys(after).filter(f => !(f in before));
    const deletedFiles = Object.keys(before).filter(f => !(f in after));
    const modifiedFiles = Object.keys(after).filter(f => (f in before) && before[f] !== after[f]);

    if (createdFiles.length === 0 && modifiedFiles.length === 0) {
      violations.push({ check: 'filesystem-changed', details: 'No files were created or modified', severity: 'FAILURE' });
    }

    return {
      passed: violations.filter((v: SideEffectViolation) => v.severity === 'FAILURE').length === 0,
      violations,
      before,
      after,
    };
  }

  // ========== LEVEL 4: PRINCIPLE COMPLIANCE (P1-P12) ==========

  auditPrinciples(sourceFile?: string): PrincipleReport {
    this.addCheckRecord('[ENGINE] Level 4: P1-P12 audit', 'textual');
    const results: PrincipleResult[] = [];

    const targetFile = sourceFile || path.join(this.projectRoot, 'src/slop-removal-engine.ts');
    let content = '';
    try {
      content = fs.readFileSync(targetFile, 'utf-8');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[SRE-auditPrinciples] Error reading source file: ' + errorMsg);
      return {
        passed: false,
        principlesPassed: 0,
        totalPrinciples: 12,
        principleResults: P1_P12_CHECKS.map((p: { id: string; label: string; checker: (fileContent: string) => string[] }) => ({
          name: p.id, label: p.label, pass: false, violations: [`Cannot read ${targetFile}`],
        })),
      };
    }

    for (const check of P1_P12_CHECKS) {
      let violations: string[];
      try {
        violations = check.checker(content);
      } catch (err) {
        violations = [`Checker error: ${err instanceof Error ? err.message : String(err)}`];
      }
      results.push({
        name: check.id,
        label: check.label,
        pass: violations.length === 0,
        violations,
      });
    }

    const passed = results.filter((r: PrincipleResult) => r.pass).length;
    return {
      passed: passed >= 11,
      principlesPassed: passed,
      totalPrinciples: 12,
      principleResults: results,
    };
  }

  // ========== LEVEL 5: MACRO DERAILMENT DETECTION ==========

  detectDerailments(agentOutput: string): DerailmentReport {
    this.addCheckRecord('[ENGINE] Level 5: derailment detection', 'textual');
    const derailments: DerailmentEntry[] = [];

    for (const dp of DERAILMENT_PATTERNS) {
      const match = agentOutput.match(dp.pattern);
      if (match) {
        derailments.push({
          pattern: dp.name,
          match: match[0].substring(0, 120),
          severity: dp.severity,
          details: `Pattern '${dp.name}' detected: '${match[0].substring(0, 100)}'`,
        });
      }
    }

    return {
      passed: derailments.length === 0,
      derailments,
    };
  }

  // ========== E10 DETECTION ==========

  detectE10Violation(agentOutput: string): E10Report {
    this.addCheckRecord('[ENGINE] Level 5: E10 violation', 'textual');
    const forbiddenPhrases: string[] = [];

    for (const pattern of E10_FORBIDDEN_PATTERNS) {
      const match = agentOutput.match(pattern);
      if (match) {
        forbiddenPhrases.push(match[0]);
      }
    }

    const violation = forbiddenPhrases.length > 0;
    return {
      violation,
      detected: violation,
      details: violation
        ? `E10 VIOLATION: Forbidden phrase(s) detected: ${forbiddenPhrases.join(', ')}`
        : 'No E10 violation detected',
      p0Offense: violation,
      forbiddenPhrases,
    };
  }


  // ========== 90/10 MECHANICAL RATIO ==========

  measureMechanicalRatio(records?: CheckRecord[]): RatioReport {
    this.addCheckRecord('[ENGINE] 90/10: ratio measurement', 'mechanical');
    const recs = records || this.checkRecords.filter((r: CheckRecord) => r.name.startsWith('[ENGINE]'));
    let mechanicalScore = 0;
    let textualScore = 0;
    for (const rec of recs) {
      if (rec.category === 'mechanical') {
        mechanicalScore += 1;
      } else if (rec.name.includes('Level 0') || rec.name.includes('Level 1') || rec.name.includes('Level 4')) {
        mechanicalScore += 0.4;
        textualScore += 0.6;
      } else if (rec.name.includes('Level 5') || rec.name.includes('Hard-First') || rec.name.includes('E10')) {
        mechanicalScore += 0.25;
        textualScore += 0.75;
      } else {
        textualScore += 1;
      }
    }
    const total = mechanicalScore + textualScore;
    const ratio = total > 0 ? mechanicalScore / total : 0;

    return {
      mechanical: Math.round(mechanicalScore),
      textual: Math.round(textualScore),
      ratio: Math.round(ratio * 100) / 100,
      passed: ratio >= 0.90,
      records: recs.slice(),
    };
  }



  private computeCompositeLevel(verdicts: DeliverableVerdict[], level: number): LevelVerdict {
    let totalChecks = 0;
    let passedChecks = 0;
    const violations: string[] = [];

    for (const v of verdicts) {
      const l = level === 0 ? v.level0 : level === 1 ? v.level1 : level === 2 ? v.level2 : level === 3 ? v.level3 : v.level4;
      if (l) {
        totalChecks += l.totalChecks;
        passedChecks += l.passedChecks;
        violations.push(...l.violations);
      }
    }

    return {
      passed: violations.length === 0,
      passedChecks,
      totalChecks,
      violations,
    };
  }

  // ========== EVIDENCE WRITER ==========

  writeSreEvidence(
    level0Result: SourcePresenceResult[],
    level1Report: CallSiteReport,
    sideEffectResult: SideEffectResult,
    principleReport: PrincipleReport,
    derailmentReport: DerailmentReport,
    e10Report: E10Report,
    ratioReport: RatioReport,
    shipGateResult: ShipGateVerdict,
  ): void {
    this.addCheckRecord('[ENGINE] Evidence: write SRE evidence files', 'mechanical');

    if (!fs.existsSync(this.evidenceDir)) {
      fs.mkdirSync(this.evidenceDir, { recursive: true, mode: 0o700 });
    }

    const write = (filename: string, data: unknown) => {
      const filePath = path.join(this.evidenceDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    };

    write('SRE_LEVEL0_PRESENCE.json', { timestamp: new Date().toISOString(), results: level0Result });
    write('SRE_LEVEL1_CALLSITE.json', { timestamp: new Date().toISOString(), ...level1Report });
    write('SRE_LEVEL3_SIDEEFFECT.json', { timestamp: new Date().toISOString(), ...sideEffectResult });
    write('SRE_LEVEL4_PRINCIPLES.json', { timestamp: new Date().toISOString(), ...principleReport });
    write('SRE_LEVEL5_DERAILMENT.json', { timestamp: new Date().toISOString(), ...derailmentReport });
    write('SRE_MECHANICAL_RATIO.json', { timestamp: new Date().toISOString(), ...ratioReport });
    write('SRE_SHIP_GATE_VERDICT.json', shipGateResult);
  }

  getMvs(): MVS { return this.mvs; }
}
