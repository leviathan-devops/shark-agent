import * as ts from 'typescript';
import type { BasicBlock } from '../analyzers/cfg-builder.js';

interface ASTVisitResult {
  rule: string; severity: 'error' | 'warning'; file: string; line: number; column: number;
  message: string; nodeKind: string; sourceSnippet?: string;
}
type ASTVisitor = (node: ts.Node, sourceFile: ts.SourceFile) => ASTVisitResult | null;

function getNodePosition(node: ts.Node, sourceFile: ts.SourceFile): { line: number; column: number } {
  const p = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: p.line + 1, column: p.character + 1 };
}
function getNodeSnippet(node: ts.Node, sourceFile: ts.SourceFile, cl: number = 1): string {
  const s = Math.max(0, node.getStart(sourceFile) - cl * 80);
  const e = Math.min(sourceFile.text.length, node.getEnd() + cl * 80);
  return sourceFile.text.substring(s, e);
}
function findParentKind(node: ts.Node, kind: ts.SyntaxKind): ts.Node | null {
  let cur = node.parent;
  while (cur) { if (cur.kind === kind) return cur; if (ts.isSourceFile(cur)) return null; cur = cur.parent; }
  return null;
}

/**
 * No Unsafe Cast — Order 2-3 (pure AST + optional CFG).
 *
 * Uses ts.isAsExpression() to find cast nodes (Order 2).
 * Uses AST predicates to detect type guards (Order 2):
 *   - typeof checks via ts.isTypeOfExpression()
 *   - instanceof checks via InstanceOfKeyword
 *   - Type guard function calls via identifier name pattern
 *
 * SEMANTIC ADVANTAGE over text-based regex detection:
 * - Cannot be bypassed by changing spacing in typeof expression
 * - Understands the STRUCTURE of the guard, not just its text
 * - Only matches ACTUAL typeof expressions, not strings containing "typeof"
 */
export function checkNoUnsafeCasts(getCFG?: (filePath: string) => BasicBlock[] | null): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isAsExpression(node)) return null;
    if (node.type.kind === ts.SyntaxKind.UnknownKeyword) return null;
    let hasValidation = false;

    // Method 1: CFG-based guard detection — use CFG to find preceding statements,
    // then check each statement AST for type guards
    // NOTE: CFG path sensitivity is a known limitation — the CFG gives basic-block
    // reachability but does not model branch conditions (e.g., if/else paths).
    // This can produce false negatives when a type guard exists on one branch but
    // the cast is on another. Proper fix requires path-sensitive data-flow analysis.
    if (getCFG) {
      const cfg = getCFG(sourceFile.fileName);
      if (cfg && cfg.length > 0) {
        const nodeStart = node.getStart(sourceFile);
        outer: for (const block of cfg) {
          for (const stmt of block.statements) {
            if (stmt.getEnd() > nodeStart) continue;
            if (statementHasTypeGuard(stmt)) {
              hasValidation = true;
              break outer;
            }
          }
        }
      }
    }

    // Method 2: Check parent IfStatement condition for type guards
    if (!hasValidation) {
      const parentIf = findParentKind(node, ts.SyntaxKind.IfStatement);
      if (parentIf && ts.isIfStatement(parentIf)) {
        if (expressionHasTypeGuard(parentIf.expression)) {
          hasValidation = true;
        }
      }
    }

    // Method 3: Check preceding statements in the same block
    if (!hasValidation) {
      const parentBlock = findParentKind(node, ts.SyntaxKind.Block);
      if (parentBlock && ts.isBlock(parentBlock)) {
        const nodeStart = node.getStart(sourceFile);
        for (const stmt of parentBlock.statements) {
          if (stmt.getEnd() > nodeStart) break;
          if (statementHasTypeGuard(stmt)) {
            hasValidation = true;
            break;
          }
        }
      }
    }

    if (!hasValidation) {
      const pos = getNodePosition(node, sourceFile);
      return {
        rule: 'no-unsafe-cast',
        severity: 'error',
        file: sourceFile.fileName,
        line: pos.line,
        column: pos.column,
        message: `[P2] Unchecked cast to '${node.type.getText(sourceFile)}'`,
        nodeKind: 'AsExpression',
        sourceSnippet: getNodeSnippet(node, sourceFile),
      };
    }
    return null;
  };
}

/**
 * Check if a statement contains a type guard.
 * Uses AST predicates — NO regex, NO getText().
 *
 * Detects:
 * 1. if (typeof x === 'string') — via ts.isTypeOfExpression()
 * 2. if (x instanceof Foo) — via InstanceOfKeyword
 * 3. isRecord(x) / isString(x) — via call expression identifier name
 * 4. z.parse() / z.safeParse() — via property access expression
 */
function statementHasTypeGuard(stmt: ts.Statement): boolean {
  let found = false;

  function visit(n: ts.Node): void {
    if (found) return;

    // Don't walk into nested function bodies — a typeof in a function def
    // is NOT a guard for code outside that function
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)) return;

    // typeof x === 'string'
    if (ts.isBinaryExpression(n)) {
      if (ts.isTypeOfExpression(n.left) || ts.isTypeOfExpression(n.right)) {
        found = true;
        return;
      }
      // x instanceof Foo
      if (n.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) {
        found = true;
        return;
      }
    }

    // isRecord(x), isString(x), etc. — type guard function calls
    if (ts.isCallExpression(n)) {
      const expr = n.expression;
      // Direct identifier call: isRecord(x)
      if (ts.isIdentifier(expr)) {
        const name = expr.text;
        // Type guard naming convention: isXxx()
        if (name.length >= 3 && name[0] === 'i' && name[1] === 's' && name.charCodeAt(2) >= 65 && name.charCodeAt(2) <= 90) {
          found = true;
          return;
        }
        // Known parser: z.parse, z.safeParse handled below
      }
      // Method call: z.parse(x), z.safeParse(x)
      if (ts.isPropertyAccessExpression(expr)) {
        const objExpr = expr.expression;
        const methodName = expr.name.text;
        if (ts.isIdentifier(objExpr) && objExpr.text === 'z' &&
            (methodName === 'parse' || methodName === 'safeParse')) {
          found = true;
          return;
        }
      }
    }

    ts.forEachChild(n, visit);
  }

  visit(stmt);
  return found;
}

/**
 * Check if an expression contains a type guard.
 * Same logic as statementHasTypeGuard but for expressions (if conditions).
 */
function expressionHasTypeGuard(expr: ts.Expression): boolean {
  let found = false;

  function visit(n: ts.Node): void {
    if (found) return;

    if (ts.isBinaryExpression(n)) {
      if (ts.isTypeOfExpression(n.left) || ts.isTypeOfExpression(n.right)) {
        found = true;
        return;
      }
      if (n.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) {
        found = true;
        return;
      }
    }

    if (ts.isCallExpression(n)) {
      const callExpr = n.expression;
      if (ts.isIdentifier(callExpr)) {
        const ceName = callExpr.text;
        if (ceName.length >= 3 && ceName[0] === 'i' && ceName[1] === 's' && ceName.charCodeAt(2) >= 65 && ceName.charCodeAt(2) <= 90) {
          found = true;
          return;
        }
      }
      if (ts.isPropertyAccessExpression(callExpr)) {
        const obj = callExpr.expression;
        const method = callExpr.name.text;
        if (ts.isIdentifier(obj) && obj.text === 'z' &&
            (method === 'parse' || method === 'safeParse')) {
          found = true;
          return;
        }
      }
    }

    ts.forEachChild(n, visit);
  }

  visit(expr);
  return found;
}
