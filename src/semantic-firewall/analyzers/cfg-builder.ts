import * as ts from 'typescript';

export interface BasicBlock {
  id: number;
  statements: ts.Statement[];
  successors: number[];
  predecessors: number[];
}

export class CFGBuilder {
  private blocks: BasicBlock[] = [];
  private nextId = 0;

  buildFromBody(body: ts.Block): BasicBlock[] {
    this.blocks = [];
    this.nextId = 0;
    this.processStatements(body.statements, null);
    return this.blocks;
  }


  private createBlock(): BasicBlock {
    const block: BasicBlock = {
      id: this.nextId++,
      statements: [],
      successors: [],
      predecessors: [],
    };
    this.blocks.push(block);
    return block;
  }

  private addEdge(from: BasicBlock, to: BasicBlock): void {
    if (!from.successors.includes(to.id)) from.successors.push(to.id);
    if (!to.predecessors.includes(from.id)) to.predecessors.push(from.id);
  }

  private processStatements(stmts: ts.Statement[], exitBlock: BasicBlock | null): BasicBlock {
    let current = this.createBlock();
    for (const stmt of stmts) {
      if (ts.isIfStatement(stmt)) {
        current = this.processIf(stmt, current, exitBlock);
      } else if (ts.isWhileStatement(stmt)) {
        current = this.processWhile(stmt, current, exitBlock);
      } else if (ts.isForStatement(stmt)) {
        current = this.processFor(stmt, current, exitBlock);
      } else if (ts.isTryStatement(stmt)) {
        current = this.processTry(stmt, current, exitBlock);
      } else if (ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt)) {
        current.statements.push(stmt);
        if (exitBlock) this.addEdge(current, exitBlock);
        current = this.createBlock();
      } else if (ts.isSwitchStatement(stmt)) {
        current = this.processSwitch(stmt, current, exitBlock);
      } else if (ts.isBreakStatement(stmt) || ts.isContinueStatement(stmt)) {
        current.statements.push(stmt);
        current = this.createBlock();
      } else {
        current.statements.push(stmt);
      }
    }
    return current;
  }

  private processIf(
    stmt: ts.IfStatement, entry: BasicBlock, exitBlock: BasicBlock | null
  ): BasicBlock {
    const condBlock = this.createBlock();
    this.addEdge(entry, condBlock);

    const thenBlock = this.processStatements(
      ts.isBlock(stmt.thenStatement) ? stmt.thenStatement.statements : [stmt.thenStatement],
      exitBlock
    );
    this.addEdge(condBlock, thenBlock);

    let elseBlock: BasicBlock;
    if (stmt.elseStatement) {
      elseBlock = this.processStatements(
        ts.isBlock(stmt.elseStatement) ? stmt.elseStatement.statements : [stmt.elseStatement],
        exitBlock
      );
    } else {
      elseBlock = this.createBlock();
    }
    this.addEdge(condBlock, elseBlock);

    const merge = this.createBlock();
    this.addEdge(thenBlock, merge);
    this.addEdge(elseBlock, merge);
    return merge;
  }

  private processWhile(
    stmt: ts.WhileStatement, entry: BasicBlock, exitBlock: BasicBlock | null
  ): BasicBlock {
    const condBlock = this.createBlock();
    this.addEdge(entry, condBlock);
    this.addEdge(condBlock, condBlock);
    const bodyBlock = this.processStatements(
      ts.isBlock(stmt.statement) ? stmt.statement.statements : [stmt.statement],
      exitBlock
    );
    this.addEdge(condBlock, bodyBlock);
    this.addEdge(bodyBlock, condBlock);
    const exit = this.createBlock();
    this.addEdge(condBlock, exit);
    return exit;
  }

  private processFor(
    stmt: ts.ForStatement, entry: BasicBlock, exitBlock: BasicBlock | null
  ): BasicBlock {
    const initBlock = this.createBlock();
    this.addEdge(entry, initBlock);

    const condBlock = this.createBlock();
    this.addEdge(initBlock, condBlock);
    this.addEdge(condBlock, condBlock);

    const bodyBlock = this.processStatements(
      ts.isBlock(stmt.statement) ? stmt.statement.statements : [stmt.statement],
      exitBlock
    );
    this.addEdge(condBlock, bodyBlock);

    const incrementBlock = this.createBlock();
    this.addEdge(bodyBlock, incrementBlock);
    this.addEdge(incrementBlock, condBlock);

    const exit = this.createBlock();
    this.addEdge(condBlock, exit);
    return exit;
  }

  private processTry(
    stmt: ts.TryStatement, entry: BasicBlock, exitBlock: BasicBlock | null
  ): BasicBlock {
    const tryBlock = this.processStatements(stmt.tryBlock.statements, exitBlock);
    this.addEdge(entry, tryBlock);

    if (stmt.catchClause) {
      const catchBlock = this.processStatements(stmt.catchClause.block.statements, exitBlock);
      this.addEdge(entry, catchBlock);
      this.addEdge(tryBlock, catchBlock);
    }

    if (stmt.finallyBlock) {
      const finallyBlock = this.processStatements(stmt.finallyBlock.statements, exitBlock);
      this.addEdge(tryBlock, finallyBlock);
    }

    const merge = this.createBlock();
    this.addEdge(tryBlock, merge);
    if (stmt.catchClause) {
      const lastCatch = this.blocks[this.blocks.length - 1];
      this.addEdge(lastCatch, merge);
    }
    return merge;
  }

  private processSwitch(
    stmt: ts.SwitchStatement, entry: BasicBlock, exitBlock: BasicBlock | null
  ): BasicBlock {
    const switchBlock = this.createBlock();
    this.addEdge(entry, switchBlock);

    let hasDefault = false;
    const caseEnds: BasicBlock[] = [];
    for (const clause of stmt.caseBlock.clauses) {
      if (ts.isDefaultClause(clause)) hasDefault = true;
      const caseBlock = this.processStatements(clause.statements, exitBlock);
      this.addEdge(switchBlock, caseBlock);
      caseEnds.push(caseBlock);
    }

    if (!hasDefault) {
      const defaultBlock = this.createBlock();
      this.addEdge(switchBlock, defaultBlock);
      caseEnds.push(defaultBlock);
    }

    const merge = this.createBlock();
    for (const end of caseEnds) this.addEdge(end, merge);
    return merge;
  }
}

export function computeDominators(blocks: BasicBlock[]): Map<number, number> {
  const dom = new Map<number, number>();
  if (blocks.length === 0) return dom;

  const entry = blocks[0];
  dom.set(entry.id, entry.id);

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const preds = block.predecessors
        .map(id => blocks.find(b => b.id === id))
        .filter((b): b is BasicBlock => b !== undefined);

      if (preds.length === 0) continue;

      let newDom = preds[0].id;
      for (let j = 1; j < preds.length; j++) {
        if (dom.has(preds[j].id)) {
          newDom = intersect(newDom, preds[j].id, dom, blocks);
        }
      }

      if (dom.get(block.id) !== newDom) {
        dom.set(block.id, newDom);
        changed = true;
      }
    }
  }
  return dom;

  function intersect(b1: number, b2: number, dom: Map<number, number>, blocks: BasicBlock[]): number {
    let finger1 = b1;
    let finger2 = b2;
    while (finger1 !== finger2) {
      while (finger1 > finger2) {
        finger1 = dom.get(finger1) ?? blocks[0].id;
      }
      while (finger2 > finger1) {
        finger2 = dom.get(finger2) ?? blocks[0].id;
      }
    }
    return finger1;
  }
}
