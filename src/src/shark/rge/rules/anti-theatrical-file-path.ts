import * as ts from 'typescript';
import { SemanticRule, SemanticFinding } from './rule-engine.js';

const PATH_PROPERTIES = /^evidencePath|outputPath|filePath|reportPath|artifactPath|shipPath|packagePath|distPath$/i;

const MKDIR_PATTERNS = [
  'mkdirSync', 'mkdir', 'writeFileSync', 'writeFile',
  'copyFileSync', 'copyFile', 'ensureDirSync', 'ensureDir',
  'outputFileSync', 'outputFile'
];

function hasDirCreationBeforeReturn(funcBody: ts.FunctionBody, returnNode: ts.ReturnStatement, pathProperty: string): boolean {
  const returnStart = returnNode.getStart();
  let found = false;

  const checkVisitor = (node: ts.Node): void => {
    if (found) return;
    if (node.pos >= returnStart) return;
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText();
      for (const pattern of MKDIR_PATTERNS) {
        if (callText.includes(pattern)) {
          for (const arg of node.arguments) {
            const argText = arg.getText();
            if (argText.includes(pathProperty) || pathProperty.includes(argText.replace(/['"`]/g, ''))) {
              found = true;
              return;
            }
          }
        }
      }
    }
    ts.forEachChild(node, checkVisitor);
  };

  checkVisitor(funcBody);
  return found;
}

export const antiTheatricalFilePath: SemanticRule = {
  id: 'AE-FILE-PATH',
  description: 'Functions returning file paths must create the directory/file before returning',
  layer: 'side_effect_truth',
  check: (node: ts.Node, _checker: ts.TypeChecker, sourceFile: ts.SourceFile) => {
    if (!ts.isFunctionDeclaration(node) && !ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return [];

    const body = node.body;
    if (!body) return [];
    if (!ts.isBlock(body)) return [];

    const findings: SemanticFinding[] = [];

    const visitor = (n: ts.Node): void => {
      if (ts.isReturnStatement(n) && n.expression) {
        const expr = n.expression;

        let objExpr: ts.ObjectLiteralExpression | null = null;
        if (ts.isObjectLiteralExpression(expr)) {
          objExpr = expr;
        }

        if (!objExpr) return;

        for (const prop of objExpr.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            if (PATH_PROPERTIES.test(prop.name.text)) {
              const propName = prop.name.text;
              const hasCreation = hasDirCreationBeforeReturn(body, n, propName);

              if (!hasCreation) {
                const retLine = ts.getLineAndCharacterOfPosition(sourceFile, n.pos).line + 1;
                const funcName = ts.isFunctionDeclaration(node) && node.name ? node.name.text : 'anonymous';
                findings.push({
                  ruleId: 'AE-FILE-PATH',
                  severity: 'HIGH',
                  message: `Function '${funcName}' returns '${propName}' at line ${retLine} without creating the directory/file before the return. File paths must be backed by actual mkdirSync/file creation calls.`,
                  file: sourceFile.fileName,
                  line: retLine
                } as SemanticFinding);
              }
            }
          }
        }
      }
      ts.forEachChild(n, visitor);
    };

    visitor(node);
    return findings;
  }
};
