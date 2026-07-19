/**
 * thought-stream-graph.ts — Directed Graph of ThoughtConstructs
 *
 * Maintains a directed, weighted, sliding-window graph of the agent's thought
 * stream. Each node is a ThoughtConstruct; each edge encodes the structural
 * relationship between two thoughts (claim→evidence, topic continuation,
 * error→retry, etc.).
 *
 * Analogy: this is the per-session equivalent of SRE's per-function control-
 * flow graph. Where a CFG answers "can basic block B be reached from A?",
 * the ThoughtStreamGraph answers "was this claim ever grounded by evidence?"
 * and "is the agent cycling on the same error?".
 *
 * All edge computation is PURE STRUCTURAL PREDICATES over ThoughtConstruct
 * properties (`.type`, `.targetEntity`). No regex, no natural-language parsing
 * — the structured fields are the only signal.
 *
 * Fault-tolerant: no public method throws.
 */
import type { ThoughtConstruct } from './thought-construct-builder.js';

// ── Edge vocabulary ────────────────────────────────────────────────────────

export type ThoughtEdgeType =
  | 'claim-to-evidence'
  | 'claim-to-nothing'
  | 'question-to-answer'
  | 'plan-to-action'
  | 'topic-continuation'
  | 'topic-shift'
  | 'context-recall'
  | 'correction'
  | 'error-to-retry'
  | 'error-to-pivot'
  | 'evidence-to-claim';

export interface ThoughtEdge {
  from: number;
  to: number;
  type: ThoughtEdgeType;
  weight: number;
}

// ── Canonical thought-type codes ───────────────────────────────────────────
//
// Exported so thought-construct-builder.ts (and consumers) can align on a
// shared vocabulary. Edge predicates compare ThoughtConstruct.type against
// these codes (case-insensitive; compound names like "CLAIM_NOTE" also match).

export const THOUGHT_TYPE = {
  CLAIM: 'CLAIM',
  EVIDENCE: 'EVIDENCE',
  VERIFICATION: 'VERIFICATION',
  QUESTION: 'QUESTION',
  ANSWER: 'ANSWER',
  PLAN: 'PLAN',
  ACTION: 'ACTION',
  ERROR: 'ERROR',
  CONTEXT_RECALL: 'CONTEXT_RECALL',
  CORRECTION: 'CORRECTION',
} as const;

/** Predicate over a ThoughtConstruct used by reachability queries. */
export type ConstructPredicate = (c: ThoughtConstruct) => boolean;

// ── Internal node wrapper + snapshot shape ─────────────────────────────────

interface GraphNode {
  /** Stable, monotonic numeric id (survives sliding-window eviction). */
  id: number;
  construct: ThoughtConstruct;
}

export interface ThoughtStreamSnapshot {
  nextId: number;
  nodes: { id: number; construct: ThoughtConstruct }[];
  edges: ThoughtEdge[];
}

// ── Structural field accessors (no text-content parsing) ───────────────────

interface ConstructFields {
  readonly type?: unknown;
  readonly targetEntity?: unknown;
}

/** Project a ThoughtConstruct onto the two structural fields edge logic reads. */
function fields(c: ThoughtConstruct): ConstructFields {
  return c as unknown as ConstructFields;
}

/** Read ThoughtConstruct.type as a normalized uppercase code. */
function typeCode(c: ThoughtConstruct): string {
  try {
    const t = fields(c)?.type;
    if (typeof t === 'string') return t.toUpperCase().trim();
    if (typeof t === 'number') return String(t);
    return '';
  } catch {
    return '';
  }
}

/** Read ThoughtConstruct.targetEntity as a string (empty if absent). */
function targetOf(c: ThoughtConstruct): string {
  try {
    const t = fields(c)?.targetEntity;
    if (typeof t === 'string') return t;
    if (t == null) return '';
    return String(t);
  } catch {
    return '';
  }
}

/**
 * Structural type test: exact match on the normalized code, OR a compound
 * name prefixed by the code and a separator. Reads only the structured
 * `.type` field — never the construct's natural-language text.
 */
function typeIs(c: ThoughtConstruct, code: string): boolean {
  const t = typeCode(c);
  return t === code || t.startsWith(code + '_') || t.startsWith(code + '-');
}

// ── Edge weight table ───────────────────────────────────────────────────────

const WEIGHTS: Record<ThoughtEdgeType, number> = {
  'claim-to-evidence': 1.0,
  'claim-to-nothing': 0.1,
  'evidence-to-claim': 1.0,
  'question-to-answer': 1.0,
  'plan-to-action': 1.0,
  'error-to-retry': 0.2,
  'error-to-pivot': 0.8,
  'context-recall': 0.6,
  correction: 0.5,
  'topic-continuation': 0.7,
  'topic-shift': 0.3,
};

// ── Graph ─────────────────────────────────────────────────────────────────

export class ThoughtStreamGraph {
  private nodes: GraphNode[] = [];
  private edges: ThoughtEdge[] = [];
  private nextId = 0;

  /** Maximum nodes retained (sliding window). Older nodes are evicted. */
  private readonly maxWindow = 50;

  /** How many recent predecessors each new node connects to. */
  private connectDepth = 4;

  // ── Core mutation ──────────────────────────────────────────────────────

  /**
   * Append a ThoughtConstruct as a new node and auto-compute structural edges
   * to the most recent predecessors (forward edges: predecessor → new node).
   * Returns the assigned node id, or -1 on failure. Never throws.
   */
  append(construct: ThoughtConstruct): number {
    try {
      const id = this.nextId++;
      this.nodes.push({ id, construct });

      const start = Math.max(0, this.nodes.length - 1 - this.connectDepth);
      for (let i = this.nodes.length - 2; i >= start; i--) {
        const pred = this.nodes[i];
        if (!pred) continue;
        const edge = this.computeEdge(pred.construct, construct, pred.id, id);
        if (edge) this.edges.push(edge);
      }

      this.enforceWindow();
      return id;
    } catch {
      return -1;
    }
  }

  /**
   * Pure structural edge predicate. Given two ThoughtConstructs, determine the
   * edge type + weight that relates `from` (earlier) to `to` (later). Returns
   * null only on internal failure; the structural fallback is topic-shift.
   *
   * Precedence (first match wins):
   *   1. CLAIM → EVIDENCE/VERIFICATION        claim-to-evidence   (1.0)
   *      CLAIM → anything else                claim-to-nothing    (0.1)
   *   2. EVIDENCE → CLAIM                     evidence-to-claim   (1.0)
   *   3. QUESTION → ANSWER                    question-to-answer  (1.0)
   *   4. PLAN → ACTION                        plan-to-action      (1.0)
   *   5. ERROR → same target                  error-to-retry      (0.2)
   *      ERROR → different target             error-to-pivot      (0.8)
   *   6. `to` is CONTEXT_RECALL               context-recall      (0.6)
   *   7. `to` is CORRECTION                   correction          (0.5)
   *   8. same targetEntity                    topic-continuation  (0.7)
   *   9. otherwise                            topic-shift         (0.3)
   */
  computeEdge(
    fromConstruct: ThoughtConstruct,
    toConstruct: ThoughtConstruct,
    fromId: number,
    toId: number,
  ): ThoughtEdge | null {
    try {
      const fromIsClaim = typeIs(fromConstruct, THOUGHT_TYPE.CLAIM);
      const toIsEvidence =
        typeIs(toConstruct, THOUGHT_TYPE.VERIFICATION) ||
        typeIs(toConstruct, THOUGHT_TYPE.EVIDENCE);

      // 1. Claim relationships
      if (fromIsClaim) {
        return toIsEvidence
          ? this.edge(fromId, toId, 'claim-to-evidence')
          : this.edge(fromId, toId, 'claim-to-nothing');
      }
      // 2. Evidence → Claim
      if (
        typeIs(fromConstruct, THOUGHT_TYPE.EVIDENCE) &&
        typeIs(toConstruct, THOUGHT_TYPE.CLAIM)
      ) {
        return this.edge(fromId, toId, 'evidence-to-claim');
      }
      // 3. Question → Answer
      if (
        typeIs(fromConstruct, THOUGHT_TYPE.QUESTION) &&
        typeIs(toConstruct, THOUGHT_TYPE.ANSWER)
      ) {
        return this.edge(fromId, toId, 'question-to-answer');
      }
      // 4. Plan → Action
      if (
        typeIs(fromConstruct, THOUGHT_TYPE.PLAN) &&
        typeIs(toConstruct, THOUGHT_TYPE.ACTION)
      ) {
        return this.edge(fromId, toId, 'plan-to-action');
      }
      // 5. Error relationships
      if (typeIs(fromConstruct, THOUGHT_TYPE.ERROR)) {
        const fT = targetOf(fromConstruct);
        const sameTarget = fT !== '' && fT === targetOf(toConstruct);
        return sameTarget
          ? this.edge(fromId, toId, 'error-to-retry')
          : this.edge(fromId, toId, 'error-to-pivot');
      }
      // 6. Context recall (the `to` thought recalls earlier context)
      if (typeIs(toConstruct, THOUGHT_TYPE.CONTEXT_RECALL)) {
        return this.edge(fromId, toId, 'context-recall');
      }
      // 7. Correction
      if (typeIs(toConstruct, THOUGHT_TYPE.CORRECTION)) {
        return this.edge(fromId, toId, 'correction');
      }
      // 8/9. Topic continuity vs. shift
      const fTarget = targetOf(fromConstruct);
      const tTarget = targetOf(toConstruct);
      if (fTarget !== '' && tTarget !== '' && fTarget === tTarget) {
        return this.edge(fromId, toId, 'topic-continuation');
      }
      return this.edge(fromId, toId, 'topic-shift');
    } catch {
      return null;
    }
  }

  private edge(from: number, to: number, type: ThoughtEdgeType): ThoughtEdge {
    return { from, to, type, weight: WEIGHTS[type] };
  }

  /** Override the predecessor-connect depth (used by tests / tuning). */
  setConnectDepth(n: number): void {
    this.connectDepth = Math.max(1, Math.min(50, n));
  }

  // ── Sliding window ─────────────────────────────────────────────────────

  /** Evict the oldest node(s) once the window is exceeded; drop its edges. */
  private enforceWindow(): void {
    while (this.nodes.length > this.maxWindow) {
      const evicted = this.nodes.shift();
      if (!evicted) break;
      const eid = evicted.id;
      this.edges = this.edges.filter((e: ThoughtEdge) => e.from !== eid && e.to !== eid);
    }
  }

  // ── Reachability ─────────────────────────────────────────────────────────

  /**
   * Forward BFS reachability: can a node satisfying `predicate` be reached from
   * `fromId` within `depth` hops (successors only, excluding the start node)?
   * Returns false on miss or error. Never throws.
   */
  hasSuccessor(fromId: number, predicate: ConstructPredicate, depth: number): boolean {
    try {
      if (depth <= 0 || !this.nodeById(fromId)) return false;
      const adj = this.forwardAdjacency();
      const visited = new Set<number>([fromId]);
      let frontier = (adj.get(fromId) ?? []).filter((s: number) => {
        if (visited.has(s)) return false;
        visited.add(s);
        return true;
      });
      for (let d = 1; d <= depth; d++) {
        const next: number[] = [];
        for (const nid of frontier) {
          const node = this.nodeById(nid);
          if (node && this.safePredicate(predicate, node.construct)) return true;
          for (const s of adj.get(nid) ?? []) {
            if (!visited.has(s)) {
              visited.add(s);
              next.push(s);
            }
          }
        }
        if (next.length === 0) break;
        frontier = next;
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Backward BFS reachability (predecessors). Never throws. */
  hasPredecessor(fromId: number, predicate: ConstructPredicate, depth: number): boolean {
    try {
      if (depth <= 0 || !this.nodeById(fromId)) return false;
      const adj = this.backwardAdjacency();
      const visited = new Set<number>([fromId]);
      let frontier = (adj.get(fromId) ?? []).filter((p: number) => {
        if (visited.has(p)) return false;
        visited.add(p);
        return true;
      });
      for (let d = 1; d <= depth; d++) {
        const next: number[] = [];
        for (const pid of frontier) {
          const node = this.nodeById(pid);
          if (node && this.safePredicate(predicate, node.construct)) return true;
          for (const p of adj.get(pid) ?? []) {
            if (!visited.has(p)) {
              visited.add(p);
              next.push(p);
            }
          }
        }
        if (next.length === 0) break;
        frontier = next;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ── Cycle detection ──────────────────────────────────────────────────────

  /**
   * Detect cycles via DFS with visited/recursion-stack sets (Tarjan-style).
   * Returns { hasCycle, cycles } where each cycle is a list of node ids.
   * Never throws.
   */
  detectCycles(): { hasCycle: boolean; cycles: number[][] } {
    try {
      const adj = this.forwardAdjacency();
      const visited = new Set<number>();
      const recStack = new Set<number>();
      const cycles: number[][] = [];
      const path: number[] = [];

      const dfs = (u: number): void => {
        visited.add(u);
        recStack.add(u);
        path.push(u);
        for (const v of adj.get(u) ?? []) {
          if (!visited.has(v)) {
            dfs(v);
          } else if (recStack.has(v)) {
            // Back edge u→v: extract the cycle from the current DFS path.
            const start = path.indexOf(v);
            if (start >= 0) cycles.push(path.slice(start).concat(v));
          }
        }
        path.pop();
        recStack.delete(u);
      };

      for (const n of this.nodes) {
        if (!visited.has(n.id)) dfs(n.id);
      }
      return { hasCycle: cycles.length > 0, cycles };
    } catch {
      return { hasCycle: false, cycles: [] };
    }
  }

  // ── Diagnostic queries ───────────────────────────────────────────────────

  /**
   * Claim nodes with no incident evidence edge (neither claim-to-evidence
   * forward nor evidence-to-claim backward). Returns the constructs.
   * Never throws.
   */
  findUngroundedClaims(): ThoughtConstruct[] {
    try {
      const grounded = new Set<number>();
      for (const e of this.edges) {
        if (e.type === 'claim-to-evidence' || e.type === 'evidence-to-claim') {
          grounded.add(e.from);
          grounded.add(e.to);
        }
      }
      const out: ThoughtConstruct[] = [];
      for (const n of this.nodes) {
        if (typeIs(n.construct, THOUGHT_TYPE.CLAIM) && !grounded.has(n.id)) {
          out.push(n.construct);
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * Nodes with no incident context-recall edge and no topic-continuation edge.
   * Returns the constructs. Never throws.
   */
  findOrphanedTopics(): ThoughtConstruct[] {
    try {
      const connected = new Set<number>();
      for (const e of this.edges) {
        if (e.type === 'context-recall' || e.type === 'topic-continuation') {
          connected.add(e.from);
          connected.add(e.to);
        }
      }
      const out: ThoughtConstruct[] = [];
      for (const n of this.nodes) {
        if (!connected.has(n.id)) out.push(n.construct);
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * Fraction of claim nodes that are grounded by evidence, in [0, 1].
   * Returns 0 when there are no claims. Never throws.
   */
  getClaimEvidenceRatio(): number {
    try {
      const grounded = new Set<number>();
      for (const e of this.edges) {
        if (e.type === 'claim-to-evidence' || e.type === 'evidence-to-claim') {
          grounded.add(e.from);
          grounded.add(e.to);
        }
      }
      let claims = 0;
      let groundedCount = 0;
      for (const n of this.nodes) {
        if (typeIs(n.construct, THOUGHT_TYPE.CLAIM)) {
          claims++;
          if (grounded.has(n.id)) groundedCount++;
        }
      }
      return claims === 0 ? 0 : groundedCount / claims;
    } catch {
      return 0;
    }
  }

  // ── Accessors ──────────────────────────────────────────────────────────

  /** Last N constructs (most recent). Never throws. */
  getRecent(n: number): ThoughtConstruct[] {
    try {
      return this.nodes.slice(-Math.max(0, n)).map((node: GraphNode) => node.construct);
    } catch {
      return [];
    }
  }

  /** All edges of the given type. Never throws. */
  getEdgesByType(type: ThoughtEdgeType): ThoughtEdge[] {
    try {
      return this.edges.filter((e: ThoughtEdge) => e.type === type);
    } catch {
      return [];
    }
  }

  /** Current node count. */
  get size(): number {
    return this.nodes.length;
  }

  /** All edges (defensive copy). */
  getEdges(): ThoughtEdge[] {
    return this.edges.map((e: ThoughtEdge) => ({ ...e }));
  }

  // ── Compaction survival ──────────────────────────────────────────────────

  /** Serialize to a JSON-safe snapshot. Never throws. */
  serialize(): ThoughtStreamSnapshot {
    try {
      return {
        nextId: this.nextId,
        nodes: this.nodes.map((n: GraphNode) => ({ id: n.id, construct: n.construct })),
        edges: this.edges.map((e: ThoughtEdge) => ({ ...e })),
      };
    } catch {
      return { nextId: 0, nodes: [], edges: [] };
    }
  }

  /** Restore from a serialized snapshot. Never throws. */
  restore(snapshot: Partial<ThoughtStreamSnapshot>): void {
    try {
      this.nextId = snapshot?.nextId ?? 0;
      this.nodes = Array.isArray(snapshot?.nodes)
        ? snapshot!.nodes.map((n: { id: number; construct: ThoughtConstruct }) => ({ id: n.id, construct: n.construct }))
        : [];
      this.edges = Array.isArray(snapshot?.edges)
        ? snapshot!.edges.map((e: ThoughtEdge) => ({ ...e }))
        : [];
      this.enforceWindow();
    } catch {
      this.nodes = [];
      this.edges = [];
    }
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private nodeById(id: number): GraphNode | undefined {
    return this.nodes.find((n: GraphNode) => n.id === id);
  }

  private forwardAdjacency(): Map<number, number[]> {
    const adj = new Map<number, number[]>();
    for (const e of this.edges) {
      const list = adj.get(e.from);
      if (list) list.push(e.to);
      else adj.set(e.from, [e.to]);
    }
    return adj;
  }

  private backwardAdjacency(): Map<number, number[]> {
    const adj = new Map<number, number[]>();
    for (const e of this.edges) {
      const list = adj.get(e.to);
      if (list) list.push(e.from);
      else adj.set(e.to, [e.from]);
    }
    return adj;
  }

  private safePredicate(p: ConstructPredicate, c: ThoughtConstruct): boolean {
    try {
      return p(c) === true;
    } catch {
      return false;
    }
  }
}
