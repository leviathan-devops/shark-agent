import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { SemanticEngine, createSemanticEngine, createInMemoryEngine } from './compiler-host.js';
import { RuleEngine } from './rules/rule-engine.js';
import { RGEAuditReport, SemanticFinding, RuleLayer } from './report-types.js';
import { PatternDatabase, PatternMatch } from './pattern-db.js';
import { RGEStateMachine } from './state-machine.js';
import { EvidenceValidator } from './evidence-validator.js';

import { p1DefensiveImport } from './rules/p1-defensive-import.js';
import { p2TypeCertainty } from './rules/p2-type-certainty.js';
import { p3ErrorCompleteness } from './rules/p3-error-completeness.js';
import { p4ResourceLifecycle } from './rules/p4-resource-lifecycle.js';
import { p6DependencyVerification } from './rules/p6-dependency-verification.js';
import { p7PathResolution } from './rules/p7-path-resolution.js';
import { p9AsyncDiscipline } from './rules/p9-async-discipline.js';
import { p10OutputContract } from './rules/p10-output-contract.js';
import { p11SideEffectTruth } from './rules/p11-side-effect-truth.js';
import { antiEmptySetConsensus } from './rules/anti-empty-set-consensus.js';
import { antiTheatricalFilePath } from './rules/anti-theatrical-file-path.js';

import { trackFloatingPromises } from './control-flow/promise-tracker.js';
import { trackUnpairedTimers } from './control-flow/timer-tracker.js';
import { buildCFG } from './control-flow/cfg-builder.js';
import { enforceLayers } from './architecture/layer-enforcer.js';
import { detectDeadExports } from './architecture/dead-export-detector.js';
import { ScaffoldGenerator } from './scaffold-generator.js';

const LAYER_NAMES: (keyof RGEAuditReport['layers'])[] = [
  'l0_syntactic',
  'l1_type_contract',
  'l2_control_flow',
  'l3_architecture',
  'l4_side_effect_truth',
  'l5_pattern_db'
];

const RULE_LAYER_MAP: Record<string, keyof RGEAuditReport['layers']> = {
  'P3': 'l0_syntactic',
  'P7': 'l0_syntactic',
  'P1': 'l1_type_contract',
  'P2': 'l1_type_contract',
  'P6': 'l1_type_contract',
  'P10': 'l1_type_contract',
  'P4': 'l2_control_flow',
  'P9': 'l2_control_flow',
  'P9-FLOAT': 'l2_control_flow',
  'P4-TIMER': 'l2_control_flow',
  'ARCH-LAYER': 'l3_architecture',
  'ARCH-DEAD': 'l3_architecture',
  'P11': 'l4_side_effect_truth',
  'AE-EMPTY-SET': 'l4_side_effect_truth',
  'AE-FILE-PATH': 'l4_side_effect_truth',
  'PATTERN': 'l5_pattern_db'
};

export class RuntimeGradeEngine {
  private ruleEngine: RuleEngine;
  private patternDb: PatternDatabase;
  private stateMachine: RGEStateMachine;
  private evidenceValidator: EvidenceValidator;
  private scaffoldGenerator: ScaffoldGenerator;
  private workspaceDir: string;

  constructor(workspaceDir: string, patternsJsonPath?: string) {
    this.workspaceDir = workspaceDir;
    this.ruleEngine = new RuleEngine();
    this.patternDb = new PatternDatabase(patternsJsonPath);
    this.stateMachine = new RGEStateMachine();
    this.evidenceValidator = new EvidenceValidator();
    this.scaffoldGenerator = new ScaffoldGenerator(path.join(workspaceDir, '.spider-v2', 'scaffolds'));

    this.registerDefaultRules();
  }

  private registerDefaultRules(): void {
    this.ruleEngine.registerAll([
      p1DefensiveImport,
      p2TypeCertainty,
      p3ErrorCompleteness,
      p4ResourceLifecycle,
      p6DependencyVerification,
      p7PathResolution,
      p9AsyncDiscipline,
      p10OutputContract,
      p11SideEffectTruth,
      antiEmptySetConsensus,
      antiTheatricalFilePath
    ]);
  }

  getRuleEngine(): RuleEngine {
    return this.ruleEngine;
  }

  getPatternDb(): PatternDatabase {
    return this.patternDb;
  }

  getStateMachine(): RGEStateMachine {
    return this.stateMachine;
  }

  getEvidenceValidator(): EvidenceValidator {
    return this.evidenceValidator;
  }

  getScaffoldGenerator(): ScaffoldGenerator {
    return this.scaffoldGenerator;
  }

  auditFiles(filePaths: string[]): RGEAuditReport {
    const engine = createSemanticEngine(filePaths);

    try {
      return this.runAudit(engine);
    } finally {
      engine.dispose();
    }
  }

  auditInMemory(files: Map<string, string>): RGEAuditReport {
    const engine = createInMemoryEngine(files);

    try {
      return this.runAudit(engine);
    } finally {
      engine.dispose();
    }
  }

  auditDirectory(sourceDir?: string): RGEAuditReport {
    const dir = sourceDir || this.workspaceDir;
    const srcDir = path.join(dir, 'src');

    const filePaths: string[] = [];
    if (fs.existsSync(srcDir)) {
      this.collectTsFiles(srcDir, filePaths);
    } else {
      this.collectTsFiles(dir, filePaths);
    }

    if (filePaths.length === 0) {
      return this.createEmptyReport();
    }

    return this.auditFiles(filePaths);
  }

  checkWriteTime(content: string, fileName: string): { allowed: boolean; report?: RGEAuditReport; error?: string } {
    const files = new Map<string, string>();
    files.set(fileName, content);

    const report = this.auditInMemory(files);

    if (!report.overallPassed && report.semanticFindings.some((f: SemanticFinding) => f.severity === 'CRITICAL')) {
      return { allowed: false, report };
    }

    return { allowed: true, report };
  }

  selfAudit(): RGEAuditReport {
    const rgeDir = path.join(this.workspaceDir, 'src', 'spider', 'rge');
    return this.auditDirectory(rgeDir);
  }

  private runAudit(engine: SemanticEngine): RGEAuditReport {
    const sourceFiles = engine.getSourceFiles();
    const checker = engine.checker;

    const allFindings: SemanticFinding[] = [];
    const textualFindings: string[] = [];

    for (const sourceFile of sourceFiles) {
      const ruleFindings = this.ruleEngine.runOnSourceFile(sourceFile, checker);
      allFindings.push(...ruleFindings);

      for (const finding of ruleFindings) {
        textualFindings.push(`[${finding.ruleId}] ${finding.file}:${finding.line} - ${finding.message}`);
      }

      const archLayerFindings = enforceLayers(sourceFile, checker);
      allFindings.push(...archLayerFindings);

      for (const finding of archLayerFindings) {
        textualFindings.push(`[${finding.ruleId}] ${finding.file}:${finding.line} - ${finding.message}`);
      }

      const functions: (ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration)[] = [];
      const collectFunctions = (n: ts.Node): void => {
        if (ts.isFunctionDeclaration(n) && n.body) functions.push(n);
        else if (ts.isMethodDeclaration(n) && n.body) functions.push(n);
        else if (ts.isFunctionExpression(n) && n.body) functions.push(n);
        else if (ts.isArrowFunction(n) && n.body) functions.push(n);
        ts.forEachChild(n, collectFunctions);
      };
      collectFunctions(sourceFile);

      for (const func of functions) {
        const cfg = buildCFG(func);
        if (cfg.entryBlock) {
          const promiseFindings = trackFloatingPromises(sourceFile, cfg);
          allFindings.push(...promiseFindings);

          for (const finding of promiseFindings) {
            textualFindings.push(`[${finding.ruleId}] ${finding.file}:${finding.line} - ${finding.message}`);
          }

          const timerFindings = trackUnpairedTimers(sourceFile, cfg);
          allFindings.push(...timerFindings);

          for (const finding of timerFindings) {
            textualFindings.push(`[${finding.ruleId}] ${finding.file}:${finding.line} - ${finding.message}`);
          }
        }
      }
    }

    const deadExportFindings = this.detectDeadExports(sourceFiles, checker);
    allFindings.push(...deadExportFindings);

    for (const finding of deadExportFindings) {
      textualFindings.push(`[${finding.ruleId}] ${finding.file}:${finding.line} - ${finding.message}`);
    }

    const patternMatches = this.patternDb.query(textualFindings);
    for (const match of patternMatches) {
      allFindings.push({
        ruleId: 'PATTERN',
        severity: match.confidence > 0.5 ? 'MEDIUM' : 'LOW',
        message: `Known failure pattern '${match.patternId}' (confidence: ${Math.round(match.confidence * 100)}%): ${match.suggestedFix}`,
        file: '',
        line: 0
      });
    }

    const layers = this.groupFindingsByLayer(allFindings);
    const overallPassed = this.computeOverallPassed(layers, allFindings);
    const passRate = this.computePassRate(layers);
    const returnTo = overallPassed ? 'test_engineer' : 'coder';
    const fixInstructions = this.generateFixInstructions(allFindings);

    const evidenceDir = path.join(this.workspaceDir, '.spider-v2', 'rge-evidence');
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }

    const evidencePath = path.join(evidenceDir, 'RGE_AUDIT_REPORT.json');
    const report: RGEAuditReport = {
      overallPassed,
      passRate,
      layers,
      semanticFindings: allFindings,
      returnTo,
      fixInstructions,
      evidencePath
    };

    const validation = this.evidenceValidator.validateReport(report);
    if (!validation.valid) {
      console.error('[RGE] Report validation failed:', validation.errors.map(e => `${e.field}: ${e.message}`).join(', '));
    }

    fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2), 'utf-8');

    return report;
  }

  private detectDeadExports(sourceFiles: ts.SourceFile[], checker: ts.TypeChecker): SemanticFinding[] {
    const allFindings: SemanticFinding[] = [];

    for (const sourceFile of sourceFiles) {
      const findings = detectDeadExports(sourceFile, checker, sourceFiles);
      allFindings.push(...findings);
    }

    return allFindings;
  }

  private groupFindingsByLayer(findings: SemanticFinding[]): RGEAuditReport['layers'] {
    const layers: RGEAuditReport['layers'] = {
      l0_syntactic: { passed: true, findings: [] },
      l1_type_contract: { passed: true, findings: [] },
      l2_control_flow: { passed: true, findings: [] },
      l3_architecture: { passed: true, findings: [] },
      l4_side_effect_truth: { passed: true, findings: [] },
      l5_pattern_db: { passed: true, findings: [] }
    };

    for (const finding of findings) {
      const layerKey = RULE_LAYER_MAP[finding.ruleId] || 'l1_type_contract';
      const layer = layers[layerKey];
      layer.findings.push(`[${finding.severity}] ${finding.file}:${finding.line} - ${finding.message}`);
    }

    for (const layer of LAYER_NAMES) {
      const hasCritical = layers[layer].findings.some((f: string) => f.startsWith('[CRITICAL]'));
      layers[layer].passed = !hasCritical;
    }

    return layers;
  }

  private computeOverallPassed(layers: RGEAuditReport['layers'], _findings: SemanticFinding[]): boolean {
    let criticalCount = 0;

    for (const layer of LAYER_NAMES) {
      if (!layers[layer].passed) {
        for (const finding of layers[layer].findings) {
          if (finding.startsWith('[CRITICAL]')) criticalCount++;
        }
      }
    }

    return criticalCount === 0;
  }

  private computePassRate(layers: RGEAuditReport['layers']): number {
    let passed = 0;
    let total = 0;

    for (const layer of LAYER_NAMES) {
      const layerFindings = layers[layer].findings;
      if (layerFindings.length === 0) {
        passed++;
      }
      total++;
    }

    return total > 0 ? passed / total : 1;
  }

  private generateFixInstructions(findings: SemanticFinding[]): string[] {
    const instructions: string[] = [];

    const criticalFindings = findings.filter((f: SemanticFinding) => f.severity === 'CRITICAL');
    const highFindings = findings.filter((f: SemanticFinding) => f.severity === 'HIGH');

    for (const finding of criticalFindings) {
      instructions.push(`[CRITICAL] ${finding.file}:${finding.line} - ${finding.message}`);
    }

    for (const finding of highFindings) {
      instructions.push(`[HIGH] ${finding.file}:${finding.line} - ${finding.message}`);
    }

    return instructions;
  }

  private createEmptyReport(): RGEAuditReport {
    return {
      overallPassed: true,
      passRate: 1,
      layers: {
        l0_syntactic: { passed: true, findings: [] },
        l1_type_contract: { passed: true, findings: [] },
        l2_control_flow: { passed: true, findings: [] },
        l3_architecture: { passed: true, findings: [] },
        l4_side_effect_truth: { passed: true, findings: [] },
        l5_pattern_db: { passed: true, findings: [] }
      },
      semanticFindings: [],
      returnTo: 'test_engineer',
      fixInstructions: [],
      evidencePath: ''
    };
  }

  private collectTsFiles(dir: string, result: string[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        this.collectTsFiles(fullPath, result);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        if (!entry.name.endsWith('.d.ts')) {
          result.push(fullPath);
        }
      }
    }
  }
}
