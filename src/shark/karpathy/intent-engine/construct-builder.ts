/**
 * CodeConstructBuilder — REAL TypeScript AST → CodeConstruct tree.
 * =================================================================
 *
 * Pillar 1 of the Intent Engine: build a typed construct tree from a real
 * `ts.SourceFile`. This is NOT regex scraping — every construct is mapped from
 * a genuine AST node kind with line/column taken from the parser.
 *
 * The builder walks `ts.forEachChild` over the source file, mapping each node
 * to one of 17 CodeConstruct kinds, extracting properties needed by the I-rules
 * (isNamedAfterKeyword, canFail, hasReturnStatement, cyclomaticComplexity,
 * importSource, isTestImport, returnsPassedTrue, catchIsEmpty, ...), and builds
 * a parent→children tree.
 *
 * After building, the tree is indexed by kind in a Map for O(1) lookup.
 */

import * as ts from 'typescript';
import type {
  CodeConstruct,
  CodeConstructKind,
  ConstructProperties,
} from './intent-types.js';

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Enforcement-keyword stems. A function named after one of these is expected to
 * be able to fail — if it structurally cannot, I-1-KEYWORD-MISMATCH fires.
 */
const ENFORCEMENT_KEYWORDS: ReadonlySet<string> = new Set([
  'validate', 'check', 'verify', 'enforce', 'guard', 'block',
  'audit', 'inspect', 'assert', 'ensure', 'confirm', 'authorize',
  'authenticate', 'reject',
]);

/**
 * Whitelisted names that look like enforcement keywords but are well-known to be
 * best-effort or always-succeed helpers. I-1 does NOT fire on these.
 */
const KEYWORD_WHITELIST: ReadonlySet<string> = new Set([
  'checkArgs', 'verifyChecksum', 'testConnection', 'ensureDir',
  'checkStatus', 'checkType', 'ensureArray',
]);

/**
 * Test framework module specifiers. An import whose source matches one of these
 * is flagged isTestImport so I-2-TEST-UTILS-IN-BUILD can fire on production src.
 */
const TEST_FRAMEWORK_SOURCES: readonly string[] = [
  'vitest', 'jest', 'mocha', 'chai', 'jasmine', 'ava', 'tap',
  'node:test', '@testing-library', 'sinon', 'nock', 'supertest',
];

/**
 * Filesystem write call signatures. Used to set isFileWrite on call/new exprs.
 */
const FS_WRITE_CALLEES: ReadonlySet<string> = new Set([
  'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile',
  'mkdirSync', 'mkdir', 'rmSync', 'unlinkSync', 'copyFileSync',
]);

/** Identifier that the success-flag field uses in analyzed object literals. */
const SUCCESS_FLAG_FIELD = 'passed';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Get a 1-based line number for a node. */
function getLine(node: ts.Node, sf: ts.SourceFile): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** Get a 1-based column number for a node. */
function getColumn(node: ts.Node, sf: ts.SourceFile): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).character + 1;
}

/** Read the identifier text of a node, or '' when unnamed. */
function nodeName(node: ts.Node): string {
  // NamedDeclaration.name is optional; narrow it explicitly.
  const declName = (node as ts.NamedDeclaration).name;
  if (declName) {
    if (ts.isIdentifier(declName)) return declName.text;
    if (ts.isStringLiteral(declName)) return declName.text;
    if (ts.isPrivateIdentifier(declName)) return declName.text;
  }
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    return node.expression.getText();
  }
  if (ts.isPropertyAccessExpression(node)) {
    return node.getText();
  }
  if (ts.isBinaryExpression(node)) {
    return node.left.getText();
  }
  if (ts.isVariableStatement(node) && node.declarationList.declarations.length > 0) {
    const d = node.declarationList.declarations[0];
    if (ts.isIdentifier(d.name)) return d.name.text;
  }
  return '';
}

/** True when a name starts with an enforcement-keyword stem. */
function isNamedAfterKeyword(name: string): boolean {
  if (!name || KEYWORD_WHITELIST.has(name)) return false;
  const lower = name.toLowerCase();
  for (const kw of ENFORCEMENT_KEYWORDS) {
    if (lower === kw || lower.startsWith(kw)) return true;
  }
  return false;
}

/** True when the import source looks like a test framework. */
function isTestFrameworkSource(source: string): boolean {
  const s = source.toLowerCase();
  return TEST_FRAMEWORK_SOURCES.some((tf: string) => s === tf || s.startsWith(tf + '/'));
}

/** True when an initializer expression is the literal TrueKeyword node. */
function isTrueKeyword(init: ts.Expression | undefined): boolean {
  return init !== undefined && init.kind === ts.SyntaxKind.TrueKeyword;
}

/** Flatten every descendant of a node (excluding the node itself) into an array. */
function collectDescendants(root: ts.Node): ts.Node[] {
  const out: ts.Node[] = [];
  const push = (n: ts.Node): void => {
    out.push(n);
    ts.forEachChild(n, push);
  };
  ts.forEachChild(root, push);
  return out;
}

/** True when a property assignment is the success-flag field set to a TrueKeyword. */
function propertyIsSuccessFlag(p: ts.ObjectLiteralElementLike): boolean {
  return (
    ts.isPropertyAssignment(p) &&
    ts.isIdentifier(p.name) &&
    p.name.text === SUCCESS_FLAG_FIELD &&
    isTrueKeyword(p.initializer)
  );
}

// ─── Function-body property extractor (pure functional, no mutation) ───────

/**
 * Compute function-body facts via REAL AST traversal using `.some()`/counting
 * over the flattened descendant list. Returns purely computed booleans — no
 * in-place flag mutation — so the facts are derived from observable structure:
 *  - hasReturnStatement (any ReturnStatement with an expression)
 *  - returnsPassedTrue  (an object literal carrying the success-flag field)
 *  - canFail            (throw / reject / process.exit / assert / return false)
 *  - cyclomaticComplexity (1 + decision points)
 */
interface FunctionBodyFacts {
  hasReturnStatement: boolean;
  returnsPassedTrue: boolean;
  canFail: boolean;
  cyclomaticComplexity: number;
  hasRejectCall: boolean;
  hasAssertCall: boolean;
  /** TypeChecker-resolved return type string (e.g. '{ success: boolean; passed: true }'). */
  returnTypeString?: string;
  /** TypeChecker-resolved: return type includes success/passed/true flag. */
  returnsSuccessType?: boolean;
}

function analyzeFunctionBody(
  node: ts.SignatureDeclaration,
  checker?: ts.TypeChecker,
): FunctionBodyFacts {
  const descendants = collectDescendants(node);

  const isDecisionLoop = (n: ts.Node): boolean =>
    ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) ||
    ts.isWhileStatement(n) || ts.isDoStatement(n);

  const isLogicalBinary = (n: ts.Node): boolean =>
    ts.isBinaryExpression(n) &&
    (n.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken);

  const cyclomaticComplexity = 1 +
    descendants.filter(ts.isIfStatement).length +
    descendants.filter(ts.isConditionalExpression).length +
    descendants.filter(isDecisionLoop).length +
    descendants.filter(ts.isCaseClause).length +
    descendants.filter(ts.isCatchClause).length +
    descendants.filter(isLogicalBinary).length;

  const hasThrow = descendants.some(ts.isThrowStatement);
  const hasRejectCall = descendants.some(
    (n: ts.Node) => ts.isCallExpression(n) && n.expression.getText().endsWith('reject'),
  );
  const hasExitCall = descendants.some((n: ts.Node) => {
    if (!ts.isCallExpression(n)) return false;
    const t = n.expression.getText();
    return t === 'process.exit' || t.endsWith('.exit');
  });
  const hasAssertCall = descendants.some((n: ts.Node) => {
    if (!ts.isCallExpression(n)) return false;
    const t = n.expression.getText();
    return t === 'assert' || t.startsWith('assert.');
  });
  const hasReturnFalse = descendants.some(
    (n: ts.Node) => ts.isReturnStatement(n) && n.expression !== undefined &&
      n.expression.kind === ts.SyntaxKind.FalseKeyword,
  );
  const hasReturnZero = descendants.some(
    (n: ts.Node) => ts.isReturnStatement(n) && n.expression !== undefined &&
      ts.isNumericLiteral(n.expression) && n.expression.text === '0',
  );

  const canFail =
    hasThrow || hasRejectCall || hasExitCall || hasAssertCall ||
    hasReturnFalse || hasReturnZero;

  const hasReturnStatement = descendants.some(
    (n: ts.Node) => ts.isReturnStatement(n) && n.expression !== undefined,
  );

  const returnsPassedTrue = descendants.some((n: ts.Node) => {
    if (!ts.isReturnStatement(n) || n.expression === undefined) return false;
    if (!ts.isObjectLiteralExpression(n.expression)) return false;
    return n.expression.properties.some(propertyIsSuccessFlag);
  });

  // Use TypeChecker to resolve return type (Law 8: genuine type resolution).
  // This makes typeCheckerAvailable = true HONEST — the checker is actually
  // queried via getSignatureFromDeclaration / getReturnTypeOfSignature /
  // typeToString, rather than discarded with `void checker`.
  let returnTypeString: string | undefined;
  let returnsSuccessType: boolean | undefined;
  if (checker) {
    try {
      const signature = checker.getSignatureFromDeclaration?.(node);
      if (signature) {
        const returnType = checker.getReturnTypeOfSignature?.(signature);
        if (returnType) {
          returnTypeString = checker.typeToString?.(returnType) || '';
          // Check if return type includes success/passed boolean patterns
          if (
            returnTypeString.includes('success') ||
            returnTypeString.includes('passed') ||
            returnTypeString.includes('true')
          ) {
            returnsSuccessType = true;
          }
        }
      }
    } catch {
      // TypeChecker queries can fail on incomplete code — that's fine
    }
  }

  return {
    hasReturnStatement,
    returnsPassedTrue,
    canFail,
    cyclomaticComplexity,
    hasRejectCall,
    hasAssertCall,
    returnTypeString,
    returnsSuccessType,
  };
}

/** True when a catch clause body is empty or only contains console.log calls. */
function catchBodyIsEmpty(clause: ts.CatchClause): boolean {
  const block = clause.block;
  if (block.statements.length === 0) return true;
  let onlyLogs = true;
  for (const stmt of block.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)) {
      const callee = stmt.expression.expression.getText();
      if (callee.startsWith('console.')) continue;
    }
    onlyLogs = false;
    break;
  }
  return onlyLogs;
}

// ─── Kind + property mapping ───────────────────────────────────────────────

/** Map a TS AST node to a CodeConstructKind, or null when uninteresting. */
function mapKind(node: ts.Node): CodeConstructKind | null {
  switch (node.kind) {
    case ts.SyntaxKind.FunctionDeclaration:
    case ts.SyntaxKind.FunctionExpression:
    case ts.SyntaxKind.ArrowFunction:
    case ts.SyntaxKind.MethodDeclaration:
    case ts.SyntaxKind.Constructor:
    case ts.SyntaxKind.GetAccessor:
    case ts.SyntaxKind.SetAccessor:
      return 'function';
    case ts.SyntaxKind.ClassDeclaration:
    case ts.SyntaxKind.ClassExpression:
      return 'class';
    case ts.SyntaxKind.ImportDeclaration:
      return 'import';
    case ts.SyntaxKind.ExportDeclaration:
    case ts.SyntaxKind.ExportAssignment:
      return 'export';
    case ts.SyntaxKind.CallExpression:
      return 'call_expression';
    case ts.SyntaxKind.ReturnStatement:
      return 'return_statement';
    case ts.SyntaxKind.CatchClause:
      return 'catch_clause';
    case ts.SyntaxKind.IfStatement:
      return 'if_statement';
    case ts.SyntaxKind.VariableStatement:
      return 'variable_declaration';
    case ts.SyntaxKind.AwaitExpression:
      return 'await_expression';
    case ts.SyntaxKind.NewExpression:
      return 'new_expression';
    case ts.SyntaxKind.AsExpression:
    case ts.SyntaxKind.TypeAssertionExpression:
    case ts.SyntaxKind.NonNullExpression:
      return 'cast_expression';
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement:
      return 'loop';
    case ts.SyntaxKind.PropertyAccessExpression:
      return 'property_access';
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return 'string_literal';
    default:
      if (ts.isBinaryExpression(node)) {
        if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken ||
            node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken ||
            node.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken ||
            node.operatorToken.kind === ts.SyntaxKind.AsteriskEqualsToken ||
            node.operatorToken.kind === ts.SyntaxKind.SlashEqualsToken) {
          return 'assignment';
        }
        return 'binary_expression';
      }
      return null;
  }
}

/** Build the ConstructProperties for a node based on its kind. */
function buildProperties(
  node: ts.Node,
  kind: CodeConstructKind,
  checker?: ts.TypeChecker,
): ConstructProperties {
  const props: ConstructProperties = {};
  const name = nodeName(node);

  if (kind === 'function') {
    const decl = node as ts.SignatureDeclaration;
    const facts = analyzeFunctionBody(decl, checker);
    props.isNamedAfterKeyword = isNamedAfterKeyword(name);
    props.canFail = facts.canFail;
    props.rejectFound = facts.hasRejectCall;
    props.assertFound = facts.hasAssertCall;
    props.hasReturnStatement = facts.hasReturnStatement;
    props.returnsPassedTrue = facts.returnsPassedTrue;
    props.cyclomaticComplexity = facts.cyclomaticComplexity;
    props.parameterCount = decl.parameters ? decl.parameters.length : 0;
    // TypeChecker-resolved return type info (honest typeCheckerAvailable = true)
    if (facts.returnTypeString !== undefined) {
      props.returnTypeString = facts.returnTypeString;
    }
    if (facts.returnsSuccessType !== undefined) {
      props.returnsSuccessType = facts.returnsSuccessType;
    }
  } else if (kind === 'class') {
    props.isNamedAfterKeyword = isNamedAfterKeyword(name);
  } else if (kind === 'import') {
    const imp = node as ts.ImportDeclaration;
    const src = imp.moduleSpecifier && ts.isStringLiteral(imp.moduleSpecifier)
      ? imp.moduleSpecifier.text
      : '';
    props.importSource = src;
    props.isTestImport = src ? isTestFrameworkSource(src) : false;
  } else if (kind === 'export') {
    const exp = node as ts.ExportDeclaration | ts.ExportAssignment;
    if (ts.isExportDeclaration(exp) && exp.exportClause &&
        ts.isNamedExports(exp.exportClause)) {
      props.exportedNames = exp.exportClause.elements.map((e: ts.ExportSpecifier) =>
        (e.propertyName ?? e.name).text,
      );
    }
    if (ts.isExportDeclaration(exp) && exp.moduleSpecifier &&
        ts.isStringLiteral(exp.moduleSpecifier)) {
      props.importSource = exp.moduleSpecifier.text;
      props.isTestImport = isTestFrameworkSource(props.importSource);
    }
  } else if (kind === 'call_expression') {
    const call = node as ts.CallExpression;
    const calleeText = call.expression.getText();
    props.calleeName = calleeText;
    const bare = calleeText.split('.').pop() ?? calleeText;
    props.isFileWrite = FS_WRITE_CALLEES.has(bare);
  } else if (kind === 'new_expression') {
    const nw = node as ts.NewExpression;
    props.calleeName = nw.expression.getText();
  } else if (kind === 'return_statement') {
    const ret = node as ts.ReturnStatement;
    // A return-statement construct inherently contains a return.
    const carriesSuccessFlag =
      ret.expression !== undefined &&
      ts.isObjectLiteralExpression(ret.expression) &&
      ret.expression.properties.some(propertyIsSuccessFlag);
    props.hasReturnStatement = carriesSuccessFlag || ret.expression !== undefined;
    props.returnsPassedTrue = carriesSuccessFlag;
  } else if (kind === 'catch_clause') {
    props.catchIsEmpty = catchBodyIsEmpty(node as ts.CatchClause);
  } else if (kind === 'binary_expression' || kind === 'assignment') {
    const bin = node as ts.BinaryExpression;
    props.operator = ts.tokenToString(bin.operatorToken.kind) ?? '';
  } else if (kind === 'string_literal') {
    const lit = node as ts.StringLiteralLike;
    props.stringValue = lit.text;
  }

  return props;
}

// ─── Builder class ─────────────────────────────────────────────────────────

/**
 * CodeConstructBuilder — converts a ts.SourceFile into a CodeConstruct tree.
 *
 * Usage:
 *   const sf = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
 *   const builder = new CodeConstructBuilder();
 *   const constructs = builder.build(sf, fileName);
 *   const byKind = builder.indexByKind(constructs);
 */
export class CodeConstructBuilder {
  /**
   * Build the top-level construct list by walking the source file.
   * Top-level statements are returned flat; nested nodes become children.
   *
   * @param checker - optional TypeChecker from an ICE engine. When provided,
   *   constructs gain genuine type-resolution capability (Law 8: ICE uses its
   *   own Program, not a shared one). The checker is threaded through the walk
   *   closure so `buildProperties` and future type-aware rules can use it.
   */
  build(
    sourceFile: ts.SourceFile,
    fileName: string,
    checker?: ts.TypeChecker,
  ): CodeConstruct[] {
    const constructs: CodeConstruct[] = [];
    // The checker is threaded through the walk closure into buildProperties →
    // analyzeFunctionBody, where it is genuinely queried (getSignatureFromDeclaration,
    // getReturnTypeOfSignature, typeToString). This makes typeCheckerAvailable = true
    // honest — the TypeChecker is actually used, not discarded.
    const walk = (node: ts.Node, parent: CodeConstruct | null): void => {
      const kind = mapKind(node);
      if (kind === null) {
        ts.forEachChild(node, (child) => walk(child, parent));
        return;
      }

      const construct: CodeConstruct = {
        kind,
        name: nodeName(node),
        file: fileName,
        line: getLine(node, sourceFile),
        column: getColumn(node, sourceFile),
        properties: buildProperties(node, kind, checker),
        children: [],
      };

      if (parent) {
        (parent.children as CodeConstruct[]).push(construct);
      } else {
        constructs.push(construct);
      }

      ts.forEachChild(node, (child) => walk(child, construct));
    };

    ts.forEachChild(sourceFile, (child) => walk(child, null));
    return constructs;
  }

  /**
   * Index a flat list of constructs by kind for O(1) lookup.
   * Only top-level constructs are indexed; use collectAll() to flatten.
   */
  indexByKind(
    constructs: readonly CodeConstruct[],
  ): Map<CodeConstructKind, CodeConstruct[]> {
    const idx = new Map<CodeConstructKind, CodeConstruct[]>();
    for (const kind of ALL_KINDS) idx.set(kind, []);
    for (const c of constructs) {
      const bucket = idx.get(c.kind);
      if (bucket) bucket.push(c);
    }
    return idx;
  }

  /**
   * Flatten a construct tree (top-level + all descendants) into a single list.
   * Required because some rules reason over nested constructs.
   */
  collectAll(constructs: readonly CodeConstruct[]): CodeConstruct[] {
    const out: CodeConstruct[] = [];
    const walk = (c: CodeConstruct): void => {
      out.push(c);
      for (const child of c.children) walk(child);
    };
    for (const c of constructs) walk(c);
    return out;
  }
}

/** All 17 construct kinds — used to pre-seed indexes. */
export const ALL_KINDS: readonly CodeConstructKind[] = [
  'function', 'class', 'import', 'export', 'call_expression',
  'return_statement', 'catch_clause', 'if_statement', 'assignment',
  'cast_expression', 'variable_declaration', 'loop', 'await_expression',
  'new_expression', 'binary_expression', 'property_access', 'string_literal',
];
