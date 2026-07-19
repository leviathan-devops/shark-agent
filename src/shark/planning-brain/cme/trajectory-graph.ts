/**
 * trajectory-graph.ts — Directed Weighted Trajectory Graph (Order 2)
 *
 * Builds and maintains a directed, weighted graph of the agent's tool call
 * sequence. Nodes are semantic tool calls; edges encode the "goodness" of
 * moving from one category to another. A sliding window keeps only the most
 * recent nodes/edges to bound memory.
 *
 * Why a graph and not just an array?
 *   1. Edge weights encode semantic transitions (EXPLORE->CREATE is good;
 *      CLAIM->EXPLORE is a red flag) — an array flattens this.
 *   2. Subsequence/transition analysis is O(V+E), not O(n^2) re-scans.
 *   3. Cycle detection (read->grep->read->grep) feeds Lobe 6 loop intelligence.
 */
import type {
  SemanticCategory,
  TrajectoryEdge,
  TrajectoryNode,
} from './cme-types.js';

/**
 * The transition weight table. Encodes the semantic "goodness" of moving
 * from one category to another. Weights are in [0, 1].
 *
 *   1.0 = ideal progression (explored then built)
 *   0.5 = neutral momentum (more of the same)
 *   0.0 = suspicious/wasteful (claimed done then went back to exploring)
 */
const TRANSITION_WEIGHTS: Record<string, number> = {
  // Ideal forward transitions
  'EXPLORE->CREATE': 1.0,
  'EXPLORE->MODIFY': 0.9,
  'CREATE->TEST': 1.0,
  'MODIFY->TEST': 1.0,
  'TEST->MODIFY': 0.8, // legitimate debug loop
  'TEST->VERIFY': 0.9,
  'VERIFY->CLAIM': 1.0,
  'CREATE->VERIFY': 0.7,
  'MODIFY->VERIFY': 0.7,

  // Same-category (momentum)
  'EXPLORE->EXPLORE': 0.5,
  'CREATE->CREATE': 0.6,
  'MODIFY->MODIFY': 0.6,
  'TEST->TEST': 0.5,
  'VERIFY->VERIFY': 0.5,
  'NAVIGATE->NAVIGATE': 0.3,
  'CLAIM->CLAIM': 0.4,

  // Neutral transitions
  'EXPLORE->NAVIGATE': 0.4,
  'NAVIGATE->EXPLORE': 0.5,
  'NAVIGATE->CREATE': 0.5,
  'CREATE->NAVIGATE': 0.3,

  // Suspicious backward transitions
  'CREATE->EXPLORE': 0.3, // built then went back to exploring
  'CLAIM->EXPLORE': 0.1, // claimed done then exploring (red flag)
  'CLAIM->CREATE': 0.2, // claimed done then building (red flag)
  'TEST->EXPLORE': 0.3, // tested then exploring without fixing
  'VERIFY->EXPLORE': 0.3,
};

/** Default weight for any transition not explicitly listed above. */
const DEFAULT_TRANSITION_WEIGHT = 0.4;

export class TrajectoryGraph {
  private nodes: TrajectoryNode[] = [];
  private edges: TrajectoryEdge[] = [];
  private sequenceCounter = 0;

  /**
   * Maximum number of nodes retained (rolling window). Older nodes/edges are
   * trimmed to bound memory. This preserves only the recent behavioral
   * signal that the T-1..T-5 rules score over.
   */
  private maxWindowSize = 50;

  /** Next sequence number to assign (monotonic within the session). */
  nextSequence(): number {
    return this.sequenceCounter;
  }

  /**
   * Append a node to the graph. Automatically creates a weighted edge from
   * the previous node to this one based on the transition weight table, then
   * trims the rolling window if necessary.
   *
   * Amortized O(1) per append (trimming is O(excess) but rare).
   */
  append(node: TrajectoryNode): void {
    // Create edge from the previous node to this one.
    if (this.nodes.length > 0) {
      const prev = this.nodes[this.nodes.length - 1];
      const transition = `${prev.category}->${node.category}`;
      const weight = this.computeEdgeWeight(prev, node);
      this.edges.push({
        from: prev.sequence,
        to: node.sequence,
        weight,
        transition,
      });
    }
    this.nodes.push(node);
    this.sequenceCounter++;

    // Trim to the rolling window.
    if (this.nodes.length > this.maxWindowSize) {
      const excess = this.nodes.length - this.maxWindowSize;
      this.nodes.splice(0, excess);
      // Each excess node also invalidates one trailing edge.
      this.edges.splice(0, excess);
    }
  }

  /** Return the last N nodes (most recent). */
  getRecentN(n: number): TrajectoryNode[] {
    return this.nodes.slice(-n);
  }

  /** Alias used by the spec naming. */
  recentNodes(n: number): TrajectoryNode[] {
    return this.getRecentN(n);
  }

  /** Return the last N edges (most recent). */
  recentEdges(n: number): TrajectoryEdge[] {
    return this.edges.slice(-n);
  }

  /** All nodes (within the rolling window). */
  allNodes(): TrajectoryNode[] {
    return [...this.nodes];
  }

  /**
   * Compute the weight of an edge between two nodes. Looks up the transition
   * weight table; falls back to DEFAULT_TRANSITION_WEIGHT for unlisted
   * transitions. Public so tests and rules can inspect transition semantics.
   */
  computeEdgeWeight(from: TrajectoryNode, to: TrajectoryNode): number {
    const transition = `${from.category}->${to.category}`;
    return TRANSITION_WEIGHTS[transition] ?? DEFAULT_TRANSITION_WEIGHT;
  }

  /** Raw lookup of a transition weight by name string. */
  static transitionWeight(transition: string): number {
    return TRANSITION_WEIGHTS[transition] ?? DEFAULT_TRANSITION_WEIGHT;
  }

  /** Count nodes by category within the recent window. */
  getCategoryDistribution(
    nodes?: TrajectoryNode[],
  ): Map<SemanticCategory, number> {
    const source = nodes ?? this.nodes;
    const counts = new Map<SemanticCategory, number>();
    for (const n of source) {
      counts.set(n.category, (counts.get(n.category) ?? 0) + 1);
    }
    return counts;
  }

  countByCategory(windowSize: number): Map<SemanticCategory, number> {
    return this.getCategoryDistribution(this.getRecentN(windowSize));
  }

  /** Current size of the node window. */
  size(): number {
    return this.nodes.length;
  }

  /** Override the rolling window cap (used by tests / tuning). */
  setMaxWindowSize(n: number): void {
    this.maxWindowSize = n;
    if (this.nodes.length > n) {
      const excess = this.nodes.length - n;
      this.nodes.splice(0, excess);
      this.edges.splice(0, excess);
    }
  }

  /**
   * Serialize the graph for compaction survival. Returns a plain object
   * containing the nodes, edges, and the sequence counter.
   */
  serialize(): {
    nodes: TrajectoryNode[];
    edges: TrajectoryEdge[];
    sequenceCounter: number;
  } {
    return {
      nodes: this.nodes,
      edges: this.edges,
      sequenceCounter: this.sequenceCounter,
    };
  }

  /** Restore the graph from a serialized snapshot. */
  restore(
    data: {
      nodes: TrajectoryNode[];
      edges: TrajectoryEdge[];
      sequenceCounter: number;
    },
  ): void {
    this.nodes = data.nodes ?? [];
    this.edges = data.edges ?? [];
    this.sequenceCounter = data.sequenceCounter ?? 0;
  }
}

export { TRANSITION_WEIGHTS, DEFAULT_TRANSITION_WEIGHT };
