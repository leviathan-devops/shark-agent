import * as ts from 'typescript';
import { SemanticRule, SemanticFinding } from './rule-engine.js';

const THEATRICAL_PROPERTIES = /^success|dispersed|consensus|evidencePath|passed|verified|complete|overallPassed|delivered|dispatched|spawned$/i;

const IO_PATTERNS = [
  'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile',
  'mkdirSync', 'mkdir', 'copyFileSync', 'copyFile', 'rmSync', 'rm',
  'execSync', 'exec', 'spawnSync', 'spawn', 'execFileSync', 'execFile',
  'task', 'tool', 'docker', 'kubectl',
  'send', 'post', 'put', 'request',
  'writeJson', 'outputJson', 'outputFile',
  'createWriteStream'
];

function hasIOCallBeforeReturn(funcBody: ts.FunctionBody, returnNode: ts.ReturnStatement): boolean {
  const returnPos = returnNode.getStart();
  let foundIO = false;

  const visitor = (node: ts.Node): void => {
    if (foundIO) return;
    if (node.pos >= returnPos) return;

    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText();
      for (const pattern of IO_PATTERNS) {
        if (callText.includes(pattern)) {
          foundIO = true;
          return;
        }
      }
    }

    if (ts.isNewExpression(node)) {
      const exprText = node.expression.getText();
      for (const pattern of IO_PATTERNS) {
        if (exprText.includes(pattern)) {
          foundIO = true;
          return;
        }
      }
    }

    ts.forEachChild(node, visitor);
  };

  visitor(funcBody);
  return foundIO;
}

export const p11SideEffectTruth: SemanticRule = {
  id: 'P11',
  description: 'Functions returning success objects must have side effects before the return',
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

        let objectExpr: ts.ObjectLiteralExpression | null = null;

        if (ts.isObjectLiteralExpression(expr)) {
          objectExpr = expr;
        } else if (ts.isIdentifier(expr)) {
          const varName = expr.text;
          const findVar = (searchNode: ts.Node): void => {
            if (objectExpr) return;
            if (ts.isVariableDeclaration(searchNode) && ts.isIdentifier(searchNode.name) && searchNode.name.text === varName) {
              if (searchNode.initializer && ts.isObjectLiteralExpression(searchNode.initializer)) {
                objectExpr = searchNode.initializer;
              }
            }
            ts.forEachChild(searchNode, findVar);
          };
          findVar(node);
        }

        if (objectExpr) {
          let hasTheatricalProperty = false;
          for (const prop of objectExpr.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
              if (THEATRICAL_PROPERTIES.test(prop.name.text)) {
                hasTheatricalProperty = true;
                break;
              }
            }
          }

          if (hasTheatricalProperty) {
            const hasActionRequired = objectExpr.properties.some((p: ts.ObjectLiteralElementLike) =>
              ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'action_required'
            );

            if (hasActionRequired) return;

            const hasSideEffect = hasIOCallBeforeReturn(body, n);

            if (!hasSideEffect) {
              const retLine = ts.getLineAndCharacterOfPosition(sourceFile, n.pos).line + 1;
              const funcName = ts.isFunctionDeclaration(node) && node.name ? node.name.text : 'anonymous';
              findings.push({
                ruleId: 'P11',
                severity: 'CRITICAL',
                message: `Function '${funcName}' returns a success object at line ${retLine} without performing any I/O before the return. Functions that report completion must have side effects (file writes, tool calls, subagent spawns).`,
                file: sourceFile.fileName,
                line: retLine
              } as SemanticFinding);
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
