/**
 * shark-browser-test — Autonomous HTML/JS Visual Testing
 *
 * Combines browser (agent-browser) + vision (GLM-4.6V-Flash VLM)
 * for fully autonomous HTML/JS visual testing.
 *
 * Workflow:
 *   1. Validate HTML file exists
 *   2. Start python3 http.server in container
 *   3. Launch headless Chrome, load the HTML
 *   4. Inject error catcher, check runtime errors
 *   5. Check DOM elements
 *   6. Take screenshot
 *   7. Analyze screenshot with VLM
 *   8. Generate BrowserTestResult.json evidence
 *   9. Cleanup
 */

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validatePath } from '../shared/validate-path.js';

const VLM_HOST = process.env.VLM_HOST || "127.0.0.1";
const VLM_ENDPOINT = `http://${VLM_HOST}:8082/v1/chat/completions`;
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

    // Priority 3: any running container at all
    const first = lines[0].split('\t')[0];
    return first || null;
  } catch {
    return null;
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

function imageToBase64(imagePath: string): string {
  if (!fs.existsSync(imagePath)) throw new Error(`File not found: ${imagePath}`);
  return Buffer.from(fs.readFileSync(imagePath)).toString('base64');
}

export function createSharkBrowserTestTool() {
  return tool({
    description: 'Autonomous HTML/JS visual testing. Opens an HTML file in headless Chrome for Testing, checks for runtime errors, validates DOM structure, takes a screenshot, and analyzes it with VLM vision. Generates BrowserTestResult.json evidence for the TEST gate.',
    args: {
      action: z.enum(['run']).describe('Action: run browser test on an HTML file'),
      file: z.string().min(1).describe('Absolute path to the HTML file to test'),
      port: z.number().optional().default(9999).describe('HTTP server port (default: 9999)'),
      container: z.string().optional().describe('Target container name (auto-detected if omitted)'),
    },
    execute: async (args: { action: 'run'; file: string; port?: number; container?: string }) => {
      const { file, port, container: explicitContainer } = args;

      if (!fs.existsSync(file)) {
        return JSON.stringify({
          success: false, error: `File not found: ${file}`,
          browserTestResult: null,
        });
      }

      let container = explicitContainer || '';
      if (!container) {
        const found = findTestContainer();
        if (!found) {
          return JSON.stringify({
            success: false, error: 'No test container found. Start one with shark-spawn-container first.',
            browserTestResult: null,
          });
        }
        container = found;
      }

      const fileName = path.basename(file);
      const fileDir = path.resolve(path.dirname(file));
      const testId = `browser-test-${Date.now()}`;
      const screenshotPath = `/tmp/${testId}-screenshot.png`;
      const browserTestDir = path.join(process.cwd(), '.shark', 'evidence', 'test');

      const result = {
        suite: 'shark-browser-test',
        file,
        syntaxPass: false,
        runtimeErrors: [] as string[],
        domCheck: {} as Record<string, unknown>,
        visualAnalysis: '',
        screenshotPath,
        overallPassed: false,
        testTimestamp: new Date().toISOString(),
        container,
      };

      try {
        fs.mkdirSync(validatePath(browserTestDir, true), { recursive: true });
      } catch (err) {
        console.error('[ERROR] shark-browser-test: execute:', err instanceof Error ? err.message : String(err));
      }

      try {
        dockerExec(container, 'pkill -f "python3 -m http.server" 2>/dev/null; true');
      } catch (err) {
        console.error('[ERROR] shark-browser-test: execute:', err instanceof Error ? err.message : String(err));
      }

      try {
        dockerExec(container, `cd ${JSON.stringify(fileDir)} && python3 -m http.server ${port} --bind 127.0.0.1 &>/dev/null &`);
      } catch (httpErr: unknown) {
        result.runtimeErrors.push(`HTTP server start failed: ${httpErr instanceof Error ? httpErr.message : String(httpErr)}`);
      }

      try {
        dockerExec(container, `agent-browser open "http://127.0.0.1:${port}/${fileName}" 2>&1`);
      } catch (browserErr: unknown) {
        result.runtimeErrors.push(`Browser open failed: ${browserErr instanceof Error ? browserErr.message : String(browserErr)}`);
      }

      await new Promise(r => setTimeout(r, 3000));

      try {
        const errorCheck = dockerExec(container, `agent-browser eval "
          window.__testErrors = [];
          window.__testLogs = [];
          const origOnError = window.onerror;
          window.onerror = function(msg, url, line, col, err) {
            window.__testErrors.push(JSON.stringify({msg: msg, line: line, col: col}));
            if (origOnError) return origOnError.apply(this, arguments);
            return true;
          };
          const origConsoleError = console.error;
          console.error = function(...args) {
            window.__testErrors.push(args.map((a: unknown) => String(a)).join(' '));
            origConsoleError.apply(console, args);
          };
          JSON.stringify({ready: true, url: window.location.href});
        " 2>&1`);
        result.syntaxPass = true;
      } catch (err) {
        console.error('[ERROR] shark-browser-test: execute:', err instanceof Error ? err.message : String(err));
      }

      await new Promise(r => setTimeout(r, 1000));

      try {
        const errors = dockerExec(container, `agent-browser eval "JSON.stringify(window.__testErrors)" 2>&1`);
        const parsed = JSON.parse(errors) as unknown[];
        if (Array.isArray(parsed)) {
          result.runtimeErrors = parsed;
        }
      } catch (err) {
        console.error('[ERROR] shark-browser-test: execute:', err instanceof Error ? err.message : String(err));
      }

      try {
        const domResult = dockerExec(container, `agent-browser eval "
          JSON.stringify({
            hasCanvas: !!document.querySelector('canvas'),
            canvasCount: document.querySelectorAll('canvas').length,
            hasScript: !!document.querySelector('script'),
            hasBody: !!document.body,
            bodyLength: document.body ? document.body.innerHTML.length : 0,
            title: document.title || '',
            doctype: document.doctype ? document.doctype.name : 'none',
          })
        " 2>&1`);
        const domData = JSON.parse(domResult) as Record<string, unknown>;
        result.domCheck = domData;
      } catch (err) {
        console.error('[ERROR] shark-browser-test: execute:', err instanceof Error ? err.message : String(err));
      }

      try {
        dockerExec(container, `agent-browser screenshot "${screenshotPath}" 2>&1`);
      } catch (err) {
        console.error('[ERROR] shark-browser-test: execute:', err instanceof Error ? err.message : String(err));
      }

      try {
        const screenshotB64 = dockerExec(container, `cat "${screenshotPath}" | base64 -w0 2>/dev/null || cat "${screenshotPath}" | base64 2>/dev/null`);
        if (screenshotB64 && screenshotB64.length > 100) {
          const vlmPayload = JSON.stringify({
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: 'Analyze this game screenshot in detail. What do you see? Identify any visual defects, rendering errors, missing elements, layout problems, or UI issues. Describe the game state, visible elements, colors, text, and overall quality.' },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotB64}` } },
              ],
            }],
            max_tokens: 500,
            temperature: 0.1,
          });

          try {
            // [R13-SAFE] VLM_ENDPOINT=constant, vlmPayload=JSON.stringify output
            const vlmResult = execSync(
              `curl -s --max-time 540 ${VLM_ENDPOINT} -H "Content-Type: application/json" -d ${JSON.stringify(vlmPayload)}`,
              { encoding: 'utf-8', timeout: 130000 },
            );
            const vlmData = JSON.parse(vlmResult) as Record<string, unknown>;
            result.visualAnalysis = vlmData.choices?.[0]?.message?.content || '';
          } catch (err) {
            console.error('[ERROR] shark-browser-test: execute:', err instanceof Error ? err.message : String(err));
          }
        }
      } catch (err) {
        console.error('[ERROR] shark-browser-test: execute:', err instanceof Error ? err.message : String(err));
      }

      try {
        dockerExec(container, 'agent-browser close 2>&1');
      } catch (err) {
        console.error('[ERROR] shark-browser-test: execute:', err instanceof Error ? err.message : String(err));
      }
      try {
        dockerExec(container, 'pkill -f "python3 -m http.server" 2>/dev/null; true');
      } catch (err) {
        console.error('[ERROR] shark-browser-test: execute:', err instanceof Error ? err.message : String(err));
      }

      const hasFatalErrors = result.runtimeErrors.length > 0;
      const hasRequiredDom = result.domCheck && (result.domCheck as Record<string, unknown>).hasCanvas === true;
      result.overallPassed = !hasFatalErrors && !!hasRequiredDom;

      try {
        fs.mkdirSync(validatePath(browserTestDir, true), { recursive: true });
        fs.writeFileSync(
          path.join(validatePath(browserTestDir, true), 'BrowserTestResult.json'),
          JSON.stringify(result, null, 2),
        );
      } catch (err) {
        console.error('[ERROR] shark-browser-test: execute:', err instanceof Error ? err.message : String(err));
      }

      return JSON.stringify({
        success: result.overallPassed,
        browserTestResult: result,
      }, null, 2);
    },
  });
}
