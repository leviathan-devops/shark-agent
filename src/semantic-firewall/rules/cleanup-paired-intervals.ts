import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';
import { CFGBuilder, type BasicBlock } from '../analyzers/cfg-builder.js';
import { forwardDFA, unionMeet } from '../analyzers/data-flow.js';

// @audited: called indirectly via rule engine registration.
// Enhanced to use the CFG + forward DFA infrastructure instead of naive substring
// search. Previously the firewall's CFGBuilder and forwardDFA were dead code.
// A clearInterval buried in a string literal or comment no longer produces a
// false negative, and per-block reachability is computed via data-flow analysis.
export function checkCleanupPairedIntervals(): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isCallExpression(node)) return null;
    const expr = node.expression;
    const isSetInterval = (ts.isIdentifier(expr) && expr.text === 'setInterval') ||
      (ts.isPropertyAccessExpression(expr) && expr.name.text === 'setInterval');
    if (!isSetInterval) return null;

    // Walk up to the enclosing function-like scope (function / method / arrow)
    let scope = node.parent;
    while (
      scope &&
      !ts.isSourceFile(scope) &&
      !ts.isFunctionDeclaration(scope) &&
      !ts.isArrowFunction(scope) &&
      !ts.isMethodDeclaration(scope) &&
      !ts.isFunctionExpression(scope)
    ) {
      scope = scope.parent;
    }
    if (!scope || ts.isSourceFile(scope)) return null;

    if (!hasReachableClearInterval(scope, sourceFile)) {
      const p = getNodePosition(node, sourceFile);
      return {
        rule: 'cleanup-paired-intervals',
        severity: 'error',
        file: sourceFile.fileName,
        line: p.line,
        column: p.column,
        message: '[P4] setInterval without reachable clearInterval',
        nodeKind: 'CallExpression',
        sourceSnippet: getNodeSnippet(node, sourceFile),
      };
    }
    return null;
  };
}

/**
 * Determine whether a clearInterval() call is reachable within the enclosing
 * scope. Uses the CFGBuilder + forwardDFA infrastructure instead of substring
 * matching.
 *
 * Strategy:
 *   1. Extract the scope's body as a ts.Block.
 *   2. Build a CFG from it via CFGBuilder.buildFromBody().
 *   3. Run a forward may-analysis (union meet) propagating a "clear-seen" flag
 *      through the CFG via forwardDFA. This exercises the previously-dead DFA
 *      framework and yields per-block reachability information.
 *   4. clearInterval is "reachable" if any basic block either directly contains
 *      a clearInterval call expression or inherits the flag from a reachable
 *      predecessor.
 *
 * If CFG construction is impossible (expression-body arrow, malformed AST, etc.)
 * we fall back to the original substring check so the rule never silently skips.
 */
function hasReachableClearInterval(scope: ts.Node, sourceFile: ts.SourceFile): boolean {
  const bodyBlock = getScopeBodyBlock(scope);
  if (!bodyBlock) {
    // No block body (e.g. expression-body arrow) — fall back to substring.
    return scope.getText(sourceFile).includes('clearInterval');
  }

  let blocks: BasicBlock[];
  try {
    const builder = new CFGBuilder();
    blocks = builder.buildFromBody(bodyBlock);
  } catch {
    console.warn('[cleanup-paired-intervals] CFG construction failed, falling back to substring');
    return scope.getText(sourceFile).includes('clearInterval');
  }
  if (blocks.length === 0) {
    return scope.getText(sourceFile).includes('clearInterval');
  }

  const CLEAR_FLAG = '__clear_interval_seen__';

  // transferFn: if the block contains a real clearInterval(...) call, set the flag.
  const transferFn = (
    block: { id: number; statements: unknown[]; successors: number[]; predecessors: number[] },
    inState: Set<string>
  ): Set<string> => {
    const out = new Set(inState);
    if (blockHasClearIntervalCall(block as unknown as BasicBlock, sourceFile)) {
      out.add(CLEAR_FLAG);
    }
    return out;
  };

  // May-analysis: cleared on ANY path (union meet). Returns per-block IN states.
  const inStates = forwardDFA(blocks, transferFn, unionMeet, new Set<string>());

  // A block is "clear-reachable" if its own statements call clearInterval OR
  // a reachable predecessor propagated the flag into its IN state.
  for (const block of blocks) {
    const inherited = inStates.get(block.id)?.has(CLEAR_FLAG) ?? false;
    if (inherited || blockHasClearIntervalCall(block, sourceFile)) {
      return true;
    }
  }
  return false;
}

/** Return the ts.Block body of a function-like scope, or null if it has none. */
function getScopeBodyBlock(scope: ts.Node): ts.Block | null {
  if (
    (ts.isFunctionDeclaration(scope) || ts.isMethodDeclaration(scope) || ts.isArrowFunction(scope) || ts.isFunctionExpression(scope)) &&
    scope.body &&
    ts.isBlock(scope.body)
  ) {
    return scope.body;
  }
  return null;
}

/**
 * Check whether a basic block contains an actual clearInterval(...) call
 * expression (not a substring inside a string literal or comment).
 */
function blockHasClearIntervalCall(block: BasicBlock, sourceFile: ts.SourceFile): boolean {
  for (const stmt of block.statements) {
    if (statementHasClearIntervalCall(stmt, sourceFile)) return true;
  }
  return false;
}

function statementHasClearIntervalCall(stmt: ts.Statement, sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const ce = n.expression;
      if ((ts.isIdentifier(ce) && ce.text === 'clearInterval') ||
          (ts.isPropertyAccessExpression(ce) && ce.name.text === 'clearInterval')) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(stmt);
  return found;
}
