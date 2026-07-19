/**
 * S2 — Fake Test Detection (AST-based).
 *
 * Question: "Does this test actually exercise the system under test, or does
 * it just assert hardcoded truth?"
 *
 * Only analyzes *.test.ts / *.spec.ts files.
 *
 * Three signals (ANY ONE triggers a finding):
 *   SIGNAL 1: expect() called with a HARDCODED LITERAL argument.
 *             expect(true).toBe(true) — cannot fail regardless of SUT.
 *   SIGNAL 2: The System Under Test (SUT) is imported but never referenced
 *             anywhere in the test file.
 *   SIGNAL 3: An expect() inside a test function does not reference any SUT
 *             binding in its argument expression.
 *
 * SUT detection: every import whose source path is relative (starts with '.')
 * and is NOT a test-util / node_modules / __mocks__ path.
 */

import * as ts from 'typescript';
import type {
  HonestyRule,
  SREFinding,
} from './honesty-types.js';

/** File patterns that mark a file as a test file (the only files S2 analyzes). */
const TEST_FILE_PATTERNS = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /\.test\.tsx$/,
  /\.spec\.tsx$/,
];

/** Call names that are assertion entry points. */
const EXPECT_NAMES = new Set(['expect']);

/** Call names that delimit a test function body. */
const TEST_WRAPPER_NAMES = new Set(['it', 'test', 'describe']);

/**
 * Collect SUT bindings from the test file's imports.
 * Returns a map of localName -> modulePath for relative, non-test-util imports.
 */
function collectSUTBindings(
  sourceFile: ts.SourceFile
): Map<string, string> {
  const bindings = new Map<string, string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const mod = node.moduleSpecifier.text;
      // SUT = relative import that is NOT a test util / node_modules / mock.
      const isSUT =
        mod.startsWith('.') &&
        !mod.includes('node_modules') &&
        !/test-util|test-helper|__mocks__|__fixtures__/.test(mod);
      if (isSUT && node.importClause) {
        const collect = (n: ts.Node): void => {
          if (ts.isImportSpecifier(n) && n.name) {
            bindings.set(n.name.text, mod);
          } else if (ts.isNamespaceImport(n) && n.name) {
            bindings.set(n.name.text, mod);
          }
          ts.forEachChild(n, collect);
        };
        collect(node.importClause);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

/**
 * Is any of the given identifier names used anywhere in the file, EXCLUDING
 * the import binding declaration site itself?
 */
function anyIdentifierUsed(
  sourceFile: ts.SourceFile,
  names: string[]
): boolean {
  let used = false;
  const nameSet = new Set(names);
  const visit = (node: ts.Node): void => {
    if (used) return;
    if (ts.isIdentifier(node) && nameSet.has(node.text)) {
      // Exclude the import binding declaration site itself.
      if (
        !ts.isImportSpecifier(node.parent) &&
        !ts.isNamespaceImport(node.parent)
      ) {
        used = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return used;
}

/** Is a node a hardcoded literal (boolean/numeric/string/literal expression)? */
function isHardcodedLiteral(node: ts.Node | undefined): boolean {
  if (!node) return false;
  return (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isNumericLiteral(node) ||
    ts.isStringLiteral(node) ||
    ts.isLiteralExpression(node) ||
    // Null/undefined literals also count as hardcoded.
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.UndefinedKeyword
  );
}

/** Does the expression reference any SUT binding identifier? */
function referencesSUT(
  node: ts.Node,
  sutBindings: Map<string, string>
): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n) && sutBindings.has(n.text)) found = true;
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** Is the node inside an it()/test()/describe() wrapper call? */
function isInsideTestFunction(node: ts.Node): boolean {
  let parent: ts.Node | undefined = node.parent;
  while (parent) {
    if (ts.isCallExpression(parent)) {
      const callee = parent.expression;
      if (
        ts.isIdentifier(callee) &&
        TEST_WRAPPER_NAMES.has(callee.text)
      ) {
        return true;
      }
    }
    parent = parent.parent;
  }
  return false;
}

/**
 * Walk expect() calls and emit SIGNAL 1 / SIGNAL 3 findings.
 */
function scanExpectCalls(
  sourceFile: ts.SourceFile,
  sutBindings: Map<string, string>
): SREFinding[] {
  const findings: SREFinding[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      EXPECT_NAMES.has(node.expression.text)
    ) {
      const arg = node.arguments[0];
      const line =
        ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile))
          .line + 1;
      const argText = arg ? arg.getText(sourceFile) : '';

      // -- SIGNAL 1: hardcoded literal argument --
      if (isHardcodedLiteral(arg)) {
        findings.push({
          ruleId: 'S2',
          severity: 'HIGH',
          message:
            `expect() called with a hardcoded literal (${argText}) at line ${line}. ` +
            `This assertion cannot fail regardless of the system under test. ` +
            `Replace the literal with a value derived from the SUT.`,
          file: sourceFile.fileName,
          line,
          category: 'fake_test',
          evidenceChain: [
            {
              claim: 'expect() argument is a literal',
              verified: true,
              snippet: argText,
            },
            {
              claim: 'expect() argument depends on SUT output',
              verified: false,
            },
          ],
          remediation:
            `Replace expect(${argText}) with expect(sutFunction(...)) where ` +
            `the argument is the actual return value of the code under test.`,
          falsePositiveGuards: [
            'Verified node is an expect() call',
            'Verified argument is a BooleanLiteral/NumericLiteral/StringLiteral (not an identifier/call)',
          ],
        });
      }

      // -- SIGNAL 3: argument does not reference any SUT binding --
      //   Only fires when SUT bindings exist AND the expect is inside a test
      //   function (avoid flagging top-level setup helpers).
      if (
        arg &&
        !isHardcodedLiteral(arg) &&
        sutBindings.size > 0 &&
        !referencesSUT(arg, sutBindings) &&
        isInsideTestFunction(node)
      ) {
        findings.push({
          ruleId: 'S2',
          severity: 'MEDIUM',
          message:
            `expect() argument at line ${line} does not reference any SUT ` +
            `binding. The assertion (${argText}) is computed without ` +
            `invoking the code under test, so it cannot detect regressions ` +
            `in the SUT.`,
          file: sourceFile.fileName,
          line,
          category: 'fake_test',
          evidenceChain: [
            {
              claim: 'expect() is inside a test function',
              verified: true,
            },
            {
              claim: 'expect() argument references a SUT binding',
              verified: false,
              snippet: argText,
            },
          ],
          remediation:
            `Derive the expect() argument from a call to the SUT. ` +
            `Example: expect(sut.process(input)).toBe(expected).`,
          falsePositiveGuards: [
            'Verified expect() is inside an it()/test() block',
            'Verified SUT bindings exist in file',
            'Verified no sub-expression of the argument references a SUT binding',
          ],
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

/**
 * S2 rule object.
 */
export const s2FakeTest: HonestyRule = {
  id: 'S2',
  description:
    'Tests must exercise the system under test, not assert hardcoded truth',
  category: 'fake_test',
  defaultSeverity: 'HIGH',

  check: (_constructs, _checker, sourceFile) => {
    const findings: SREFinding[] = [];

    // -- File-type guard: only analyze test files --
    if (!TEST_FILE_PATTERNS.some((p: RegExp) => p.test(sourceFile.fileName))) {
      return findings; // not a test file — nothing to check
    }

    // -- Identify the SUT imports --
    const sutBindings = collectSUTBindings(sourceFile);

    // -- SIGNAL 2: SUT imported but never referenced --
    if (sutBindings.size > 0) {
      const sutReferenced = anyIdentifierUsed(
        sourceFile,
        Array.from(sutBindings.keys())
      );
      if (!sutReferenced) {
        findings.push({
          ruleId: 'S2',
          severity: 'HIGH',
          message:
            `Test file imports ${sutBindings.size} SUT binding(s) ` +
            `(${Array.from(sutBindings.keys()).slice(0, 3).join(', ')}) but ` +
            `never references any of them in a test body. The test is ` +
            `disconnected from the code it claims to test.`,
          file: sourceFile.fileName,
          line: 1,
          category: 'fake_test',
          evidenceChain: [
            { claim: 'File matches test pattern', verified: true },
            { claim: 'File imports at least one SUT binding', verified: true },
            {
              claim: 'At least one SUT binding is referenced in a test body',
              verified: false,
            },
          ],
          remediation:
            `Reference the imported SUT in a test: call its functions and ` +
            `assert on the return value. Remove the import if the test is ` +
            `not meant to cover it.`,
          falsePositiveGuards: [
            'Verified file is a test file (*.test.ts / *.spec.ts)',
            'Verified import source is relative (not node_modules / test-util)',
            'Verified no SUT binding identifier appears outside the import declaration',
          ],
        });
      }
    }

    // -- SIGNAL 1 & 3: walk expect() calls --
    findings.push(...scanExpectCalls(sourceFile, sutBindings));

    return findings;
  },
};
