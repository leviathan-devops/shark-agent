import * as ts from 'typescript';

export interface BasicBlock {
  id: number;
  startPos: number;
  endPos: number;
  successors: number[];
  kind: 'linear' | 'branch' | 'loop' | 'try' | 'exit';
}

export interface ControlFlowGraph {
  blocks: BasicBlock[];
  entryBlock: BasicBlock | null;
  exitBlocks: BasicBlock[];
}

let blockCounter = 0;

function resetCounter(): void {
  blockCounter = 0;
}

function buildBlocks(node: ts.Node): BasicBlock[] {
  const blocks: BasicBlock[] = [];

  const visitor = (n: ts.Node): void => {
    if (ts.isIfStatement(n)) {
      const id = ++blockCounter;
      blocks.push({
        id,
        startPos: n.getStart(),
        endPos: n.end,
        successors: [],
        kind: 'branch'
      });

      const thenBlock = ts.isBlock(n.thenStatement)
        ? n.thenStatement
        : n.thenStatement;

      if (thenBlock) {
        const thenBlocks = buildBlocks(thenBlock);
        blocks.push(...thenBlocks);
      }
      if (n.elseStatement) {
        const elseBlocks = buildBlocks(n.elseStatement);
        blocks.push(...elseBlocks);
      }
    } else if (ts.isTryStatement(n)) {
      const id = ++blockCounter;
      blocks.push({
        id,
        startPos: n.getStart(),
        endPos: n.end,
        successors: [],
        kind: 'try'
      });

      const tryBlocks = buildBlocks(n.tryBlock);
      blocks.push(...tryBlocks);

      if (n.catchClause) {
        const catchBlocks = buildBlocks(n.catchClause.block);
        blocks.push(...catchBlocks);
      }
    } else if (ts.isSwitchStatement(n)) {
      const id = ++blockCounter;
      blocks.push({
        id,
        startPos: n.getStart(),
        endPos: n.end,
        successors: [],
        kind: 'branch'
      });

      for (const clause of n.caseBlock.clauses) {
        const clauseBlocks = buildBlocks(clause);
        blocks.push(...clauseBlocks);
      }
    }

    ts.forEachChild(n, visitor);
  };

  resetCounter();
  visitor(node);

  if (blocks.length === 0) {
    const id = ++blockCounter;
    blocks.push({
      id,
      startPos: node.getStart(),
      endPos: node.end,
      successors: [],
      kind: 'linear'
    });
  }

  const exitId = ++blockCounter;
  blocks.push({
    id: exitId,
    startPos: node.end,
    endPos: node.end,
    successors: [],
    kind: 'exit'
  });

  return blocks;
}

export function buildCFG(node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration): ControlFlowGraph {
  const body = node.body;
  if (!body) {
    return { blocks: [], entryBlock: null, exitBlocks: [] };
  }

  const blocks = buildBlocks(body);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind !== 'exit' && i + 1 < blocks.length) {
      const nextBlock = blocks[i + 1];
      if (!block.successors.includes(nextBlock.id)) {
        block.successors.push(nextBlock.id);
      }
    }
  }

  for (const block of blocks) {
    if (block.kind === 'branch' || block.kind === 'try') {
      block.successors = [];
      for (const other of blocks) {
        if (other.startPos >= block.startPos && other.endPos <= block.endPos && other.id !== block.id) {
          block.successors.push(other.id);
          if (block.successors.length >= 4) break;
        }
      }
    }
  }

  const entryBlock = blocks.length > 0 ? blocks[0] : null;
  const exitBlocks = blocks.filter((b: BasicBlock) => b.kind === 'exit');

  return { blocks, entryBlock, exitBlocks };
}

function getBlockById(cfg: ControlFlowGraph, id: number): BasicBlock | undefined {
  return cfg.blocks.find((b: BasicBlock) => b.id === id);
}

export function pathsToExit(cfg: ControlFlowGraph): BasicBlock[][] {
  const paths: BasicBlock[][] = [];

  function dfs(block: BasicBlock, currentPath: BasicBlock[]): void {
    const newPath = [...currentPath, block];

    if (block.kind === 'exit' || block.successors.length === 0) {
      paths.push(newPath);
      return;
    }

    for (const successorId of block.successors) {
      const successor = getBlockById(cfg, successorId);
      if (successor) {
        dfs(successor, newPath);
      }
    }
  }

  if (cfg.entryBlock) {
    dfs(cfg.entryBlock, []);
  }

  return paths;
}
