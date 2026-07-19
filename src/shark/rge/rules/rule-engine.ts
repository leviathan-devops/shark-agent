import * as ts from 'typescript';
import type { SemanticFinding } from '../report-types.js';
export type { SemanticFinding };

export type SemanticRule = {
  id: string;
  description: string;
  layer: 'syntactic' | 'type_contract' | 'control_flow' | 'architecture' | 'side_effect_truth' | 'pattern_db';
  check: (node: ts.Node, checker: ts.TypeChecker, sourceFile: ts.SourceFile) => SemanticFinding[];
};

export class RuleEngine {
  private rules: SemanticRule[] = [];

  register(rule: SemanticRule): void {
    this.rules.push(rule);
  }

  registerAll(rules: SemanticRule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  run(node: ts.Node, checker: ts.TypeChecker, sourceFile: ts.SourceFile): SemanticFinding[] {
    const findings: SemanticFinding[] = [];
    for (const rule of this.rules) {
      try {
        const ruleFindings = rule.check(node, checker, sourceFile);
        findings.push(...ruleFindings);
      } catch (err) {
        // Verified: rule execution error pushed to findings as HIGH severity
        findings.push({
          ruleId: rule.id,
          severity: 'HIGH',
          message: `Rule ${rule.id} threw: ${err instanceof Error ? err.message : String(err)}`,
          file: sourceFile.fileName,
          line: ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1
        });
      }
    }
    return findings;
  }

  runOnSourceFile(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker
  ): SemanticFinding[] {
    const findings: SemanticFinding[] = [];
    const visitor = (node: ts.Node): void => {
      findings.push(...this.run(node, checker, sourceFile));
      ts.forEachChild(node, visitor);
    };
    visitor(sourceFile);
    return findings;
  }

  runOnProgram(
    sourceFiles: ts.SourceFile[],
    checker: ts.TypeChecker
  ): SemanticFinding[] {
    const findings: SemanticFinding[] = [];
    for (const sourceFile of sourceFiles) {
      findings.push(...this.runOnSourceFile(sourceFile, checker));
    }
    return findings;
  }

  getRules(): SemanticRule[] {
    return [...this.rules];
  }
}
