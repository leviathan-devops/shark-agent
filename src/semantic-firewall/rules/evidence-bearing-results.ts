import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';

/**
 * Evidence-Bearing Results — Order 2 (pure AST).
 *
 * Detects return statements with {success: true} or {passed: true} that
 * are NOT preceded by a call to an evidence-producing API.
 *
 * SEMANTIC ADVANTAGE over regex:
 * - Walks the ObjectLiteralExpression properties array
 * - Uses ts.isTrueKeyword() for value checking
 * - Walks the AST tree to find CallExpression nodes with specific callee names
 * - Does NOT use getText() or regex for analysis
 */
export function checkEvidenceBearingResults(): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isReturnStatement(node) || !node.expression) return null;
    if (!ts.isObjectLiteralExpression(node.expression)) return null;

    // WALK PROPERTIES — check for success: true or passed: true
    let hasSuccessTrue = false;
    for (const prop of node.expression.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const propName = ts.isIdentifier(prop.name)
        ? prop.name.text
        : ts.isStringLiteral(prop.name)
          ? prop.name.text
          : '';
      if ((propName === 'success' || propName === 'passed') && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        hasSuccessTrue = true;
        break;
      }
    }

    if (!hasSuccessTrue) return null;

    // Check if the enclosing function has evidence-producing API calls
    if (!hasSideEffectCall(node, sourceFile)) {
      const pos = getNodePosition(node, sourceFile);
      return {
        rule: 'evidence-bearing-results',
        severity: 'error',
        file: sourceFile.fileName,
        line: pos.line,
        column: pos.column,
        message: '[P10] Theatrical return {success: true} without evidence-producing API call',
        nodeKind: 'ReturnStatement',
        sourceSnippet: getNodeSnippet(node, sourceFile),
      };
    }
    return null;
  };
}

/**
 * Walk the AST tree from the return statement's enclosing function to find
 * CallExpression nodes that call evidence-producing APIs.
 *
 * Uses AST walking — NO getText(), NO string.includes().
 * Identifies calls by checking the callee identifier name directly.
 */
function hasSideEffectCall(returnNode: ts.Node, sourceFile: ts.SourceFile): boolean {
  // Walk up to enclosing function
  let fn = returnNode.parent;
  while (fn && !ts.isSourceFile(fn) && !ts.isFunctionDeclaration(fn) && !ts.isArrowFunction(fn) && !ts.isMethodDeclaration(fn) && !ts.isFunctionExpression(fn)) {
    fn = fn.parent;
  }
  if (!fn || ts.isSourceFile(fn)) return false;

  const body = ts.isFunctionDeclaration(fn) ? fn.body : ts.isArrowFunction(fn) ? fn.body : ts.isMethodDeclaration(fn) ? fn.body : ts.isFunctionExpression(fn) ? fn.body : null;
  if (!body) return false;

  // Evidence-producing APIs — checked by callee identifier name
  const EVIDENCE_APIS = new Set([
    'writeFileSync', 'writeFile', 'appendFileSync',
    'mkdirSync', 'execSync',
  ]);

  let found = false;

  function visit(n: ts.Node): void {
    if (found) return;

    // Check for CallExpression
    if (ts.isCallExpression(n)) {
      const expr = n.expression;
      let calleeName = '';

      // Direct call: writeFileSync(...)
      if (ts.isIdentifier(expr)) {
        calleeName = expr.text;
      }
      // Method call: fs.writeFileSync(...) or console.log(...)
      else if (ts.isPropertyAccessExpression(expr)) {
        calleeName = expr.name.text;
      }

      if (EVIDENCE_APIS.has(calleeName)) {
        found = true;
        return;
      }
    }

    // Recurse into children
    ts.forEachChild(n, visit);
  }

  // Visit the function body (excluding the return statement itself)
  ts.forEachChild(body, visit);

  return found;
}
