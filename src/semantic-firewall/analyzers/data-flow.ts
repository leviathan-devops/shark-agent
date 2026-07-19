export type TransferFunction = (block: { id: number; statements: unknown[]; successors: number[]; predecessors: number[] }, inState: Set<string>) => Set<string>;

export function forwardDFA(
  blocks: { id: number; statements: unknown[]; successors: number[]; predecessors: number[] }[],
  transferFn: TransferFunction,
  meetFn: (states: Set<string>[]) => Set<string>,
  bottom: Set<string>
): Map<number, Set<string>> {
  const inStates = new Map<number, Set<string>>();
  const outStates = new Map<number, Set<string>>();

  for (const block of blocks) {
    inStates.set(block.id, new Set(bottom));
    outStates.set(block.id, new Set(bottom));
  }

  if (blocks.length === 0) return inStates;
  inStates.set(blocks[0].id, new Set());

  let changed = true;
  while (changed) {
    changed = false;
    for (const block of blocks) {
      const predInStates: Set<string>[] = [];
      for (const predId of block.predecessors) {
        const predOut = outStates.get(predId);
        if (predOut) predInStates.push(predOut);
      }

      const newIn = predInStates.length > 0 ? meetFn(predInStates) : new Set(bottom);
      const oldIn = inStates.get(block.id)!;

      if (!setsEqual(newIn, oldIn)) {
        inStates.set(block.id, newIn);
        changed = true;
      }

      const newOut = transferFn(block, newIn);
      const oldOut = outStates.get(block.id)!;
      if (!setsEqual(newOut, oldOut)) {
        outStates.set(block.id, newOut);
        changed = true;
      }
    }
  }

  return inStates;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export function unionMeet(states: Set<string>[]): Set<string> {
  const result = new Set<string>();
  for (const s of states) for (const v of s) result.add(v);
  return result;
}

export function intersectMeet(states: Set<string>[]): Set<string> {
  if (states.length === 0) return new Set();
  const result = new Set(states[0]);
  for (let i = 1; i < states.length; i++) {
    for (const v of result) if (!states[i].has(v)) result.delete(v);
  }
  return result;
}
