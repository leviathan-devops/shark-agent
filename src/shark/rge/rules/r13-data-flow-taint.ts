import * as ts from 'typescript';
import type { CodeConstructTree } from '../construct-tree.js';
import type { SemanticFinding } from '../report-types.js';

const TAINT_SOURCES = new Set([
  'process.argv', 'process.env', 'process.stdin',
  'req.body', 'req.query', 'req.params', 'req.headers',
  'request.body', 'request.query',
  'localStorage.getItem', 'sessionStorage.getItem',
  'document.cookie', 'location.hash'
]);

const DANGEROUS_SINKS = new Set([
  'exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync',
  'eval', 'Function',
  'fs.writeFileSync', 'fs.writeFile', 'fs.appendFileSync',
  'fs.mkdirSync', 'fs.unlinkSync', 'fs.renameSync',
  'child_process.exec', 'child_process.execSync'
]);

const SANITIZERS = new Set([
  'escapeHtml', 'escape', 'sanitize', 'validate', 'parseInt', 'parseFloat',
  'Number', 'Boolean', 'String', 'encodeURI', 'encodeURIComponent',
  'crypto.randomUUID'
]);

export interface TaintFinding {
  ruleId: 'R13';
  severity: 'CRITICAL';
  message: string;
  file: string;
  line: number;
  source: string;  // The taint source
  sink: string;    // The dangerous sink
}

/**
 * R13: Data Flow Taint Tracking
 *
 * Forward propagation from untrusted sources to dangerous sinks.
 * If a tainted variable reaches a sink without a sanitizer -> CRITICAL.
 *
 * Algorithm:
 * 1. Find all taint source accesses (AssignmentExpression with taint source on RHS)
 * 2. Forward propagate through assignments
 * 3. Find all sink calls with tainted variables as arguments
 * 4. Check for sanitizers in the propagation chain
 */
export function detectTaint(
  _tree: CodeConstructTree,
  _checker: ts.TypeChecker | null,
  sourceFiles: ts.SourceFile[]
): (TaintFinding & SemanticFinding)[] {
  const findings: (TaintFinding & SemanticFinding)[] = [];

  for (const sf of sourceFiles) {
    // Step 1: Collect tainted variables
    const taintedVars = new Map<string, Set<string>>(); // var -> set of taint sources
    const sanitizedVars = new Set<string>();

    // First pass: collect taint/sanitizer assignments
    ts.forEachChild(sf, function collect(node: ts.Node): void {
      // Check for taint source assignments: const x = process.argv[2]
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          const varName = ts.isIdentifier(decl.name) ? decl.name.text : '';
          if (!varName) continue;

          const initializer = decl.initializer;
          if (initializer) {
            const exprText = initializer.getText(sf);

            // Check if initializer contains a taint source
            for (const source of TAINT_SOURCES) {
              if (exprText.includes(source)) {
                const sources = taintedVars.get(varName) || new Set<string>();
                sources.add(source);
                taintedVars.set(varName, sources);
              }
            }

            // Check if initializer contains a sanitizer
            for (const sanitizer of SANITIZERS) {
              if (exprText.includes(sanitizer)) {
                sanitizedVars.add(varName);
              }
            }
          }
        }
      }

      // Check for reassignments: x = process.env.SECRET
      if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
        const expr = node.expression;
        if (expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          if (ts.isIdentifier(expr.left)) {
            const varName = expr.left.text;
            const exprText = expr.right.getText(sf);
            for (const source of TAINT_SOURCES) {
              if (exprText.includes(source)) {
                const sources = taintedVars.get(varName) || new Set<string>();
                sources.add(source);
                taintedVars.set(varName, sources);
              }
            }
          }
        }
      }

      ts.forEachChild(node, collect);
    });

    // Step 2: Find sink calls with tainted arguments
    ts.forEachChild(sf, function findSinks(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const calleeText = node.expression.getText(sf);

        // Check if callee is a dangerous sink
        let isSink = false;
        let sinkName = calleeText;
        for (const sink of DANGEROUS_SINKS) {
          if (calleeText.endsWith(sink) || calleeText === sink) {
            isSink = true;
            sinkName = sink;
            break;
          }
        }

        if (isSink) {
          // Check arguments for tainted variables
          for (const arg of node.arguments) {
            const argText = arg.getText(sf);
            for (const [varName, sources] of taintedVars) {
              if (argText.includes(varName) && !sanitizedVars.has(varName)) {
                const line = sf.getLineAndCharacterOfPosition(arg.getStart()).line + 1;
                findings.push({
                  ruleId: 'R13',
                  severity: 'CRITICAL',
                  message: `Tainted data from ${Array.from(sources).join(', ')} reaches dangerous sink ${sinkName} without sanitization`,
                  file: sf.fileName,
                  line,
                  source: Array.from(sources).join(', '),
                  sink: sinkName
                });
              }
            }
          }
        }
      }
      ts.forEachChild(node, findSinks);
    });
  }

  return findings;
}
