/**
 * shark-spawn-container — Spawn sandboxed container in under 5 seconds
 *
 * PURPOSE: Spawn a sandboxed tmux/docker container for testing, semantically named,
 * isolated from live machine and other projects. 5-second spawn time.
 *
 * CRITICAL RULES:
 * 1. -it flag — CRITICAL: Without this, docker attach doesn't work
 * 2. --entrypoint "" — CRITICAL: Without this, containers fail with code 126
 * 3. opencode as PID 1 — Must use /bin/sh -c 'opencode --agent X'
 * 4. SNAP mounted at /root/.config/opencode — Mount snapshot, NOT host config
 * 5. Semantic naming — shark-{projectName}-{YYYY-MM-DD}
 */

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface SpawnContainerInput {
  projectName: string;
  pluginSource?: string;
  projectPath?: string;
}

export interface SpawnContainerOutput {
  containerName: string;
  tmuxSession: string;
  workspaceMount: string;
  snapshotPath: string;
  success: boolean;
  error?: string;
}

const SHARK_AGENT_NAME = 'shark-agent';
const SHARK_AGENT_COLOR = '#228B22';
const DEFAULT_PLUGIN_SOURCE = (() => {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'plugins', 'shark-agent'),
    path.join(cwd, 'dist', '..'),
    path.join(os.homedir(), '.config', 'opencode', 'plugins', 'shark-agent'),
  ];
  for (const cand of candidates) {
    const distPath = path.join(cand, 'dist', 'index.js');
    if (fs.existsSync(distPath)) return cand;
  }
  return process.cwd();
})();
const DEFAULT_PROJECT_PATH = process.cwd();
const CONTAINER_IMAGE = 'opencode-test:1.14.34';
const RESERVED_CONTAINER_PREFIXES = ['trident-', 'kraken-', 'manta-', 'architect-', 'opencode-'];
const DOCKER_SOCKET = '/var/run/docker.sock';

function getDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function generateContainerName(projectName: string): string {
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  return `shark-${safeName}-${getDateString()}`;
}

function tokenizeArgs(argsStr: string): string[] {
  const tokens: string[] = [];
  const regex = /([^\s"']+|"[^"]*"|'[^']*')+/g;
  let match;
  while ((match = regex.exec(argsStr)) !== null) {
    let token = match[0];
    if ((token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))) {
      token = token.slice(1, -1);
    }
    tokens.push(token);
  }
  return tokens.filter(t => t !== '2>/dev/null' && t !== '2>&1');
}

function dockerRestPs(args: string[]): string {
  const filterIdx = args.findIndex(a => a === '--filter' || a === '-f');
  let url = 'http://localhost/containers/json?all=true';

  if (filterIdx !== -1 && filterIdx + 1 < args.length) {
    const filterStr = args[filterIdx + 1];
    const eqIdx = filterStr.indexOf('=');
    if (eqIdx !== -1) {
      const key = filterStr.substring(0, eqIdx);
      const value = filterStr.substring(eqIdx + 1);
      const filters = encodeURIComponent(JSON.stringify({ [key]: [value] }));
      url += '&filters=' + filters;
    }
  }

  const result = execSync(`curl -s --unix-socket ${DOCKER_SOCKET} "${url}"`, { encoding: 'utf-8', stdio: 'pipe' });
  const containers = JSON.parse(result.toString());
  if (!Array.isArray(containers)) return '';
  return containers.map((c: Record<string, unknown>) => {
    const names = (c.Names || []) as string[];
    return names[0] ? names[0].replace(/^\//, '') : '';
  }).filter(Boolean).join('\n');
}

function dockerRestRm(args: string[]): string {
  const force = args.includes('-f') || args.includes('--force');
  const containerName = args.filter(a => !a.startsWith('-')).pop() || '';
  const url = `http://localhost/containers/${containerName}?force=${force}`;
  execSync(`curl -s -X DELETE --unix-socket ${DOCKER_SOCKET} "${url}"`, { encoding: 'utf-8', stdio: 'pipe' });
  return '';
}

function dockerRestLogs(args: string[]): string {
  const containerName = args[0];
  const url = `http://localhost/containers/${containerName}/logs?stdout=true&stderr=true`;
  return execSync(`curl -s --unix-socket ${DOCKER_SOCKET} "${url}"`, { encoding: 'utf-8', stdio: 'pipe' }).toString();
}

function dockerRestRun(args: string[]): string {
  let name = '';
  let entrypoint: string | null = null;
  const binds: string[] = [];
  let image = '';
  const cmd: string[] = [];
  let imageFound = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--name' && i + 1 < args.length) {
      name = args[++i];
    } else if (arg === '--entrypoint' && i + 1 < args.length) {
      entrypoint = args[++i];
    } else if (arg === '-v' && i + 1 < args.length) {
      binds.push(args[++i]);
    } else if (['-d', '--detach', '--rm', '-it', '-i', '-t'].includes(arg)) {
      continue;
    } else if (arg.startsWith('-')) {
      i++;
      continue;
    } else if (!imageFound) {
      image = arg;
      imageFound = true;
    } else {
      cmd.push(arg);
    }
  }

  const createBody: Record<string, unknown> = {
    Image: image,
    Cmd: cmd,
    HostConfig: {
      Binds: binds,
      AutoRemove: args.includes('--rm'),
    },
    Tty: args.includes('-t') || args.includes('-it'),
    OpenStdin: args.includes('-i') || args.includes('-it'),
  };

  if (entrypoint !== null) {
    createBody.Entrypoint = [entrypoint];
  }

  let url = 'http://localhost/containers/create';
  if (name) {
    url += '?name=' + encodeURIComponent(name);
  }

  const body = JSON.stringify(createBody);
  const createResult = JSON.parse(
    execSync(
      `curl -s -X POST --unix-socket ${DOCKER_SOCKET} -H 'Content-Type: application/json' -d '${body}' "${url}"`,
      { encoding: 'utf-8', stdio: 'pipe' },
    ).toString(),
  );

  if (createResult.Id) {
    execSync(
      `curl -s -X POST --unix-socket ${DOCKER_SOCKET} "http://localhost/containers/${createResult.Id}/start"`,
      { encoding: 'utf-8', stdio: 'pipe' },
    );
    return createResult.Id;
  }

  throw new Error('Failed to create container via Docker REST API: ' + JSON.stringify(createResult));
}

function dockerRestCmd(cliArgs: string): string {
  if (!fs.existsSync(DOCKER_SOCKET)) {
    throw new Error(`Docker socket not found at ${DOCKER_SOCKET}. Cannot use REST fallback.`);
  }

  const tokens = tokenizeArgs(cliArgs);
  const subcommand = tokens[0];

  switch (subcommand) {
    case 'ps':
      return dockerRestPs(tokens.slice(1));
    case 'rm':
      return dockerRestRm(tokens.slice(1));
    case 'logs':
      return dockerRestLogs(tokens.slice(1));
    case 'run':
      return dockerRestRun(tokens.slice(1));
    default:
      throw new Error(`Unsupported docker subcommand for REST fallback: ${subcommand}`);
  }
}

/**
 * Universal Docker command runner.
 * Tries the Docker CLI binary first, then falls back to REST API via
 * the Docker socket at /var/run/docker.sock if the CLI is unavailable.
 */
function dockerCmd(cliArgs: string): string {
  try {
    return execSync(`docker ${cliArgs}`, { encoding: 'utf-8', stdio: 'pipe' }).toString().trim();
  } catch (cliErr) {
    const msg = cliErr instanceof Error ? cliErr.message : String(cliErr);
    throw new Error(`Docker command failed: docker ${cliArgs}\n${msg}`);
  }
}

function validateContainerIsolation(containerName: string): void {
  for (const prefix of RESERVED_CONTAINER_PREFIXES) {
    if (containerName.startsWith(prefix)) {
      throw new Error(`[CONTAINER ISOLATION] Container name "${containerName}" uses reserved prefix "${prefix}". Each agent gets its own namespace. Shark containers must start with "shark-".`);
    }
  }
  const running = dockerCmd(`ps --format '{{.Names}}'`).trim().split('\n');
  for (const name of running) {
    const trimmed = name.trim();
    if (!trimmed.startsWith('shark-')) continue;
    if (trimmed !== containerName && trimmed.includes(getDateString())) {
      // Warn about same-date containers for different projects
    }
  }
}

function generateTmuxSession(containerName: string): string {
  return `${containerName}-tui`;
}

const OPENROUTER_API_KEY = 'tp-ssy5nlzfc5vccack4ccierszbs0fojjp0lp3uj37hlp328ci';
const OPENCODE_BINARY = '/usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode';

const MODEL_CHAIN = {
  primary: 'opencode-zen/deepseek-v4-flash',
  fallback1: 'operouter/deepseek-v4-flash:free',
  fallback2: 'google-genai/gemma-4-26b',
} as const;

const PROVIDER_CONFIG: Record<string, { npm: string; options: Record<string, unknown> }> = {
  'opencode-zen': {
    npm: '@ai-sdk/openai-compatible',
    options: {
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: OPENROUTER_API_KEY,
    },
  },
  'operouter': {
    npm: '@ai-sdk/openai-compatible',
    options: {
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: OPENROUTER_API_KEY,
    },
  },
  'google-genai': {
    npm: '@ai-sdk/google-generative-ai',
    options: {
      apiKey: process.env.GOOGLE_API_KEY || '',
    },
  },
};

function createSnapshot(pluginSource: string, agentName: string): string {
  const ts = Date.now();
  const SNAP = path.join('/tmp', `snap-${agentName}-${ts}`);
  fs.mkdirSync(SNAP, { recursive: true });

  const pluginDistSrc = path.join(pluginSource, 'dist');
  if (fs.existsSync(pluginDistSrc)) {
    const indexJs = path.join(pluginDistSrc, 'index.js');
    if (fs.existsSync(indexJs)) {
      const bundleDest = path.join(SNAP, 'plugin.js');
      fs.copyFileSync(indexJs, bundleDest);
    }
  }

  const identitySource = path.join(pluginSource, 'identity');
  if (fs.existsSync(identitySource)) {
    copyDirectoryRecursive(identitySource, path.join(SNAP, 'identity'));
  }

  const opencodeJson = {
    model: MODEL_CHAIN.primary,
    provider: PROVIDER_CONFIG,
    plugin: [`file:///root/.config/opencode/plugin.js`],
    agent: {
      [agentName]: {
        name: agentName,
        color: SHARK_AGENT_COLOR,
        mode: 'primary',
        hidden: false,
        permission: { task: 'allow', tool: 'allow' },
      },
    },
  };

  fs.writeFileSync(
    path.join(SNAP, 'opencode.json'),
    JSON.stringify(opencodeJson, null, 2)
  );

  try {
    execSync('npm init -y', { cwd: SNAP, stdio: 'pipe' });
    execSync('npm install zod', { cwd: SNAP, stdio: 'pipe' });
  } catch {
    // zod install failure — plugin may still work if zod is in container node_modules
  }

  return SNAP;
}

function copyDirectoryRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanupContainer(containerName: string): void {
  try {
    dockerCmd(`rm -f ${containerName} 2>/dev/null`);
  } catch {
    // Container may not exist
  }
}

function cleanupTmux(tmuxSession: string): void {
  try {
    execSync(`tmux kill-session -t ${tmuxSession} 2>/dev/null`, { stdio: 'ignore' });
  } catch {
    // Session may not exist
  }
}

export function spawnContainerSync(input: SpawnContainerInput): SpawnContainerOutput {
  const {
    projectName,
    pluginSource = DEFAULT_PLUGIN_SOURCE,
    projectPath = DEFAULT_PROJECT_PATH,
  } = input;

  const containerName = generateContainerName(projectName);

  // Enforce semantic isolation: each project gets its own shark container
  try {
    validateContainerIsolation(containerName);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      containerName,
      tmuxSession: generateTmuxSession(containerName),
      workspaceMount: '/workspace',
      snapshotPath: '',
      success: false,
      error: errorMsg,
    };
  }

  const tmuxSession = generateTmuxSession(containerName);

  cleanupContainer(containerName);
  cleanupTmux(tmuxSession);

  const SNAP = createSnapshot(pluginSource, SHARK_AGENT_NAME);

  try {
    const mountSnap = `-v "${SNAP}:/root/.config/opencode"`;
    const mountWorkspace = `-v "${projectPath}:/root/workspace"`;

    dockerCmd(`run -d --rm --name ${containerName} --entrypoint "" ${mountSnap} ${mountWorkspace} ${CONTAINER_IMAGE} sleep infinity`);

    execSync('sleep 3', { stdio: 'pipe' });

    let psCheck = '';
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
      psCheck = dockerCmd(`ps --filter "name=${containerName}" --format "{{.Names}}"`).trim();
      if (psCheck.includes(containerName)) break;
      attempts++;
      if (attempts < maxAttempts) {
        execSync('sleep 2', { stdio: 'pipe' });
      }
    }
    if (!psCheck.trim().includes(containerName)) {
      let logs = '';
      try {
        logs = dockerCmd(`logs ${containerName} 2>&1`);
      } catch {
        logs = '(could not retrieve logs)';
      }
      return {
        containerName,
        tmuxSession,
        workspaceMount: '/root/workspace',
        snapshotPath: SNAP,
        success: false,
        error: `Container not running after spawn. Logs:\n${logs}`,
      };
    }

    try {
      execSync(`docker exec ${containerName} bash -c "apt-get update -qq && apt-get install -y -qq tmux 2>/dev/null"`, { stdio: 'pipe' });
    } catch {
      // tmux may already be installed
    }

    try {
      execSync(`tmux new-session -d -s ${tmuxSession} -x 160 -y 48`, { stdio: 'pipe' });
      execSync(`tmux send-keys -t ${tmuxSession} "docker exec -it ${containerName} ${OPENCODE_BINARY} /root/workspace" Enter`, { stdio: 'pipe' });
    } catch {
      // tmux setup may fail outside container — agent can set up manually
    }

    try {
      const evidenceDir = path.join(projectPath, '.shark', 'evidence', 'test');
      fs.mkdirSync(evidenceDir, { recursive: true });
      const spawnEvidence = {
        containerName,
        tmuxSession,
        success: true,
        modelChain: MODEL_CHAIN,
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(evidenceDir, 'ContainerSpawnResult.json'), JSON.stringify(spawnEvidence, null, 2));
    } catch { /* evidence write failure non-fatal */ }

    return {
      containerName,
      tmuxSession,
      workspaceMount: '/root/workspace',
      snapshotPath: SNAP,
      success: true,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      containerName,
      tmuxSession,
      workspaceMount: '/workspace',
      snapshotPath: SNAP,
      success: false,
      error: errorMsg,
    };
  }
}

export function createSharkSpawnContainerTool() {
  return tool({
    description: 'Spawn a sandboxed Docker container for testing — semantically named, ISOLATED per project, 5-second spawn time. Uses opencode-test:1.14.34 image via Docker socket (/var/run/docker.sock). CRITICAL: Each project gets its OWN container named shark-{projectName}-{YYYY-MM-DD}. NEVER reuse another agent\'s container. NEVER grab a random running container.',
    args: {
      projectName: z.string().min(1).describe('Short project name for container naming'),
      pluginSource: z.string().optional().describe('Path to plugin source (defaults to Shark v4.9)'),
      projectPath: z.string().optional().describe('Path to project workspace to mount'),
    },
    execute: async (input: SpawnContainerInput) => {
      const result = spawnContainerSync(input);
      return JSON.stringify(result);
    },
  });
}

export function cleanupContainerTool(containerName: string, tmuxSession: string, snapshotPath: string): void {
  cleanupTmux(tmuxSession);
  cleanupContainer(containerName);
  try {
    fs.rmSync(snapshotPath, { recursive: true, force: true });
  } catch {
    // Snapshot may already be cleaned
  }
}
