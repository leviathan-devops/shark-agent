/**
 * Pipe Chain Analyzer — detects theatrical pseudo-verification via pipes.
 *
 * Replaces the 12-regex THEATRICAL_PATTERNS array in guardian-hook.ts.
 *
 * Instead of regex-matching "| wc -l" anywhere in a command string,
 * this PARSES the pipe chain and checks if ANY command in the chain
 * is a theatrical counting operation.
 *
 * SEMANTIC ADVANTAGE: Understands PIPES. "wc -l" without a pipe
 * from cat/grep is not theatrical — it could be a legitimate line count.
 * "cat | wc -l" is ALWAYS theatrical because cat+wc does nothing
 * that a simple counting tool couldn't do.
 * Cannot be bypassed by changing "wc -l" to "wc -l file" — the parser
 * only flags when wc appears AFTER a pipe from another command.
 */

export interface PipeSegment {
  command: string;
  args: string[];
  fullText: string;
}

/**
 * Parse a command string into its pipe segments.
 * Each segment is a single command + its arguments.
 */
export function parsePipeChain(command: string): PipeSegment[] {
  if (!command || !command.includes('|')) return [];
  // Remove || (logical OR) before splitting on single |
  const cleaned = command.replace(/\|\|/g, '\x00LOGOR\x00');
  return cleaned.split('|').map((s: string) => {
    const restored = s.replace(/\x00LOGOR\x00/g, '||');
    const trimmed = restored.trim();
    const parts = trimmed.split(/\s+/);
    return {
      command: parts[0] || '',
      args: parts.slice(1),
      fullText: trimmed,
    };
  }).filter((s: PipeSegment) => s.command.length > 0);  // Filter empty segments
}

/** Commands that when used after a pipe, indicate theatrical verification */
const THEATRICAL_PIPE_COMMANDS = new Set(['wc', 'tee']);

/**
 * Check if a command string contains a theatrical pipe chain.
 * Theatrical means: one command piping output to another command that
 * merely counts, redirects, or summarizes — without actually verifying
 * correctness.
 *
 * Examples that ARE theatrical:
 *   cat file | wc -l
 *   grep foo bar | tee results.txt
 *   find src -name '*.ts' | wc -l
 *
 * Examples that are NOT theatrical:
 *   wc -l file                (single command, no pipe)
 *   cat file | grep pattern   (pipe to filter, not count)
 *   ls | head -5              (pipe to limit, not verify)
 */
export function hasTheatricalPipe(command: string): boolean {
  const chain = parsePipeChain(command);
  if (chain.length < 2) return false;

  // Check if any segment after the first is a theatrical command
  for (let i = 1; i < chain.length; i++) {
    const seg = chain[i];
    if (THEATRICAL_PIPE_COMMANDS.has(seg.command)) {
      // wc with -l, -w, or -c flags = counting = theatrical
      if (seg.command === 'wc') {
        return true;  // wc in a pipe chain is always counting = theatrical
      }
      // tee with any output file = redirecting output for pseudo-verification
      if (seg.command === 'tee') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get a human-readable reason why a pipe chain was flagged.
 */
export function getTheatricalPipeReason(command: string): string {
  const chain = parsePipeChain(command);
  if (chain.length < 2) return '';

  for (let i = 1; i < chain.length; i++) {
    const seg = chain[i];
    if (seg.command === 'wc') {
      return `Pipe to \`wc\` (${seg.args.join(' ')}) counts lines but does not verify correctness. Run actual tests in container.`;
    }
    if (seg.command === 'tee') {
      return `Pipe to \`tee\` redirects output but does not verify correctness. Run actual tests in container.`;
    }
  }

  return 'Pipe chain performs no actual verification. Run tests in container.';
}
