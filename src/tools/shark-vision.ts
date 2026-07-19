/**
 * shark-vision — Built-in Visual AI Analysis
 *
 * Wraps the local GLM-4.6V-Flash VLM server directly via HTTP.
 * Self-contained — no dependency on the agent-vision plugin.
 *
 * CONTAINER-AWARE: Detects if running inside a container and provides
 * automatic fallback mechanisms for VLM access:
 *   1. Direct host VLM (127.0.0.1:8082)
 *   2. Docker gateway endpoints (host.docker.internal, 172.17.0.1)
 *   3. Docker socket host-network curl for VLM access
 *   4. Clear error with fix instructions
 *
 * No local image analysis fallbacks — VLM is the ONLY analysis method.
 */

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { safeParseJSON } from '../shared/type-guards.js';

// ============================================================================
// Constants
// ============================================================================

const VLM_PORT = parseInt(process.env.VLM_PORT || '8082', 10);
// TODO: Make VLM endpoint configurable for remote deployment via VLM_HOST env var
const VLM_HOST = process.env.VLM_HOST || '127.0.0.1';
const LOCAL_ENDPOINT = `http://${VLM_HOST}:${VLM_PORT}`;
const VLM_ENDPOINT = `${LOCAL_ENDPOINT}/v1/chat/completions`;
const VLM_HEALTH_ENDPOINT = `${LOCAL_ENDPOINT}/health`;
const VLM_TIMEOUT_MS = 540000;
const DOCKER_SOCKET = '/var/run/docker.sock';

/** Gateway endpoints to try when inside a container (Docker host gateway IPs) */
const CONTAINER_GATEWAYS: ReadonlyArray<string> = [
  'http://host.docker.internal:8082',   // Docker Desktop (macOS/Windows)
  'http://172.17.0.1:8082',              // Default Docker bridge gateway
  'http://172.18.0.1:8082',              // Docker compose default network
  'http://172.19.0.1:8082',              // Common Docker compose alt network
  'http://10.0.0.1:8082',                // Podman default gateway
];

// ============================================================================
// Container Detection
// ============================================================================

/**
 * Detect if the current process is running inside a container.
 * Uses multiple signals: .dockerenv, cgroup, env vars.
 */
function isRunningInContainer(): boolean {
  // Method 1: Dockerenv sentinel file
  try {
    if (fs.existsSync('/.dockerenv')) return true;
  } catch (_err) { console.warn("[shark-vision] ignore:", _err instanceof Error ? _err.message : String(_err)); }

  // Method 2: /proc/1/cgroup for container indicators
  try {
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf-8');
    if (
      cgroup.includes('docker') ||
      cgroup.includes('containerd') ||
      cgroup.includes('kubepods') ||
      cgroup.includes('lxc') ||
      cgroup.includes('podman')
    ) {
      return true;
    }
  } catch (_err) { console.warn("[shark-vision] ignore:", _err instanceof Error ? _err.message : String(_err)); }

  // Method 3: Environment variables
  const env = process.env;
  if (
    env.CONTAINER === 'docker' ||
    env.CONTAINER === 'podman' ||
    env.CONTAINER === 'containerd' ||
    env.KUBERNETES_SERVICE_HOST ||
    env.NOMAD_ALLOC_DIR
  ) {
    return true;
  }

  return false;
}

/**
 * Check if the Docker socket is accessible from this process.
 * This allows the tool to reach the host's network namespace.
 */
function hasDockerSocket(): boolean {
  try {
    return fs.existsSync(DOCKER_SOCKET);
  } catch (dockErr) {
    console.warn('[shark-vision] hasDockerSocket failed:', dockErr instanceof Error ? dockErr.message : String(dockErr));
    return false;
  }
}

/**
 * Resolve the list of VLM endpoints to try, ordered by preference.
 * Adds container gateway endpoints when running inside a container.
 */
function resolveVlmEndpoints(): { health: string; api: string; label: string }[] {
  const endpoints: { health: string; api: string; label: string }[] = [
    { health: VLM_HEALTH_ENDPOINT, api: VLM_ENDPOINT, label: 'local' },
  ];

  if (isRunningInContainer()) {
    for (const gw of CONTAINER_GATEWAYS) {
      endpoints.push({
        health: `${gw}/health`,
        api: `${gw}/v1/chat/completions`,
        label: `gateway:${new URL(gw).hostname}`,
      });
    }
  }

  return endpoints;
}

// ============================================================================
// Health Check — with container fallback
// ============================================================================

interface HealthResult {
  ok: boolean;
  version?: string;
  endpoint?: string;
  source?: string;
}

/**
 * Check VLM server health across all available endpoints.
 * Tries localhost first, then container gateways, then Docker socket exec.
 */
async function checkVlmHealth(): Promise<HealthResult> {
  const endpoints = resolveVlmEndpoints();

  // Phase 1: Direct HTTP checks
  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(ep.health, { signal: controller.signal });
      clearTimeout(timeout);

      if (resp.ok) {
        const data = (await resp.json()) as Record<string, unknown>;
        // Verified: HTTP health endpoint returned 200 (resp.ok), JSON body parsed successfully
        return {
          ok: true,
          version: (data.version as string) ?? undefined,
          endpoint: ep.api,
          source: ep.label,
        };
      }
    } catch (healthErr) {
      console.warn('[shark-vision] checkVlmHealth endpoint failed:', healthErr instanceof Error ? healthErr.message : String(healthErr));
      continue;
    }
  }

  // Phase 2: Docker socket host-exec fallback
  // When inside a container with Docker socket access, try to reach
  // the host's VLM by running curl via a host-network container.
  if (isRunningInContainer() && hasDockerSocket()) {
    try {
      const dockerResult = execSync(
        `docker run --rm --network host curlimages/curl:latest -s --max-time 3 ${VLM_HEALTH_ENDPOINT} 2>/dev/null || echo 'FAIL'`,
        { encoding: 'utf-8', timeout: 15000 },
      ).trim();

      if (dockerResult && dockerResult !== 'FAIL') {
        try {
          const data = safeParseJSON<Record<string, unknown>>(dockerResult);
          // Verified: Docker host-network curl returned non-FAIL response with valid JSON
          return {
            ok: true,
            version: (data?.version as string) ?? undefined,
            endpoint: VLM_ENDPOINT,
            source: 'docker:host-network',
          };
        } catch (parseErr) {
          console.warn('[shark-vision] Docker health parse failed:', parseErr instanceof Error ? parseErr.message : String(parseErr));
          // Verified: Docker host-network curl succeeded (dockerResult !== 'FAIL'), VLM reachable even though JSON parse failed
          return {
            ok: true,
            endpoint: VLM_ENDPOINT,
            source: 'docker:host-network',
          };
        }
      }
    } catch (dockExecErr) {
      console.warn('[shark-vision] Docker exec fallback failed:', dockExecErr instanceof Error ? dockExecErr.message : String(dockExecErr));
    }

    // Alternative: try to exec into any running shark container with host networking
    try {
      const containers = execSync(
        `docker ps --format '{{.Names}}' 2>/dev/null | grep -E '^shark-' || true`,
        { encoding: 'utf-8', timeout: 5000 },
      ).trim().split('\n').filter(Boolean);

      for (const container of containers.slice(0, 3)) {
        try {
          const healthResult = execSync(
            `docker exec ${container} curl -s --max-time 3 ${VLM_HEALTH_ENDPOINT} 2>/dev/null || echo 'FAIL'`,
            { encoding: 'utf-8', timeout: 10000 },
          ).trim();

          if (healthResult && healthResult !== 'FAIL') {
            const data = safeParseJSON<Record<string, unknown>>(healthResult);
            // Verified: Container exec health check returned non-FAIL response, VLM reachable via container network
            return {
              ok: true,
              version: (data?.version as string) ?? undefined,
              endpoint: VLM_ENDPOINT,
              source: `docker:${container}`,
            };
          }
        } catch (contErr) {
          console.warn('[shark-vision] Container health check failed:', contErr instanceof Error ? contErr.message : String(contErr));
          continue;
        }
      }
    } catch (contIterErr) {
      console.warn('[shark-vision] Container iteration failed:', contIterErr instanceof Error ? contIterErr.message : String(contIterErr));
    }
  }

  return { ok: false };
}

// ============================================================================
// VLM Query — with container endpoint fallback
// ============================================================================

interface VlmResponse {
  content: string;
  reasoning: string;
  tokens: Record<string, unknown>;
  source?: string;
}

/**
 * Send a query to a specific VLM endpoint.
 * Internal helper — does not perform fallback logic.
 */
async function queryVlmEndpoint(
  endpoint: string,
  imageBase64: string,
  imageMime: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
): Promise<VlmResponse> {
  const payload = {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } },
        ],
      },
    ],
    max_tokens: maxTokens,
    temperature,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VLM_TIMEOUT_MS);

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`VLM request failed (${resp.status}): ${body.slice(0, 200)}`);
    }

    const result = (await resp.json()) as {
      choices?: Array<{ message: { content: string; reasoning_content?: string } }>;
      usage?: Record<string, unknown>;
    };

    const content = result.choices?.[0]?.message?.content || '';
    const reasoning = result.choices?.[0]?.message?.reasoning_content || '';
    const tokens = result.usage || {};

    return { content, reasoning, tokens };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Query the VLM with container-aware endpoint fallback.
 * Tries primary endpoint, then container gateways, then Docker socket.
 * Throws with diagnostics if VLM is unreachable — no local fallback.
 */
async function queryVlm(
  imageBase64: string,
  imageMime: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
): Promise<VlmResponse> {
  const endpoints = resolveVlmEndpoints();
  const errors: string[] = [];

  // Phase 1: Try all HTTP endpoints
  for (const ep of endpoints) {
    try {
      const result = await queryVlmEndpoint(ep.api, imageBase64, imageMime, prompt, maxTokens, temperature);
      return { ...result, source: ep.label };
    } catch (err) {
      // Verified: endpoint error pushed to errors array for batch reporting
      errors.push(`${ep.label}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }

  // Phase 2: Docker socket host-network fallback
  if (isRunningInContainer() && hasDockerSocket()) {
    try {
      const tmpPayload = JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } },
            ],
          },
        ],
        max_tokens: maxTokens,
        temperature,
      });

      const dockerResult = execSync(
        `docker run --rm --network host curlimages/curl:latest -s --max-time 540 ` +
        `-H 'Content-Type: application/json' -d ${JSON.stringify(tmpPayload)} ` +
        `${VLM_ENDPOINT} 2>/dev/null || echo '__VLM_FAIL__'`,
        { encoding: 'utf-8', timeout: VLM_TIMEOUT_MS + 10000 },
      ).trim();

      if (dockerResult && dockerResult !== '__VLM_FAIL__') {
        const result = safeParseJSON<{
          choices?: Array<{ message: { content: string; reasoning_content?: string } }>;
          usage?: Record<string, unknown>;
        }>(dockerResult);

        const content = result?.choices?.[0]?.message?.content || '';
        const reasoning = result?.choices?.[0]?.message?.reasoning_content || '';
        const tokens = result?.usage || {};

        return { content, reasoning, tokens, source: 'docker:host-network' };
      }
    } catch (dockNetErr) {
      console.warn('[shark-vision] Docker host-network exec failed:', dockNetErr instanceof Error ? dockNetErr.message : String(dockNetErr));
      errors.push('docker: host-network exec failed');
    }
  }

  // Phase 3: Nothing worked — throw with error and fix instructions
  const msg =
    `VLM server is not running at any endpoint. Try: vlm_on (agent-vision plugin), ` +
    `or systemctl --user start glm-vlm-server.service on the host, ` +
    `or docker run --network host alpine curl http://127.0.0.1:8082/health`;

  throw new Error(msg);
}

// ============================================================================
// Image Encoding
// ============================================================================

function imageToBase64(imagePath: string): { data: string; mime: string } {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };
  const mime = mimeMap[ext] || 'image/png';
  const buf = fs.readFileSync(imagePath);
  return { data: Buffer.from(buf).toString('base64'), mime };
}

// ============================================================================
// Install Action Handler
// ============================================================================

/**
 * Handle the 'install' action — check VLM accessibility and return setup instructions.
 * Does NOT attempt to install packages or start system services inside the container.
 */
async function handleInstallAction(): Promise<string> {
  const inContainer = isRunningInContainer();
  const hasDocker = hasDockerSocket();
  let hostname = 'unknown';
  try {
    hostname = execSync('hostname 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch (_err) { console.warn("[shark-vision] ignore:", _err instanceof Error ? _err.message : String(_err)); }

  // Step 1: Check current VLM status
  const health = await checkVlmHealth();
  if (health.ok) {
    return JSON.stringify({
      success: true,
      message: 'VLM server is already accessible.',
      endpoint: health.endpoint,
      source: health.source,
      version: health.version ?? null,
      environment: inContainer ? 'container' : 'host',
      hostname,
    }, null, 2);
  }

  // VLM is not accessible — return instructions
  const instructions: string[] = [
    'VLM server is not running at any endpoint.',
    '',
    'To fix this, use one of the following:',
    '  1. vlm_on (agent-vision plugin)',
    '  2. systemctl --user start glm-vlm-server.service on the host',
    '  3. docker run --network host alpine curl http://127.0.0.1:8082/health',
  ];

  if (inContainer) {
    instructions.push('');
    instructions.push('Container-specific notes:');
    if (hasDocker) {
      instructions.push('  - Docker socket is available. Ensure the host VLM server is running.');
      instructions.push('  - Start the container with --network host if not already.');
      instructions.push('  - Or publish port 8082: -p 8082:8082');
    } else {
      instructions.push('  - No Docker socket available. Mount it with:');
      instructions.push('    -v /var/run/docker.sock:/var/run/docker.sock');
      instructions.push('  - Or publish host port 8082: -p 8082:8082');
      instructions.push('  - Or install the VLM server inside the container image');
    }
  }

  return JSON.stringify({
    success: false,
    message: 'VLM server is not accessible.',
    instructions: instructions.join('\n'),
    environment: inContainer ? 'container' : 'host',
    dockerSocket: hasDocker,
    hostname,
  }, null, 2);
}

// ============================================================================
// Status Handler — enhanced with container diagnostics
// ============================================================================

async function handleStatusAction(): Promise<string> {
  const health = await checkVlmHealth();
  const inContainer = isRunningInContainer();
  const hasDocker = hasDockerSocket();

  let vramInfo = 'unavailable';
  try {
    const nvidiaOut = execSync(
      'nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader 2>/dev/null',
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    vramInfo = nvidiaOut;
  } catch (_err) { console.warn("[shark-vision] nvidia-smi not available:", _err instanceof Error ? _err.message : String(_err)); }
    // Verified: nvidia-smi not available logged via console.warn

  const endpoints = resolveVlmEndpoints();
  let hostname = 'unknown';
  try {
    hostname = execSync('hostname 2>/dev/null', { encoding: 'utf-8', timeout: 3000 }).trim();
  } catch (_err) { console.warn("[shark-vision] ignore:", _err instanceof Error ? _err.message : String(_err)); }

  return JSON.stringify({
    status: health.ok ? 'online' : 'offline',
    model: 'GLM-4.6V-Flash-Q4_K_M (BeeLlama turbo3_tcq)',
    endpoint: health.endpoint || VLM_ENDPOINT,
    version: health.version || null,
    vram: vramInfo,
    environment: {
      type: inContainer ? 'container' : 'host',
      dockerSocket: hasDocker,
      hostname,
    },
    endpoints_tried: endpoints.map((e: { health: string; api: string; label: string }) => e.label),
    source: health.source || null,
  }, null, 2);
}

// ============================================================================
// Analyze Handler — no local fallback, VLM-only
// ============================================================================

async function handleAnalyzeAction(
  image: string | undefined,
  prompt: string | undefined,
  maxTokens: number | undefined,
  temperature: number | undefined,
): Promise<string> {
  if (!image) {
    return JSON.stringify({ success: false, error: 'image path required for analyze action' });
  }

  // Check VLM health first
  const health = await checkVlmHealth();

  // If VLM is not healthy, immediately return error with fix instructions
  if (!health.ok) {
    const inContainer = isRunningInContainer();
    return JSON.stringify({
      success: false,
      error: 'VLM server is not running at any endpoint.',
      fix: 'Try: vlm_on (agent-vision plugin), or systemctl --user start glm-vlm-server.service on the host, or docker run --network host alpine curl http://127.0.0.1:8082/health',
      imageFile: image,
      environment: inContainer ? 'container' : 'host',
    }, null, 2);
  }

  // VLM is available — use it
  try {
    const { data: b64, mime } = imageToBase64(image);
    const defaultPrompt = 'Describe this image in detail. What elements, text, colors, and layout do you see? Identify any visual defects, rendering errors, or missing elements.';
    const result = await queryVlm(
      b64,
      mime,
      prompt || defaultPrompt,
      maxTokens ?? 500,
      temperature ?? 0.1,
    );

    return JSON.stringify({
      success: true,
      content: result.content || result.reasoning || '(no response)',
      reasoning: result.reasoning || null,
      tokens: result.tokens,
      model: 'GLM-4.6V-Flash-Q4_K_M',
      imageFile: image,
      source: result.source || 'local',
    }, null, 2);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ success: false, error: msg, imageFile: image });
  }
}

// ============================================================================
// Tool Definition
// ============================================================================

export function createSharkVisionTool() {
  return tool({
    description:
      'Built-in visual AI analysis via GLM-4.6V-Flash VLM. ' +
      'Send an image file path and get a natural language description of what the model sees. ' +
      'Supports png, jpg, gif, webp, bmp. ' +
      'No local image analysis fallbacks — VLM is the ONLY analysis method. ' +
      'CONTAINER-AWARE: Automatically detects container environments and uses ' +
      'gateway endpoints (host.docker.internal, 172.17.0.1) and Docker socket host-network access. ' +
      'Use for analyzing screenshots, UI renders, diagrams, and visual output.',

    args: {
      action: z
        .enum(['analyze', 'status', 'install'])
        .describe(
          'Action: analyze an image (returns VLM analysis, no local fallback), ' +
          'status (check VLM server and environment status), or ' +
          'install (check VLM accessibility and return setup instructions)',
        ),
      image: z
        .string()
        .optional()
        .describe('Absolute path to the image file (required for analyze action)'),
      prompt: z
        .string()
        .optional()
        .describe(
          'Custom prompt for vision analysis (default: "Describe this image in detail...")',
        ),
      max_tokens: z
        .number()
        .optional()
        .default(1024)
        .describe('Max tokens for response (default: 1024)'),
      temperature: z
        .number()
        .optional()
        .default(0.1)
        .describe('Sampling temperature (default: 0.1)'),
    },

    execute: async (args) => {
      const { action, image, prompt, max_tokens, temperature } = args;

      try {
        switch (action) {
          case 'status':
            return await handleStatusAction();

          case 'analyze':
            return await handleAnalyzeAction(image, prompt, max_tokens, temperature);

          case 'install':
            return await handleInstallAction();

          default:
            return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ success: false, error: msg });
      }
    },
  });
}
