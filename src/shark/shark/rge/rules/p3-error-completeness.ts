import * as ts from 'typescript';
import { SemanticRule, SemanticFinding } from './rule-engine.js';

function hasCommentInCatchBlock(sourceFile: ts.SourceFile, block: ts.Block): boolean {
  const blockTextStart = block.getStart();
  const blockEnd = block.end;

  const text = sourceFile.text.substring(blockTextStart, blockEnd);

  const lineCommentIdx = text.indexOf('//');
  const blockCommentIdx = text.indexOf('/*');

  if (lineCommentIdx >= 0 || blockCommentIdx >= 0) {
    const firstCommentIdx = lineCommentIdx >= 0
      ? (blockCommentIdx >= 0 ? Math.min(lineCommentIdx, blockCommentIdx) : lineCommentIdx)
      : blockCommentIdx;

    const textBeforeComment = text.substring(0, firstCommentIdx).trim();
    const onlyWhitespaceOrBrace = textBeforeComment === '' || textBeforeComment === '{' || /^[\s{]*$/.test(textBeforeComment);
    return onlyWhitespaceOrBrace;
  }

  return false;
}

export const p3ErrorCompleteness: SemanticRule = {
  id: 'P3',
  description: 'No empty catch clauses. Truly empty (no statements, no comments) is CRITICAL. Comment-only is HIGH.',
  layer: 'syntactic',
  check: (node: ts.Node, _checker: ts.TypeChecker, sourceFile: ts.SourceFile) => {
    if (!ts.isCatchClause(node)) return [];

    const findings: SemanticFinding[] = [];
    const block = node.block;
    const catchLine = ts.getLineAndCharacterOfPosition(sourceFile, node.pos).line + 1;

    if (block.statements.length === 0) {
      const hasComment = hasCommentInCatchBlock(sourceFile, block);

      if (!hasComment) {
        findings.push({
          ruleId: 'P3',
          severity: 'CRITICAL',
          message: `Empty catch clause at line ${catchLine} with no statements and no comments. Every catch must handle the error (log, rethrow, or recover).`,
          file: sourceFile.fileName,
          line: catchLine
        } as SemanticFinding);
      } else {
        findings.push({
          ruleId: 'P3',
          severity: 'HIGH',
          message: `Catch clause at line ${catchLine} contains only comments. Comments alone do not constitute error handling — add actual handling logic or remove the empty catch.`,
          file: sourceFile.fileName,
          line: catchLine
        } as SemanticFinding);
      }
    }

    return findings;
  }
};
