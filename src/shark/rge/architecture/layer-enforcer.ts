import * as path from 'path';
import * as ts from 'typescript';
import { SemanticFinding } from '../report-types.js';

const ALLOWED_CROSS_LAYER_IMPORTS: Record<string, string[]> = {
  'src/tools/': ['src/shark/', 'src/hooks/', 'src/agents/'],
  'src/hooks/': ['src/shark/'],
  'src/agents/': ['src/shark/'],
  'src/shark/rge/': ['src/shark/'],
  'src/shark/': [],
};

function getLayer(fileName: string): string | null {
  for (const layer of Object.keys(ALLOWED_CROSS_LAYER_IMPORTS)) {
    if (fileName.includes(layer)) return layer;
  }
  return null;
}

function resolveRelativeImport(sourcePath: string, relativePath: string): string {
  if (relativePath.startsWith('.')) {
    const dir = path.dirname(sourcePath);
    return path.normalize(path.join(dir, relativePath));
  }
  return relativePath;
}

export function enforceLayers(
  sourceFile: ts.SourceFile,
  _checker: ts.TypeChecker
): SemanticFinding[] {
  const findings: SemanticFinding[] = [];
  const sourceLayer = getLayer(sourceFile.fileName);
  if (!sourceLayer) return [];

  const allowedTargets = ALLOWED_CROSS_LAYER_IMPORTS[sourceLayer] || [];

  const visitor = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const importPath = node.moduleSpecifier.text;

      if (importPath.startsWith('.') && !importPath.startsWith('..')) return;

      if (!importPath.startsWith('.')) return;

      const resolvedPath = resolveRelativeImport(sourceFile.fileName, importPath);

      const isViolation = !allowedTargets.some(target => resolvedPath.includes(target));

      if (isViolation) {
        const importLine = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
        findings.push({
          ruleId: 'ARCH-LAYER',
          severity: 'MEDIUM',
          message: `Import '${importPath}' at line ${importLine} crosses layer boundary. Module in '${sourceLayer}' should only import from: ${allowedTargets.join(', ') || '(nothing)'}.`,
          file: sourceFile.fileName,
          line: importLine
        } as SemanticFinding);
      }
    }
    ts.forEachChild(node, visitor);
  };

  visitor(sourceFile);
  return findings;
}
