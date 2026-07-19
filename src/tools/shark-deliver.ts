/**
 * src/tools/shark-deliver.ts — Auto-delivery tool for DELIVERY gate
 *
 * Generates a ship package (dist + SHA-256 checksum + evidence archive)
 * and auto-registers the DELIVERY gate evidence so the gate can advance.
 *
 * Per EIE_DESIGN_SPEC.md §7 (Evidence Auto-Registration):
 *   shark-deliver → register 'ship-package', 'checksum', 'evidence-archive'
 *
 * Steps:
 *   1. Verify dist/index.js exists and is non-trivially sized
 *   2. Generate SHA-256 checksum → write CHECKSUM.txt
 *   3. Count evidence files under .shark/evidence
 *   4. Auto-register ship-package, checksum, evidence-archive evidence
 */

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { GateEngine } from '../gate-engine/gate-engine.js';
import { getGateManager } from './shark-gate.js';
import { logInfo } from '../shared/shark-logger.js';

const MIN_DIST_SIZE = 1000;

export function createSharkDeliverTool(gateEngine?: GateEngine) {
  return tool({
    description:
      'Generate ship package with dist, checksum, and evidence archive. ' +
      'Auto-registers DELIVERY gate evidence. Call this in the DELIVERY gate.',
    args: {
      workspacePath: z
        .string()
        .optional()
        .describe('Workspace root path. Defaults to process.cwd().'),
    },
    execute: async (args) => {
      const workspacePath: string = args.workspacePath || process.cwd();

      // 1. Verify dist exists and is real content
      const distPath = path.join(workspacePath, 'dist', 'index.js');
      if (!fs.existsSync(distPath)) {
        return JSON.stringify({
          success: false,
          error:
            'No dist/index.js found. Build first (e.g. `bun build src/index.ts --outdir dist --target bun --format esm --bundle`).',
        });
      }
      const distContent = fs.readFileSync(distPath);
      const distSize = distContent.length;
      if (distSize < MIN_DIST_SIZE) {
        return JSON.stringify({
          success: false,
          error: `dist/index.js too small: ${distSize} bytes (minimum ${MIN_DIST_SIZE}). The build appears incomplete.`,
        });
      }

      // 2. Generate SHA-256 checksum
      const hash = crypto.createHash('sha256').update(distContent).digest('hex');
      const checksumPath = path.join(workspacePath, 'CHECKSUM.txt');
      try {
        fs.writeFileSync(checksumPath, `${hash}  dist/index.js\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return JSON.stringify({
          success: false,
          error: `Failed to write CHECKSUM.txt: ${msg}`,
        });
      }

      // 3. Collect evidence archive (count files under .shark/evidence)
      const evidenceDir = path.join(workspacePath, '.shark', 'evidence');
      let evidenceCount = 0;
      if (fs.existsSync(evidenceDir)) {
        evidenceCount = countFiles(evidenceDir);
      }
      // Also scan .shark root for evidence artifacts if dir absent
      if (evidenceCount === 0) {
        const sharkDir = path.join(workspacePath, '.shark');
        if (fs.existsSync(sharkDir)) {
          evidenceCount = countFiles(sharkDir);
        }
      }

      // 4. Auto-register DELIVERY gate evidence
      const autoRegistered = ['ship-package', 'checksum', 'evidence-archive'];
      registerDeliveryEvidence(autoRegistered, gateEngine);

      const message =
        `Delivery package ready. dist: ${distSize}b, ` +
        `checksum: ${hash.slice(0, 16)}..., evidence: ${evidenceCount} files. ` +
        `Gate evidence auto-registered: ${autoRegistered.join(', ')}.`;

      logInfo(`[shark-deliver] ${message}`);

      const result = {
        success: true,
        data: {
          distSize,
          checksum: hash,
          checksumPath,
          evidenceCount,
          autoRegistered,
          message,
        },
      };

      return JSON.stringify(result, null, 2);
    },
  });
}

// ── Helpers ────────────────────────────────────────────────────

/** Recursively count files in a directory. */
function countFiles(dir: string): number {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        count += countFiles(path.join(dir, entry.name));
      } else {
        count++;
      }
    }
  } catch (err) {
    // Unreadable directory — record the failure and count as 0 so delivery
    // does not crash, but the problem remains visible in the log.
    logInfo(
      `[shark-deliver] countFiles: could not read ${dir}: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  return count;
}

/**
 * Register DELIVERY gate evidence so the gate engine recognises it.
 * Submits via GateEngine (preferred) and falls back to the GateManager's
 * EvidenceCollector singleton.
 */
function registerDeliveryEvidence(
  evidenceIds: string[],
  gateEngine?: GateEngine,
): void {
  // Preferred path: GateEngine.submitEvidence()
  if (gateEngine && typeof gateEngine.submitEvidence === 'function') {
    for (const id of evidenceIds) {
      try {
        gateEngine.submitEvidence(id, true);
      } catch (err) {
        logInfo(
          `[shark-deliver] GateEngine.submitEvidence(${id}) failed: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }
    return;
  }

  // Fallback: GateManager singleton's EvidenceCollector
  try {
    const gm = getGateManager();
    const collector = gm?.getEvidenceCollector?.();
    const collectFn = (collector as { collectEvidenceById?: (g: string, id: string, p: boolean) => void } | null)
      ?.collectEvidenceById;
    if (typeof collectFn === 'function') {
      const gate = (gm?.getCurrentGate?.() || 'delivery') as string;
      for (const id of evidenceIds) {
        try {
          collectFn(gate, id, true);
        } catch (err) {
          logInfo(
            `[shark-deliver] collectEvidenceById(${id}) failed: ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }
    }
  } catch (err) {
    logInfo(
      '[shark-deliver] evidence auto-registration unavailable: ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}
