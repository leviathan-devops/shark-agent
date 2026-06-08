import * as ts from 'typescript';
import { SemanticRule } from './rule-engine.js';

const FORBIDDEN_PREFIXES = [
  '/home/',
  '/root/',
  '/Users/',
  '/tmp/',
  'C:\\',
  'D:\\',
  '/var/',
  '/etc/'
];

export const p7PathResolution: SemanticRule = {
  id: 'P7',
  description: 'No hardcoded absolute paths',
  layer: 'syntactic',
  check: (node: ts.Node, _checker: ts.TypeChecker, sourceFile: ts.SourceFile) => {
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return [];

    const text = node.text;

    for (const prefix of FORBIDDEN_PREFIXES) {
      if (text.startsWith(prefix) && text.length > prefix.length) {
        let isPathContext = false;
        let parent = node.parent;
        while (parent) {
          if (ts.isCallExpression(parent)) {
            const callExpr = parent as ts.CallExpression;
            const funcText = callExpr.expression.getText();
            if (
              funcText.includes('readFile') ||
              funcText.includes('writeFile') ||
              funcText.includes('mkdir') ||
              funcText.includes('existsSync') ||
              funcText.includes('join') ||
              funcText.includes('resolve') ||
              funcText.includes('require') ||
              funcText.includes('import')
            ) {
              isPathContext = true;
            }
            break;
          }
          if (ts.isPropertyAssignment(parent) || ts.isVariableDeclaration(parent)) {
            isPathContext = true;
            break;
          }
          if (parent === sourceFile) break;
          parent = parent.parent;
        }

        if (isPathContext) {
          const line = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;
          return [{
            ruleId: 'P7',
            severity: 'HIGH',
            message: `Hardcoded absolute path '${text}' at line ${line}. Use path.join(__dirname, ...) or process.cwd() instead.`,
            file: sourceFile.fileName,
            line
          }];
        }
      }
    }

    return [];
  }
};
