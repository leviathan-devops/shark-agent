import * as ts from 'typescript';
import { SemanticRule, SemanticFinding } from './rule-engine.js';

export const p10OutputContract: SemanticRule = {
  id: 'P10',
  description: 'Functions must return the declared type in all code paths',
  layer: 'type_contract',
  check: (node: ts.Node, checker: ts.TypeChecker, sourceFile: ts.SourceFile) => {
    if (!ts.isFunctionDeclaration(node) && !ts.isMethodDeclaration(node)) return [];

    if (!node.type) return [];

    const findings: SemanticFinding[] = [];

    const signature = checker.getSignatureFromDeclaration(node);
    if (!signature) return [];

    const declaredReturnType = checker.getReturnTypeOfSignature(signature);
    const declaredTypeStr = checker.typeToString(declaredReturnType);

    if (declaredTypeStr === 'void' || declaredTypeStr === 'never') return [];

    const returns: ts.ReturnStatement[] = [];
    const collectReturns = (n: ts.Node): void => {
      if (ts.isReturnStatement(n) && n.expression) {
        if (node.body && n.pos >= node.body.pos && n.end <= node.body.end) {
          returns.push(n);
        }
      }
      if (n !== node) ts.forEachChild(n, collectReturns);
    };
    collectReturns(node);

    for (const ret of returns) {
      if (!ret.expression) continue;

      try {
        const actualType = checker.getTypeAtLocation(ret.expression);
        const actualTypeStr = checker.typeToString(actualType);

        if (actualTypeStr === 'undefined') {
          if (declaredTypeStr !== 'undefined' && declaredTypeStr !== 'any') {
            const retLine = ts.getLineAndCharacterOfPosition(sourceFile, ret.pos).line + 1;
            findings.push({
              ruleId: 'P10',
              severity: 'HIGH',
              message: `Return type mismatch at line ${retLine}: function declares '${declaredTypeStr}' but a path returns 'undefined'. All paths must return the declared type.`,
              file: sourceFile.fileName,
              line: retLine
            } as SemanticFinding);
          }
          continue;
        }

        if (!checker.isTypeAssignableTo(actualType, declaredReturnType)) {
          const retLine = ts.getLineAndCharacterOfPosition(sourceFile, ret.pos).line + 1;
          findings.push({
            ruleId: 'P10',
            severity: 'HIGH',
            message: `Return type mismatch at line ${retLine}: declared '${declaredTypeStr}' but returned expression has type '${actualTypeStr}' which is not assignable.`,
            file: sourceFile.fileName,
            line: retLine
          } as SemanticFinding);
        }
      } catch {
        console.warn('[P10] type computation failed for return');
        findings.push({
          ruleId: 'P10',
          severity: 'LOW',
          message: `Could not compute type for return at line ${ts.getLineAndCharacterOfPosition(sourceFile, ret.pos).line + 1}`,
          file: sourceFile.fileName,
          line: ts.getLineAndCharacterOfPosition(sourceFile, ret.pos).line + 1
        } as SemanticFinding);
      }
    }

    return findings;
  }
};
