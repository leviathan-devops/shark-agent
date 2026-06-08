/**
 * hive-context — Read-only Hive context absorption tool
 *
 * PURPOSE: Read and absorb context from the OpenViking Hive Mind local storage.
 * Allows Sharks and Mantas to access established patterns, architecture docs,
 * failure modes, build chains, TUI testing protocol, and more.
 *
 * READ-ONLY: Never writes to Hive. Only reads.
 */

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface HiveContextOutput {
  source: string;
  content: string;
  length: number;
  loaded: boolean;
  error?: string;
  files?: string[];
  topics?: string[];
  matches?: Array<{ file: string; line: number; snippet: string }>;
}

export type HiveContextAction = 'read' | 'search' | 'list';

export const HIVE_CONTEXT_TOPICS = [
  'patterns', 'failures', 'build-chain', 'architecture', 'alignment-bible',
  'crash-recovery', 'tui-testing', 'kraken-rules', 'compaction-survival',
  'plugin-engineering', 'agent-identity',
  'shark-debug-log', 'shark-build-spec',
  'shark-identity-shark', 'shark-identity-identity',
  'shark-identity-execution',
] as const;

/**
 * Determine the Hive Mind storage path.  Tries in order:
 *   1. process.env.HIVE_MIND_PATH
 *   2. $HOME/.local/share/opencode/hive-mind
 *   3. /root/.local/share/opencode/hive-mind
 *   4. /home/leviathan/.local/share/opencode/hive-mind
 *
 * Returns the first path that actually exists on disk, or the fallback
 * ($HOME-based) if none exists.
 */
function resolveHiveMindRoot(): string {
  if (process.env.HIVE_MIND_PATH && fs.existsSync(process.env.HIVE_MIND_PATH)) {
    return process.env.HIVE_MIND_PATH;
  }

  const homePath = path.join(
    process.env.HOME || '/root',
    '.local', 'share', 'opencode', 'hive-mind'
  );
  if (fs.existsSync(homePath)) return homePath;

  const staticPaths = [
    '/root/.local/share/opencode/hive-mind',
  ];
  for (const p of staticPaths) {
    if (fs.existsSync(p)) return p;
  }

  return homePath;
}

/**
 * Map a context topic to one or more hive-mind paths (relative to root).
 */
function topicToPaths(topic: string, root: string): string[] {
  const p = (rel: string) => path.join(root, rel);
  const krakenCtx = (file: string) => p(path.join('kraken', 'context', file));

  switch (topic) {
    case 'patterns':
      return [
        p('patterns'),
        p('shared'),
        ...globDirs(root, /^pattern/),
        p('T2_PATTERNS.md'),
        krakenCtx('T2_PATTERNS.md'),
      ];
    case 'architecture':
      return [p('architecture'), p('T2_ARCHITECTURE.md'), krakenCtx('T2_ARCHITECTURE.md')];
    case 'failures':
      return [p('failures'), p('T2_FAILURE_MODES.md'), krakenCtx('T2_FAILURE_MODES.md')];
    case 'build-chain':
      return [p('T2_BUILD_CHAIN.md'), krakenCtx('T2_BUILD_CHAIN.md')];
    case 'tui-testing':
      return [
        ...globDirs(root, /^TUI/),
        p('T2_TUI_TESTING.md'),
        krakenCtx('T2_TUI_TESTING.md'),
      ];
    case 'kraken-rules':
      return [p('T2_KRAKEN_RULES.md'), krakenCtx('T2_KRAKEN_RULES.md')];
    case 'compaction-survival':
      return [p('T2_COMPACTION_SURVIVAL.md'), krakenCtx('T2_COMPACTION_SURVIVAL.md')];
    case 'plugin-engineering':
      return [p('plugin-engineering'), p('T2_PLUGIN_ENGINEERING.md'), krakenCtx('T2_PLUGIN_ENGINEERING.md')];
    case 'agent-identity':
      return [
        p('T2_AGENT_IDENTITY.md'),
        krakenCtx('T2_AGENT_IDENTITY.md'),
        ...globFiles(root, /^t1_agent_identity/),
      ];
    case 'alignment-bible':
      return [p('T2_ALIGNMENT_BIBLE.md'), krakenCtx('T2_ALIGNMENT_BIBLE.md')];
    case 'crash-recovery':
      return [p('T2_CRASH_RECOVERY.md'), krakenCtx('T2_CRASH_RECOVERY.md')];
    case 'shark-build-spec': {
      const specs = [
        ...globFiles(root, /^shark-v4.9-/),
        ...findFiles(root, /BUILD_SPEC/i, ['md', 'txt']),
      ];
      return specs.length > 0 ? specs : [p('BUILD_SPEC.md')];
    }
    case 'shark-debug-log': {
      const logs = [
        p('compaction_survival/DEBUG_LOG.md'),
        ...findFiles(process.cwd(), /^DEBUG_LOG/i, ['md', 'log', 'txt'], 3),
      ];
      return logs;
    }
    case 'shark-identity-shark':
      return [
        p('identity/shark/SHARK.md'),
        ...findFiles(root, /SHARK\..*md$/i, ['md'], 2),
      ];
    case 'shark-identity-identity':
      return [
        p('identity/shark/IDENTITY.md'),
        ...findFiles(root, /IDENTITY\..*md$/i, ['md'], 2),
      ];
    case 'shark-identity-execution':
      return [
        p('identity/shark/EXECUTION.md'),
        ...findFiles(root, /EXECUTION\..*md$/i, ['md'], 2),
      ];
    default:
      return [];
  }
}

function globDirs(root: string, pattern: RegExp): string[] {
  try {
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(e => e.isDirectory() && pattern.test(e.name))
      .map(e => path.join(root, e.name));
  } catch {
    return [];
  }
}

function globFiles(root: string, pattern: RegExp): string[] {
  try {
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(e => e.isFile() && pattern.test(e.name))
      .map(e => path.join(root, e.name));
  } catch {
    return [];
  }
}

function findFiles(
  base: string,
  pattern: RegExp,
  extensions: string[],
  maxDepth = 2
): string[] {
  const results: string[] = [];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if ((extensions.length === 0 || extensions.includes(ext)) && pattern.test(entry.name)) {
          results.push(full);
        }
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full, depth + 1);
      }
    }
  }

  walk(base, 0);
  return results;
}

function readFileSafe(filePath: string): string | null {
  try {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return null;
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return null;
    const content = fs.readFileSync(resolved, 'utf-8');
    if (content.length > 50000) return content.slice(0, 50000) + '\n\n[... TRUNCATED at 50KB ...]';
    return content;
  } catch {
    return null;
  }
}

function readDirMarkdown(dirPath: string): string[] {
  const parts: string[] = [];
  try {
    if (!fs.existsSync(dirPath)) return parts;
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return parts;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const content = readFileSafe(fullPath);
      if (content !== null) {
        parts.push(`### ${entry.name}`);
        parts.push(content);
        parts.push('');
      }
    }
  } catch {
    // silent
  }
  return parts;
}

function readTopicContent(topic: string, root: string): { content: string; files: string[] } {
  const candidatePaths = topicToPaths(topic, root);
  const files: string[] = [];
  const parts: string[] = [];

  for (const candidate of candidatePaths) {
    if (!fs.existsSync(candidate)) continue;
    const stat = fs.statSync(candidate);

    if (stat.isDirectory()) {
      const dirFiles = fs.readdirSync(candidate, { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => path.join(candidate, e.name));
      files.push(...dirFiles);
      const dirContent = readDirMarkdown(candidate);
      parts.push(...dirContent);
    } else if (stat.isFile()) {
      const content = readFileSafe(candidate);
      if (content !== null) {
        files.push(candidate);
        parts.push(content);
      }
    }
  }

  // For pattern/ glob dirs, also read .md files inside them
  for (const candidate of candidatePaths) {
    if (!fs.existsSync(candidate)) continue;
    if (!fs.statSync(candidate).isDirectory()) continue;
    // Already handled above, but for glob-based dirs (e.g. shared/pattern*/),
    // we may have only returned the directory name — read its markdown files.
    const globDirContent = readDirMarkdown(candidate);
    for (const chunk of globDirContent) {
      if (!parts.includes(chunk)) parts.push(chunk);
    }
    // Avoid duplicate directory reads
    const dirMdFiles = fs.readdirSync(candidate, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => path.join(candidate, e.name));
    for (const f of dirMdFiles) {
      if (!files.includes(f)) files.push(f);
    }
  }

  return { content: parts.join('\n').trim(), files: Array.from(new Set(files)) };
}

function searchHiveMind(root: string, query: string): Array<{ file: string; line: number; snippet: string }> {
  const results: Array<{ file: string; line: number; snippet: string }> = [];

  function walk(dir: string, depth: number) {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(full, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(query.toLowerCase())) {
              const start = Math.max(0, i - 1);
              const end = Math.min(lines.length - 1, i + 1);
              const snippet = lines.slice(start, end + 1).join('\n');
              results.push({
                file: full,
                line: i + 1,
                snippet,
              });
              if (results.length >= 100) return;
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(root, 0);
  return results;
}

function listAvailableTopics(root: string): string[] {
  const topics: string[] = [];
  const seenDirs = new Set<string>();

  function walk(dir: string, depth: number) {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const rel = path.relative(root, full);
        if (!seenDirs.has(rel)) {
          seenDirs.add(rel);
          const mdCount = countMdFiles(full);
          if (mdCount > 0) {
            topics.push(`${rel}/ (${mdCount} .md files)`);
          }
        }
        walk(full, depth + 1);
      }
    }
  }

  // Also note top-level .md files as individual topics
  try {
    const topLevel = fs.readdirSync(root, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => e.name);
    for (const f of topLevel) {
      topics.push(f);
    }
  } catch {
    // silent
  }

  walk(root, 0);
  return topics;
}

function countMdFiles(dir: string): number {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

export function createHiveContextTool() {
  return tool({
    description: 'Read-only Hive context absorption — load established patterns, failure modes, architecture docs, build chains, TUI testing protocol, plugin engineering knowledge, and more from the OpenViking Hive Mind local storage (~/.local/share/opencode/hive-mind/). Supports reading topics, searching across all .md files, and listing available topics. READ ONLY — never writes to Hive.',

    args: {
      action: z.enum(['read', 'search', 'list']).default('read').describe(
        'Action to perform: "read" to load a specific topic, "search" to grep across all hive-mind .md files, "list" to show all available topics'
      ),
      topic: z.enum(HIVE_CONTEXT_TOPICS).optional().describe(
        'Context topic to absorb (required for "read" action). Available topics: patterns, failures, build-chain, architecture, alignment-bible, crash-recovery, tui-testing, kraken-rules, compaction-survival, plugin-engineering, agent-identity, shark-debug-log, shark-build-spec, shark-identity-shark, shark-identity-identity, shark-identity-execution'
      ),
      query: z.string().optional().describe(
        'Search query string (required for "search" action). Case-insensitive grep across all .md files in the hive-mind directory.'
      ),
    },

    execute: async (args: { action?: string; topic?: string; query?: string }, _ctx: unknown): Promise<string> => {
      const action = (args && args.action) || 'read';
      const topic = (args && args.topic) || undefined;
      const query = (args && args.query) || undefined;
      const root = resolveHiveMindRoot();

      if (!fs.existsSync(root)) {
        return JSON.stringify({
          source: 'Hive Mind',
          content: '',
          length: 0,
          loaded: false,
          error: `Hive Mind storage not found at ${root}. Create the directory or set HIVE_MIND_PATH env var.`,
        } satisfies HiveContextOutput, null, 2);
      }

      // --- list ---
      if (action === 'list') {
        const topics = listAvailableTopics(root);
        const result: HiveContextOutput = {
          source: `Hive Mind — ${root}`,
          content: topics.join('\n'),
          length: topics.join('\n').length,
          loaded: true,
          topics,
        };
        return JSON.stringify(result, null, 2);
      }

      // --- search ---
      if (action === 'search') {
        if (!query) {
          return JSON.stringify({
            source: 'Hive Mind',
            content: '',
            length: 0,
            loaded: false,
            error: 'Query string is required for "search" action.',
          } satisfies HiveContextOutput, null, 2);
        }
        const matches = searchHiveMind(root, query);
        let content = matches.length > 0
          ? matches.map(m => `${m.file}:${m.line}\n${m.snippet}\n---`).join('\n')
          : `No matches found for "${query}" in ${root}`;

        const result: HiveContextOutput = {
          source: `Hive Mind — search "${query}"`,
          content,
          length: content.length,
          loaded: matches.length > 0,
          matches,
        };
        return JSON.stringify(result, null, 2);
      }

      // --- read ---
      if (!topic) {
        return JSON.stringify({
          source: 'Hive Mind',
          content: '',
          length: 0,
          loaded: false,
          error: 'Topic is required for "read" action.',
        } satisfies HiveContextOutput, null, 2);
      }

      const { content, files } = readTopicContent(topic, root);

      if (content.length === 0) {
        const result: HiveContextOutput = {
          source: `Hive Mind — ${topic}`,
          content: '',
          length: 0,
          loaded: false,
          files,
          error: `No content found for topic "${topic}" in ${root}. Searched paths: ${topicToPaths(topic, root).join(', ') || '(none)'}`,
        };
        return JSON.stringify(result, null, 2);
      }

      const result: HiveContextOutput = {
        source: `Hive Mind — ${topic}`,
        content,
        length: content.length,
        loaded: true,
        files,
      };
      return JSON.stringify(result, null, 2);
    },
  });
}
