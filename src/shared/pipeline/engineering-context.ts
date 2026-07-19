/**
 * Detects when a tool call is performing engineering operations (build, tsc, eslint, etc.)
 * When engineeringContext is true, scope-violation severity is lowered from HIGH to INFO.
 */

const ENGINEERING_COMMAND_PATTERNS: RegExp[] = [
  /\bbun\s+build\b/,
  /\btsc\b(?!c)/,  // tsc but not tscc
  /\bnpx\s+tsc\b/,
  /\bnpm\s+run\s+build\b/,
  /\bnpm\s+run\s+check\b/,
  /\beslint\b/,
  /\bprettier\b/,
  /\bjest\b/,
  /\bvitest\b/,
  /\bnpm\s+test\b/,
  /\bnpx\s+jest\b/,
  /\bbun\s+test\b/,
  /\bbun\s+install\b/,
  /\bnpm\s+install\b/,
];

const ENGINEERING_FILES = new Set([
  'tsconfig.json', 'tsconfig.check.json', 'package.json',
  '.eslintrc', '.eslintrc.js', '.eslintrc.json',
  'jest.config.js', 'jest.config.ts',
  'vitest.config.ts', 'vitest.config.js',
]);

export function detectEngineeringContext(
  toolName: string | undefined,
  args: Record<string, unknown> | undefined
): boolean {
  if (!toolName || !args) return false;

  // Check bash commands
  if (toolName === 'bash' || toolName === 'execute_bash') {
    const command = String(args.command || args.cmd || args.input || '');
    if (ENGINEERING_COMMAND_PATTERNS.some(p => p.test(command))) return true;
  }

  // Check file paths for engineering config files
  if (toolName === 'write' || toolName === 'edit') {
    const filePath = String(args.filePath || args.path || args.file || '');
    const basename = filePath.split('/').pop() || '';
    if (ENGINEERING_FILES.has(basename)) return true;
  }

  return false;
}
