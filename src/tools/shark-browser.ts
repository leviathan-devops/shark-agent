/**
 * shark-browser — Built-in Headless Browser Automation
 *
 * Wraps agent-browser v0.21.2 CLI for autonomous browser testing.
 * Runs Chrome for Testing inside the test container via docker exec.
 *
 * Self-contained: the tool installs agent-browser on-demand if missing.
 * No dependency on host browser or external plugins.
 */

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CONTAINER_IMAGE = 'opencode-test:1.14.34';
const BROWSER_IMAGE = 'opencode-test-browser:1.0';

/**
 * Get the Docker image name for a running container.
 * Returns empty string on failure.
 */
function getContainerImage(containerName: string): string {
  try {
    return execSync(
      `docker inspect --format '{{.Config.Image}}' "${containerName}" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
  } catch {
      console.warn('[shark-browser] getContainerImage failed');
      return '';
    }
  }
  
  /**
   * Find a running container for browser operations.
 *
 * Priority order:
 *   1. Containers using opencode-test-browser:1.0 (has Chrome pre-installed)
 *   2. Containers with 'shark' in their name
 *   3. Any running container at all
 *
 * Works with any container regardless of naming convention.
 */
function findTestContainer(): string | null {
  try {
    const output = execSync('docker ps --format "{{.Names}}\t{{.Image}}" 2>/dev/null', {
      encoding: 'utf-8', timeout: 5000,
    }).trim();
    if (!output) return null;

    const lines = output.split('\n').filter(Boolean);

    // Priority 1: containers using the browser image (Chrome pre-installed)
    const browserLines = lines.filter((l: string) => l.includes(BROWSER_IMAGE));
    if (browserLines.length > 0) {
      return browserLines[0].split('\t')[0];
    }

    // Priority 2: containers with 'shark' in the name
    const sharkLines = lines.filter((l: string) => {
      const name = l.split('\t')[0] || '';
      return name.includes('shark');
    });
    if (sharkLines.length > 0) {
      return sharkLines[0].split('\t')[0];
    }

    // Priority 3: a running container (last resort)
    const first = lines[0].split('\t')[0];
    return first || null;
  } catch {
    console.warn('[shark-browser] findTestContainer failed');
    return null;
  }
}

function ensureAgentBrowser(containerName: string): void {
  try {
    // Check whether the container has Chrome pre-installed via the browser image
    const image = getContainerImage(containerName);
    const hasPreinstalledChrome = image.includes(BROWSER_IMAGE);

    // Check if agent-browser CLI is already available
    const result = execSync(
      `docker exec ${containerName} sh -c "command -v agent-browser && agent-browser --version" 2>/dev/null || echo MISSING`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (result === 'MISSING') {
      // Install agent-browser CLI (npm package, fast)
      execSync(
        `docker exec ${containerName} sh -c "npm install -g agent-browser@0.21.2"`,
        { encoding: 'utf-8', timeout: 60000 }
      );
    }

    // Only install Chrome (agent-browser install --with-deps) if NOT using
    // the browser image which already has Chrome pre-installed.
    if (!hasPreinstalledChrome) {
      // Check if Chrome is actually installed before running the full install
      const existingChrome = findChromePath(containerName);
      if (!existingChrome) {
        execSync(
          `docker exec ${containerName} sh -c "agent-browser install --with-deps"`,
          { encoding: 'utf-8', timeout: 120000 }
        );
      }
    }
  } catch (installErr) {
    throw new Error(
      `Failed to ensure agent-browser: ${installErr instanceof Error ? installErr.message : String(installErr)}`
    );
  }
}

function dockerExec(container: string, command: string): string {
  try {
    return execSync(`docker exec ${container} sh -c ${JSON.stringify(command)}`, {
      encoding: 'utf-8', timeout: 60000, maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch (execErr: unknown) {
    throw new Error(`Container exec failed: ${execErr instanceof Error ? execErr.message : String(execErr)}`);
  }
}

function findChromePath(container: string): string {
  const possibilities = [
    '~/.agent-browser/browsers/chrome-*/chrome',
    '/root/.agent-browser/browsers/chrome-*/chrome',
    '/usr/local/lib/node_modules/agent-browser/chrome-linux64/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  for (const p of possibilities) {
    try {
      const result = dockerExec(container, `ls ${p} 2>/dev/null | head -1`);
      if (result) {
        const chromePath = result.trim();
        if (chromePath && chromePath.length > 0) return chromePath;
      }
    } catch {
      console.warn('[shark-browser] findChromePath failed for: ' + p);
      continue;
    }
  }
  return '';
}

export function createSharkBrowserTool() {
  return tool({
    description: 'Built-in headless browser automation via agent-browser + Chrome for Testing. Install, open URLs, take screenshots, run JS eval, snapshot accessibility tree, click elements, wait, fill forms. Runs inside the test container — never on host.',
    args: {
      action: z.enum([
        'install', 'ensure-chrome', 'open', 'screenshot', 'snapshot', 'eval',
        'wait', 'click', 'fill', 'close', 'status',
      ]).describe('Browser action to execute'),
      url: z.string().optional().describe('URL or file:// path to open'),
      selector: z.string().optional().describe('CSS selector, accessibility ref, or timeout ms'),
      text: z.string().optional().describe('Text for fill action or key for press'),
      js: z.string().optional().describe('JavaScript code to evaluate'),
      file: z.string().optional().describe('Path to save screenshot output'),
      container: z.string().optional().describe('Target container name (auto-detected if omitted)'),
    },
    execute: async (args: Record<string, unknown>) => {
      const { action, url, selector, text, js, file } = args as { action: string; url?: string; selector?: string; text?: string; js?: string; file?: string; container?: string };
      let container = (args.container as string) || '';

      if (!container) {
        const found = findTestContainer();
        if (!found) {
          return JSON.stringify({ success: false, error: 'No test container found. Start one with shark-spawn-container first.' });
        }
        container = found;
      }

      if (action === 'install') {
        try {
          ensureAgentBrowser(container);
          const chromePath = findChromePath(container);
          const image = getContainerImage(container);
          return JSON.stringify({
            success: true,
            agentBrowser: true,
            chromeInstalled: !!chromePath,
            chromePath: chromePath || null,
            container,
            image,
            hasPreinstalledChrome: image.includes(BROWSER_IMAGE),
          });
        } catch (err: unknown) {
          return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err), container });
        }
      }

      // --- ensure-chrome: verify Chrome is installed, install if missing ---
      if (action === 'ensure-chrome') {
        try {
          // Make sure agent-browser CLI exists first
          const abCheck = execSync(
            `docker exec ${container} sh -c "command -v agent-browser" 2>/dev/null || echo MISSING`,
            { encoding: 'utf-8', timeout: 10000 }
          ).trim();
          if (abCheck === 'MISSING') {
            return JSON.stringify({
              success: false,
              error: 'agent-browser not installed. Run install action first.',
              container,
            });
          }

          const image = getContainerImage(container);
          const hasPreinstalledChrome = image.includes(BROWSER_IMAGE);
          let chromePath = findChromePath(container);

          if (!chromePath && !hasPreinstalledChrome) {
            // Install Chrome via agent-browser
            execSync(
              `docker exec ${container} sh -c "agent-browser install --with-deps"`,
              { encoding: 'utf-8', timeout: 120000 }
            );
            chromePath = findChromePath(container);
          }

          return JSON.stringify({
            success: true,
            chromeInstalled: !!chromePath,
            chromePath: chromePath || null,
            container,
            image,
            hasPreinstalledChrome,
            action: chromePath ? 'chrome_already_available' : 'chrome_installed',
          });
        } catch (err: unknown) {
          return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err), container });
        }
      }

      // --- status: report browser tool state ---
      if (action === 'status') {
        try {
          const abVersion = dockerExec(container, 'agent-browser --version 2>/dev/null || echo NOT_INSTALLED');
          const chromeDir = dockerExec(container, 'ls ~/.agent-browser/browsers/ 2>/dev/null || echo NO_BROWSER_DIR');
          const chromePath = findChromePath(container);
          const image = getContainerImage(container);
          return JSON.stringify({
            agentBrowser: abVersion.trim(),
            chrome: chromePath ? `installed at ${chromePath}` : 'not installed',
            chromePath: chromePath || null,
            browserDir: chromeDir.trim(),
            container,
            image,
            hasPreinstalledChrome: image.includes(BROWSER_IMAGE),
          });
        } catch (err: unknown) {
          return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      }

      ensureAgentBrowser(container);
      const hasChrome = findChromePath(container);
      if (!hasChrome && (action === 'open' || action === 'screenshot' || action === 'snapshot')) {
        return JSON.stringify({
          success: false, error: 'Chrome for Testing not installed. Run install or ensure-chrome action first.',
          container,
        });
      }

      try {
        let result: string;

        switch (action) {
          case 'open':
            if (!url) return JSON.stringify({ success: false, error: 'URL required for open action' });
            result = dockerExec(container, `agent-browser open "${url}" 2>&1`);
            break;

          case 'screenshot':
            if (!file) return JSON.stringify({ success: false, error: 'file path required for screenshot action' });
            result = dockerExec(container, `agent-browser screenshot "${file}" 2>&1`);
            if (!fs.existsSync(path.dirname(file)) && file.startsWith('/')) {
              try {
                fs.mkdirSync(path.dirname(file), { recursive: true });
              } catch (_err) { console.warn("[shark-browser] non-fatal:", _err instanceof Error ? _err.message : String(_err)); }
              try {
                result += '\n' + dockerExec(container, `cat "${file}" | base64`);
              } catch (_err) { console.warn("[shark-browser] non-fatal:", _err instanceof Error ? _err.message : String(_err)); }
    // Verified: non-fatal error logged via console.warn
            }
            break;

          case 'snapshot':
            result = dockerExec(container, `agent-browser snapshot 2>&1`);
            break;

          case 'eval':
            if (!js) return JSON.stringify({ success: false, error: 'js code required for eval action' });
            const escapedJs = js.replace(/"/g, '\\"');
            result = dockerExec(container, `agent-browser eval "${escapedJs}" 2>&1`);
            break;

          case 'wait': {
            const sel = selector || '500';
            if (/^\d+$/.test(sel)) {
              result = dockerExec(container, `agent-browser wait "${sel}" 2>&1`);
            } else {
              result = dockerExec(container, `agent-browser wait "${sel}" 2>&1`);
            }
            break;
          }

          case 'click':
            if (!selector) return JSON.stringify({ success: false, error: 'selector required for click action' });
            result = dockerExec(container, `agent-browser click "${selector}" 2>&1`);
            break;

          case 'fill':
            if (!selector || !text) return JSON.stringify({ success: false, error: 'selector and text required for fill action' });
            result = dockerExec(container, `agent-browser fill "${selector}" "${text}" 2>&1`);
            break;

          case 'close':
            result = dockerExec(container, `agent-browser close 2>&1`);
            break;

          default:
            return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
        }

        return JSON.stringify({ success: true, result, container });
      } catch (err: unknown) {
        return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err), container });
      }
    },
  });
}
