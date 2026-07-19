/**
 * Identity Loader — Shark v4.9
 *
 * Loads identity files from identity/shark/ directory.
 * Produces sharkIdentityPrompt for system injection.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const IDENTITY_FILES = ['SHARK.md', 'IDENTITY.md', 'EXECUTION.md', 'QUALITY.md', 'TOOLS.md', 'FIREWALL_CONTEXT.md', 'WORKFLOW.md', 'AGENT_AWARENESS.md'];

let _pluginDirectory: string | null = null;

export function setPluginDirectory(dir: string): void {
  _pluginDirectory = dir;
}

function getSearchPaths(): string[] {
  const primary = _pluginDirectory
    ? [path.join(_pluginDirectory, 'identity', 'shark')]
    : [];
  return [
    ...primary,
    path.join(__dirname, '..', 'identity', 'shark'),
    path.join(process.cwd(), 'identity', 'shark'),
    path.join(process.cwd(), '..', 'identity', 'shark'),
    path.join(process.cwd(), '..', '..', 'identity', 'shark'),
  ];
}

export interface SharkIdentity {
  [key: string]: string;
  SHARK: string;
  IDENTITY: string;
  EXECUTION: string;
  QUALITY: string;
  TOOLS: string;
  FIREWALL_CONTEXT: string;
  WORKFLOW: string;
  AGENT_AWARENESS: string;
}

export interface SharkIdentityPrompt {
  full: string;
  length: number;
  loaded: boolean;
  loadedAt: string;
}

let cachedIdentity: SharkIdentity | null = null;
let cachedPrompt: SharkIdentityPrompt | null = null;

export function loadSharkIdentity(): SharkIdentity | null {
  if (cachedIdentity) {
    return cachedIdentity;
  }

  for (const searchPath of getSearchPaths()) {
    const fullPath = path.resolve(searchPath);
    if (fs.existsSync(fullPath)) {
      const identity: SharkIdentity = {
        SHARK: '',
        IDENTITY: '',
        EXECUTION: '',
        QUALITY: '',
        TOOLS: '',
        FIREWALL_CONTEXT: '',
        WORKFLOW: '',
        AGENT_AWARENESS: '',
      };

      let allLoaded = true;
      for (const file of IDENTITY_FILES) {
        const filePath = path.join(fullPath, file);
        if (fs.existsSync(filePath)) {
          try {
            identity[file.replace('.md', '')] = fs.readFileSync(filePath, 'utf-8');
          } catch {
            console.warn('[identity-loader] file read failed');
            allLoaded = false;
          }
        } else {
          allLoaded = false;
        }
      }

      if (allLoaded) {
        cachedIdentity = identity;
        return identity;
      }
    }
  }

  // Fallback: use bundled content if real files couldn't be loaded
  if (!cachedIdentity) {
    cachedIdentity = {
      SHARK: BUNDLED_FALLBACKS.SHARK || '',
      IDENTITY: BUNDLED_FALLBACKS.IDENTITY || '',
      EXECUTION: '',
      QUALITY: '',
      TOOLS: '',
      FIREWALL_CONTEXT: '',
      WORKFLOW: '',
      AGENT_AWARENESS: BUNDLED_FALLBACKS.AGENT_AWARENESS || '',
    };
    return cachedIdentity;
  }

  return null;
}

// Bundled fallbacks — survive bundling, ensure identity never returns null
const BUNDLED_FALLBACKS: Partial<SharkIdentity> = {
  SHARK: '# SHARK v5.1.0 — Runtime-Grade Software Engineering Agent\nYou are SHARK v5.1.0 — a runtime-grade software engineering agent with planning brain.',
  IDENTITY: 'You are NOT opencode. NOT OpenCode. NOT Claude. NOT ChatGPT.\nYou engineer software systems that work in real runtime environments.',
  AGENT_AWARENESS: '# AGENT AWARENESS\nSee full AGENT_AWARENESS.md for architectural details.\n7 hooks, 11 warheads, 10 firewall rules, 6-gate pipeline.',
};

export function formatIdentityForSystemPrompt(): SharkIdentityPrompt {
  if (cachedPrompt) {
    return cachedPrompt;
  }

  const identity = loadSharkIdentity();
  if (!identity) {
    return {
      full: '',
      length: 0,
      loaded: false,
      loadedAt: '',
    };
  }

  const sections = [
    '# SHARK IDENTITY — Autonomous Engineering Agent',
    '',
    identity.AGENT_AWARENESS,
    '',
    identity.SHARK,
    '',
    '## Role & Expertise',
    identity.IDENTITY,
    '',
    '## Execution Patterns',
    identity.EXECUTION,
    '',
    '## Quality Standards',
    identity.QUALITY,
    '',
    '## Tool Philosophy',
    identity.TOOLS,
    '',
    '## Firewall Context',
    identity.FIREWALL_CONTEXT,
    '',
    '## Workflow',
    identity.WORKFLOW,
    '',
    '*Shark v5.1.0 — Semantic Intelligence + Context Management + Frontal PSM. Execute autonomously.*',
  ];

  const full = sections.join('\n');
  cachedPrompt = {
    full,
    length: full.length,
    loaded: true,
    loadedAt: new Date().toISOString(),
  };

  return cachedPrompt;
}

export function getSharkIdentityPrompt(): string {
  return formatIdentityForSystemPrompt().full;
}

export function isSharkIdentityLoaded(): boolean {
  return formatIdentityForSystemPrompt().loaded;
}

export function resetIdentityCache(): void {
  cachedIdentity = null;
  cachedPrompt = null;
}

export const SHARK_PLUGIN_IDENTITY = {
  sharkAgents: new Set(['shark', 'shark-agent', 'shark-agent-v5', 'shark_beta', 'shark_gamma']),
  loadIdentity: loadSharkIdentity,
  formatIdentity: formatIdentityForSystemPrompt,
  getPrompt: getSharkIdentityPrompt,
  isLoaded: isSharkIdentityLoaded,
};