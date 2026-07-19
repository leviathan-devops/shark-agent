/**
 * tool-category-mapper.ts — The Tip of the Spear (Order 0-1, 5-10%)
 *
 * Maps raw tool names to SemanticCategory FAST. This is the ONLY place where
 * string/regex inspection is used — and only to DISAMBIGUATE (produce a
 * candidate category), never to make enforcement decisions. All decisions
 * are made by the T-1 through T-5 rules operating on the category-bearing
 * nodes.
 *
 * IRON LAW: This map NEVER makes a drift/alignment/stagnation decision.
 */
import type { GateName, SemanticCategory, TrajectoryNode } from './cme-types.js';

/**
 * Direct tool-name -> category lookup. Fast O(1).
 * Ambiguous tools (bash) are refined below by command inspection.
 */
const TOOL_CATEGORY_MAP: ReadonlyMap<string, SemanticCategory> = new Map<string, SemanticCategory>([
  // EXPLORE — information gathering
  ['read', 'EXPLORE'],
  ['glob', 'EXPLORE'],
  ['grep', 'EXPLORE'],
  ['ls', 'EXPLORE'],
  ['webfetch', 'EXPLORE'],
  ['hive_context', 'EXPLORE'],
  ['shark-hive-context', 'EXPLORE'],

  // CREATE — bringing into existence
  ['write', 'CREATE'],
  ['mkdir', 'CREATE'],

  // MODIFY — changing existing
  ['edit', 'MODIFY'],
  ['write_file', 'MODIFY'],
  ['patch', 'MODIFY'],

  // TEST — mechanical verification
  ['shark-test-runner', 'TEST'],
  ['manta-test-runner', 'TEST'],
  ['shark-browser-test', 'TEST'],

  // VERIFY — quality enforcement
  ['shark-run-trident', 'VERIFY'],
  ['shark-audit', 'VERIFY'],
  ['manta-code-audit', 'VERIFY'],
  ['manta-runtime-audit', 'VERIFY'],
  ['trident-code-audit', 'VERIFY'],
  ['manta-code-review', 'VERIFY'],
  ['shark-evidence-query', 'VERIFY'],

  // CLAIM — completion assertion
  ['shark-gate', 'CLAIM'],
  ['manta-gate', 'CLAIM'],
  ['shark-evidence', 'CLAIM'],
  ['manta-evidence', 'CLAIM'],
  ['checkpoint', 'CLAIM'],
  ['shark-checkpoint', 'CLAIM'],

  // NAVIGATE — movement, no content change (bash refined below)
  ['bash', 'NAVIGATE'],
  ['shark-status', 'NAVIGATE'],
  ['manta-status', 'NAVIGATE'],
  ['shark-health', 'NAVIGATE'],
  ['shark-diagnose', 'NAVIGATE'],
]);

export interface ToolCategoryMapperInput {
  readonly sessionID: string;
  readonly toolName: string;
  readonly filePath?: string;
  readonly touchedPaths?: string[];
  readonly succeeded?: boolean;
  readonly tokenCost?: number;
  readonly gate: GateName;
  readonly sequence: number;
  /** Raw command string — used to refine ambiguous tools (e.g., bash). */
  readonly command?: string;
}

export class ToolCategoryMapper {
  /** Allow tests / DI to override the existence checker (write->modify). */
  private fsExists: (p: string) => boolean = defaultExists;

  /**
   * Map a raw tool call to a TrajectoryNode with semantic category.
   *
   * Resolution order:
   *   1. Direct lookup in TOOL_CATEGORY_MAP.
   *   2. Refine bash by inspecting the command string.
   *   3. Refine write: if the file already exists, it is MODIFY not CREATE.
   *   4. Unknown tool -> NAVIGATE (safe neutral default).
   */
  map(input: ToolCategoryMapperInput): TrajectoryNode {
    let category = TOOL_CATEGORY_MAP.get(input.toolName) ?? 'NAVIGATE';

    // Refine bash: it is overloaded — its category depends on the command.
    if (input.toolName === 'bash' && input.command) {
      category = this.refineBash(input.command);
    }

    // Refine write: overwriting an existing file is a MODIFY, not a CREATE.
    if (input.toolName === 'write' && input.filePath && this.fsExists(input.filePath)) {
      category = 'MODIFY';
    }

    return {
      sequence: input.sequence,
      toolName: input.toolName,
      category,
      filePath: input.filePath,
      touchedPaths: input.touchedPaths,
      timestamp: new Date().toISOString(),
      gate: input.gate,
      succeeded: input.succeeded,
      tokenCost: input.tokenCost,
    };
  }

  /**
   * Standalone categorizer (no node construction). Useful for adapters that
   * only need the category for a tool name.
   */
  categorize(toolName: string, args?: { command?: string; filePath?: string }): SemanticCategory {
    let category = TOOL_CATEGORY_MAP.get(toolName) ?? 'NAVIGATE';
    if (toolName === 'bash' && args?.command) {
      category = this.refineBash(args.command);
    }
    if (toolName === 'write' && args?.filePath && this.fsExists(args.filePath)) {
      category = 'MODIFY';
    }
    return category;
  }

  /**
   * Refine a bash command into a semantic category.
   * This is the ONLY place string inspection decides a category — and only
   * to disambiguate, not to decide enforcement.
   */
  private refineBash(command: string): SemanticCategory {
    const c = command.toLowerCase();
    if (/\b(tsc|bun build|npm run build|webpack|rollup|esbuild|vite build)\b/.test(c)) {
      return 'CREATE'; // compiling = producing artifacts
    }
    if (/\b(test|jest|vitest|mocha|pytest|cargo test|go test)\b/.test(c)) {
      return 'TEST';
    }
    if (/\b(audit|lint|eslint|tsc --noemit|check)\b/.test(c)) {
      return 'VERIFY';
    }
    if (/\b(cat|head|tail|less|more|grep|rg|find|ls|git log|git diff|git status)\b/.test(c)) {
      return 'EXPLORE';
    }
    if (/>>|>\s*\S+\.(ts|js|json|md|txt|py|rs|go)\b/.test(c)) {
      return 'MODIFY'; // redirect into a code file
    }
    if (/\b(mkdir|touch|cp|mv)\b/.test(c)) {
      return 'CREATE';
    }
    return 'NAVIGATE';
  }

  /** @deprecated No caller wires a custom existence checker. The default `fsExists` (assume file does not exist) is sufficient for the current trajectory analysis. */
  setExistenceChecker(fn: (p: string) => boolean): void {
    this.fsExists = fn;
  }
}

function defaultExists(_p: string): boolean {
  // Safe default: assume the file does not exist (treat write as CREATE).
  return false;
}

/**
 * Stateless helper used by the engine to map a tool name to a category
 * without constructing a node (e.g., for fast T-2 lookups). Falls back to
 * NAVIGATE for unknown tools.
 */
export function categorizeTool(toolName: string, args?: { command?: string }): SemanticCategory {
  const direct = TOOL_CATEGORY_MAP.get(toolName);
  if (direct) return direct;
  if (toolName === 'bash' && args?.command) {
    // Lightweight refinement without needing a ToolCategoryMapper instance.
    const c = args.command.toLowerCase();
    if (/\b(tsc|bun build|npm run build|webpack|rollup|esbuild|vite build)\b/.test(c)) return 'CREATE';
    if (/\b(test|jest|vitest|mocha|pytest|cargo test|go test)\b/.test(c)) return 'TEST';
    if (/\b(audit|lint|eslint|tsc --noemit|check)\b/.test(c)) return 'VERIFY';
    if (/\b(cat|head|tail|less|more|grep|rg|find|ls|git log|git diff|git status)\b/.test(c)) return 'EXPLORE';
    if (/\b(mkdir|touch|cp|mv)\b/.test(c)) return 'CREATE';
  }
  return 'NAVIGATE';
}
