import * as ts from 'typescript';
import { SemanticRule, SemanticFinding } from './rule-engine.js';

const CONSENSUS_PROPERTY_NAMES = new Set(['consensus', 'overallPassed', 'verified', 'passed']);

function returnsObjectWithConsensus(node: ts.FunctionDeclaration | ts.ArrowFunction): boolean {
  const body = node.body;
  if (!body) return false;

  let found = false;

  const visitor = (n: ts.Node): void => {
    if (found) return;
    if (ts.isReturnStatement(n) && n.expression) {
      const expr = n.expression;

      if (ts.isObjectLiteralExpression(expr)) {
        for (const prop of expr.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            if (CONSENSUS_PROPERTY_NAMES.has(prop.name.text)) {
              found = true;
              return;
            }
          }
        }
        return;
      }

      if (ts.isIdentifier(expr)) {
        const varName = expr.text;
        const findDecl = (searchNode: ts.Node): void => {
          if (ts.isVariableDeclaration(searchNode) && ts.isIdentifier(searchNode.name) && searchNode.name.text === varName) {
            if (searchNode.initializer && ts.isObjectLiteralExpression(searchNode.initializer)) {
              for (const prop of searchNode.initializer.properties) {
                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                  if (CONSENSUS_PROPERTY_NAMES.has(prop.name.text)) {
                    found = true;
                    return;
                  }
                }
              }
            }
          }
          if (!found) ts.forEachChild(searchNode, findDecl);
        };
        findDecl(body);
      }
    }
    if (!found) ts.forEachChild(n, visitor);
  };

  visitor(body);
  return found;
}

function hasEmptySetGuard(node: ts.FunctionDeclaration | ts.ArrowFunction): boolean {
  const body = node.body;
  if (!body) return false;

  let foundGuard = false;

  const visitor = (n: ts.Node): void => {
    if (foundGuard) return;
    if (ts.isIfStatement(n)) {
      const cond = n.expression;

      if (ts.isBinaryExpression(cond)) {
        if (cond.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || cond.operatorToken.kind === ts.SyntaxKind.LessThanToken) {
          const leftText = cond.left.getText();
          const rightText = cond.right.getText();

          const isLengthCheck = leftText.endsWith('.length') && (rightText === '0');
          const isSizeCheck = leftText.endsWith('.size') && (rightText === '0' || rightText === '1');

          if (isLengthCheck || isSizeCheck) {
            const guardExits = (s: ts.Statement): boolean => {
              if (ts.isReturnStatement(s) || ts.isThrowStatement(s)) {
                if (ts.isReturnStatement(s) && s.expression) {
                  const retText = s.expression.getText();
                  if (retText.includes('consensus') || retText.includes('overallPassed') || retText.includes('true') || retText.includes('false')) {
                    return true;
                  }
                }
                return ts.isReturnStatement(s) && !s.expression;
              }
              if (ts.isBlock(s)) {
                if (s.statements.length > 0) {
                  const last = s.statements[s.statements.length - 1];
                  return ts.isReturnStatement(last) || ts.isThrowStatement(last);
                }
              }
              return false;
            };

            if (guardExits(n.thenStatement)) {
              foundGuard = true;
              return;
            }
          }
        }
      }
    }
    if (!foundGuard) ts.forEachChild(n, visitor);
  };

  visitor(body);
  return foundGuard;
}

export const antiEmptySetConsensus: SemanticRule = {
  id: 'AE-EMPTY-SET',
  description: 'No aggregation function returns consensus: true when input array is empty',
  layer: 'side_effect_truth',
  check: (node: ts.Node, _checker: ts.TypeChecker, sourceFile: ts.SourceFile) => {
    if (!ts.isFunctionDeclaration(node) && !ts.isArrowFunction(node)) return [];

    const body = node.body;
    if (!body) return [];

    const funcName = ts.isFunctionDeclaration(node) && node.name ? node.name.text : 'anonymous';

    if (!returnsObjectWithConsensus(node)) return [];

    const hasGuard = hasEmptySetGuard(node);

    if (!hasGuard) {
      const funcLine = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1;

      return [{
        ruleId: 'AE-EMPTY-SET',
        severity: 'CRITICAL',
        message: `Function '${funcName}' at line ${funcLine} returns a consensus/overallPassed object but has no AST-detectable empty-set guard. Functions that report consensus must check for empty input arrays first.`,
        file: sourceFile.fileName,
        line: funcLine
      } as SemanticFinding];
    }

    return [];
  }
};
