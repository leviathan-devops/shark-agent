import * as ts from 'typescript';
import { SemanticFinding } from '../report-types.js';

interface ExportRecord {
  name: string;
  node: ts.Node;
  line: number;
  sourceFile: ts.SourceFile;
}

function collectExports(sourceFile: ts.SourceFile): ExportRecord[] {
  const exports: ExportRecord[] = [];

  const visitor = (node: ts.Node): void => {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const line = ts.getLineAndCharacterOfPosition(sourceFile, element.pos).line + 1;
          exports.push({ name: element.name.text, node: element, line, sourceFile });
        }
      }
    }

    if (ts.isVariableStatement(node)) {
      for (const modifier of (node.modifiers || [])) {
        if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              const line = ts.getLineAndCharacterOfPosition(sourceFile, decl.pos).line + 1;
              exports.push({ name: decl.name.text, node: decl, line, sourceFile });
            }
          }
        }
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      for (const modifier of (node.modifiers || [])) {
        if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
          const line = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
          exports.push({ name: node.name.text, node, line, sourceFile });
        }
      }
    }

    if (ts.isClassDeclaration(node) && node.name) {
      for (const modifier of (node.modifiers || [])) {
        if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
          const line = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
          exports.push({ name: node.name.text, node, line, sourceFile });
        }
      }
    }

    ts.forEachChild(node, visitor);
  };

  visitor(sourceFile);
  return exports;
}

function countReferences(
  sourceFile: ts.SourceFile,
  exportName: string,
  allFiles: ts.SourceFile[]
): number {
  let count = 0;

  for (const file of allFiles) {
    if (file.fileName === sourceFile.fileName) {
      const exports = collectExports(sourceFile);
      const isExportedFromSelf = exports.some(e => e.name === exportName);
      if (isExportedFromSelf) continue;
    }

    const searchText = file.text;
    let idx = 0;
    while (idx < searchText.length) {
      idx = searchText.indexOf(exportName, idx);
      if (idx === -1) break;

      const charBefore = idx > 0 ? searchText[idx - 1] : ' ';
      const charAfter = idx + exportName.length < searchText.length ? searchText[idx + exportName.length] : ' ';

      const isWordBoundary = /[\s\.,;:(){}[\]<>+\-*/=!?|&`'"]/.test(charBefore) || charBefore === ' ' || charBefore === '\n' || charBefore === '\r' || charBefore === '\t';
      const isWordEnd = /[\s\.,;:(){}[\]<>+\-*/=!?|&`'"]/.test(charAfter) || charAfter === ' ' || charAfter === '\n' || charAfter === '\r' || charAfter === '\t' || charAfter === '';

      if (isWordBoundary && isWordEnd) {
        const beforeContext = searchText.substring(Math.max(0, idx - 20), idx);

        const isImport = /import\s*\{[^}]*$/.test(beforeContext);
        const isRequire = /require\s*\(\s*['"][^'"]*$/.test(beforeContext);
        const isTypeOnly = /(interface|type)\s+\w/.test(beforeContext);

        if (!isImport && !isRequire && !isTypeOnly) {
          count++;
        }
      }

      idx++;
    }
  }

  return count;
}

export function detectDeadExports(
  sourceFile: ts.SourceFile,
  _checker: ts.TypeChecker,
  allFiles: ts.SourceFile[]
): SemanticFinding[] {
  const findings: SemanticFinding[] = [];
  const exports = collectExports(sourceFile);

  for (const exp of exports) {
    const refCount = countReferences(sourceFile, exp.name, allFiles);

    if (refCount === 0) {
      findings.push({
        ruleId: 'ARCH-DEAD',
        severity: 'MEDIUM',
        message: `Exported symbol '${exp.name}' at line ${exp.line} has zero references across the codebase. Consider removing or verifying this export is intentionally unused.`,
        file: sourceFile.fileName,
        line: exp.line
      });
    }
  }

  return findings;
}
