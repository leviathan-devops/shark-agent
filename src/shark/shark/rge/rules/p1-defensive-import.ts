import * as ts from 'typescript';
import { SemanticRule, SemanticFinding } from './rule-engine.js';

function isInTryBlock(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isTryStatement(current)) return true;
    if (ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isFunctionExpression(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

function resolveImportSymbol(node: ts.ImportDeclaration | ts.CallExpression, checker: ts.TypeChecker): ts.Symbol | undefined {
  if (ts.isImportDeclaration(node)) {
    return checker.getSymbolAtLocation(node.moduleSpecifier);
  }
  return undefined;
}

export const p1DefensiveImport: SemanticRule = {
  id: 'P1',
  description: 'All imports must be resolvable. Cross-boundary relative imports should be guarded by try/catch.',
  layer: 'type_contract',
  check: (node: ts.Node, checker: ts.TypeChecker, sourceFile: ts.SourceFile) => {
    if (!ts.isImportDeclaration(node) && !ts.isCallExpression(node)) return [];

    const findings: SemanticFinding[] = [];
    let moduleSpecifier: string | null = null;

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      moduleSpecifier = node.moduleSpecifier.text;
    } else if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === 'require' && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
        moduleSpecifier = node.arguments[0].text;
      }
    }

    if (!moduleSpecifier) return [];

    const importLine = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;

    const isRelative = moduleSpecifier.startsWith('./') || moduleSpecifier.startsWith('../');
    const isCrossBoundary = moduleSpecifier.startsWith('../') && moduleSpecifier.split('/').filter(s => s === '..').length >= 2;

    if (isRelative) {
      const symbol = resolveImportSymbol(node, checker);

      if (!symbol) {
        findings.push({
          ruleId: 'P1',
          severity: 'CRITICAL',
          message: `Import '${moduleSpecifier}' at line ${importLine} could not be resolved — the target module was not found by the TypeChecker. Verify the path or install the missing dependency.`,
          file: sourceFile.fileName,
          line: importLine
        } as SemanticFinding);
        return findings;
      }
    }

    if (isCrossBoundary && !isInTryBlock(node)) {
      findings.push({
        ruleId: 'P1',
        severity: 'HIGH',
        message: `Cross-boundary import '${moduleSpecifier}' at line ${importLine} is not inside a try/catch block. Imports that traverse multiple directories may fail at runtime if the module structure changes.`,
        file: sourceFile.fileName,
        line: importLine
      } as SemanticFinding);
    }

    return findings;
  }
};
