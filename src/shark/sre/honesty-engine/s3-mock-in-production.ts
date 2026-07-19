/**
 * S3 — Mock/Stub Detection in Production Code (AST-based).
 *
 * Question: "Does this production source substitute a mock for a real
 * implementation?"
 *
 * Detects jest.fn(), vi.fn(), sinon.stub(), and chained mock configuration
 * methods (.mockReturnValue(), .mockImplementation(), etc.) in NON-TEST
 * files.
 *
 * CRITICAL FALSE-POSITIVE GUARD — S3 SKIPS test files entirely. Mocks are
 * legitimate and necessary in test code. Flagging jest.fn() inside
 * foo.test.ts would be a 100% false positive rate. S3 only fires on mock
 * patterns found in PRODUCTION source files.
 *
 * Also skips:
 *   - __mocks__/ and __fixtures__/ directories (jest convention)
 *   - test-util / test-helper / fixture files (test infrastructure)
 */

import * as ts from 'typescript';
import type {
  HonestyRule,
  SREFinding,
} from './honesty-types.js';

/** File patterns that mark a file as a test file (S3 skips these). */
const TEST_FILE_PATTERNS = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /\.test\.tsx$/,
  /\.spec\.tsx$/,
];

/** Directory patterns that hold mocks/fixtures (S3 skips these). */
const MOCK_DIR_PATTERNS = [/__mocks__\//, /__fixtures__\//];

/** Test-infrastructure filename substrings (S3 skips these). */
const TEST_INFRA_PATTERNS = /test-util|test-helper|fixture/;

/** Top-level mock constructors. */
const MOCK_FACTORY_CALLEES = new Set([
  'jest.fn',
  'vi.fn',
  'sinon.stub',
  'sinon.fake',
  'sinon.spy',
  'jest.spyOn',
  'vi.spyOn',
]);

/** Chained mock configuration methods. */
const MOCK_CHAIN_METHODS = new Set([
  'mockImplementation',
  'mockReturnValue',
  'mockResolvedValue',
  'mockRejectedValue',
  'mockImplementationOnce',
  'mockReturnValueOnce',
  'mockResolvedValueOnce',
  'mockRejectedValueOnce',
  'mockReset',
  'mockClear',
  'mockRestore',
  'callsFake',
  'returns',
  'throws',
]);

/**
 * Walk a property-access / call chain to determine whether the receiver
 * originates from a known mock factory. This avoids false positives on
 * unrelated methods that happen to share a name (e.g. a custom object's
 * `.returns()` that does not come from jest/vi/sinon).
 */
function receiverChainIncludesMock(expr: ts.Node): boolean {
  let current: ts.Node = expr;
  // Bounded walk to prevent pathological deep chains.
  let depth = 0;
  while (current && depth < 20) {
    const text = current.getText();
    for (const factory of MOCK_FACTORY_CALLEES) {
      if (text.startsWith(factory)) return true;
    }
    if (ts.isPropertyAccessExpression(current)) {
      current = current.expression;
    } else if (ts.isCallExpression(current)) {
      current = current.expression;
    } else {
      break;
    }
    depth++;
  }
  return false;
}

/** Build an S3 finding with a consistent evidence shape. */
function buildS3Finding(
  sourceFile: ts.SourceFile,
  line: number,
  pattern: string,
  message: string
): SREFinding {
  return {
    ruleId: 'S3',
    severity: 'HIGH',
    message,
    file: sourceFile.fileName,
    line,
    category: 'mock_in_production',
    evidenceChain: [
      {
        claim:
          'File is a production source file (not *.test.ts / *.spec.ts / __mocks__)',
        verified: true,
      },
      {
        claim: `Node matches mock pattern '${pattern}'`,
        verified: true,
        snippet: pattern,
      },
      {
        claim: 'Receiver chain originates from a mock factory',
        verified: true,
      },
    ],
    remediation:
      `Remove the mock from production source. If this is dependency ` +
      `injection for tests, inject the real implementation in production ` +
      `and accept the mock only via a test-only constructor parameter or a ` +
      `factory function in the test file.`,
    falsePositiveGuards: [
      'Verified file does not match *.test.ts / *.spec.ts',
      'Verified file is not in __mocks__/ or test-util/ directory',
      'Verified callee or receiver chain matches a known mock factory',
    ],
  };
}

/**
 * S3 rule object.
 */
export const s3MockInProduction: HonestyRule = {
  id: 'S3',
  description:
    'Production source must not contain mock/stub factories — these belong in test files',
  category: 'mock_in_production',
  defaultSeverity: 'HIGH',

  check: (_constructs, _checker, sourceFile) => {
    const findings: SREFinding[] = [];
    const fileName = sourceFile.fileName;

    // -- FALSE POSITIVE GUARD: skip test files --
    if (TEST_FILE_PATTERNS.some((p: RegExp) => p.test(fileName))) return findings;
    if (MOCK_DIR_PATTERNS.some((p: RegExp) => p.test(fileName))) return findings;
    if (TEST_INFRA_PATTERNS.test(fileName)) return findings;

    const visit = (node: ts.Node): void => {
      if (!ts.isCallExpression(node)) {
        ts.forEachChild(node, visit);
        return;
      }

      const calleeText = node.expression.getText(sourceFile);
      const line =
        ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile))
          .line + 1;

      // -- Check 1: top-level mock factory (jest.fn, vi.fn, sinon.stub, ...) --
      if (MOCK_FACTORY_CALLEES.has(calleeText)) {
        findings.push(
          buildS3Finding(
            sourceFile,
            line,
            calleeText,
            `Mock factory '${calleeText}()' appears in production source '${fileName}'. ` +
              `The shipping artifact would contain a fake implementation. ` +
              `Move this to a *.test.ts file or replace with a real implementation.`
          )
        );
      }

      // -- Check 2: chained mock configuration --
      //   e.g. something.mockReturnValue(...) — the receiver is likely a mock.
      if (ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.text;
        if (MOCK_CHAIN_METHODS.has(methodName)) {
          // Confirm the receiver chain starts from a mock factory to avoid
          // flagging an unrelated method of the same name.
          if (receiverChainIncludesMock(node.expression.expression)) {
            findings.push(
              buildS3Finding(
                sourceFile,
                line,
                `.${methodName}()`,
                `Mock configuration '.${methodName}()' on a mock receiver in ` +
                  `production source '${fileName}'. This configures a fake, ` +
                  `not a real implementation.`
              )
            );
          }
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return findings;
  },
};
