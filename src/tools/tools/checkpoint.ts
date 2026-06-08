/**
 * Checkpoint Tool — State persistence for Shark
 */
import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import type { StateStore } from '../shared/state-store.js';
import type { GateManager } from '../shared/gates.js';
import { GATE_CHAIN } from '../shared/gates.js';
import type { GateName } from '../shared/evidence.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

async function updateBuildJourney(
  versionsDir: string,
  phaseN: number,
  gate: GateName,
  iteration: string,
  timestamp: string
): Promise<void> {
  const journeyPath = path.join(path.dirname(versionsDir), 'BUILD_JOURNEY.md');
  const entry = `| Phase ${phaseN} | ${gate} | ${iteration} | ${timestamp} |\n`;

  let existing = '';
  try {
    existing = await fs.promises.readFile(journeyPath, 'utf-8');
  } catch {
    existing = '# Shark Build Journey\n\n| Phase | Gate | Iteration | Timestamp |\n| --- | --- | --- | --- |\n';
  }

  if (!existing.includes(`| Phase ${phaseN} | ${gate} |`)) {
    await fs.promises.writeFile(journeyPath, existing + entry);
  } else {
    const lines = existing.split('\n');
    const updated = lines.map((line) =>
      line.startsWith(`| Phase ${phaseN} | ${gate} |`)
        ? entry.trim()
        : line
    );
    await fs.promises.writeFile(journeyPath, updated.join('\n'));
  }
}

export async function createPhaseSnapshot(
  gm: GateManager,
  completedGate?: GateName
): Promise<string> {
  const cwd = process.cwd();
  const iteration = gm.getCurrentIteration();
  const gate = completedGate || gm.getCurrentGate();
  const gateIndex = GATE_CHAIN.indexOf(gate);
  const phaseN = gateIndex === -1 ? 0 : gateIndex + 1;

  const phaseDirName = `v4.9_phase${phaseN}_${gate}`;
  const versionsDir = path.join(cwd, '.shark', 'versions');
  const phaseDir = path.join(versionsDir, phaseDirName);
  const timestamp = new Date().toISOString();

  await fs.promises.mkdir(phaseDir, { recursive: true });

  for (const subdir of ['src', 'dist', 'compaction_survival']) {
    const srcPath = path.join(cwd, subdir);
    const destPath = path.join(phaseDir, subdir);
    try {
      await copyDir(srcPath, destPath);
    } catch {
      // Directory may not exist yet — skip
    }
  }

  const buildLogContent = `# Build Log — Phase ${phaseN}: ${gate}

**Iteration:** ${iteration}
**Gate:** ${gate}
**Timestamp:** ${timestamp}
**Status:** completed

## Artifacts Preserved
- \`src/\` — Full source tree
- \`dist/\` — Build output
- \`compaction_survival/\` — Compaction survival logs

## Gate State
\`\`\`json
${JSON.stringify(gm.getState(), null, 2)}
\`\`\`
`;
  await fs.promises.writeFile(path.join(phaseDir, 'BUILD_LOG.md'), buildLogContent);

  const versionContent = `# Version — ${iteration}

**Phase:** ${phaseN}
**Gate:** ${gate}
**Timestamp:** ${timestamp}
**Directory:** \`.shark/versions/${phaseDirName}/\`
`;
  await fs.promises.writeFile(path.join(phaseDir, 'VERSION.md'), versionContent);

  await updateBuildJourney(versionsDir, phaseN, gate, iteration, timestamp);

  return phaseDirName;
}

export function createCheckpointTool(
  stateStore: StateStore,
  _gateManager: GateManager
) {
  return tool({
    description: 'Create a checkpoint of current Shark state for recovery',
    args: {
      message: z.string().optional().describe('Checkpoint message/description'),
      phase: z.string().optional().describe('Trigger phase snapshot on gate completion'),
    },
    execute: async (args) => {
      const { message, phase } = args;
      const checkpointId = `cp_${Date.now()}`;

      const checkpointDir = path.join(process.cwd(), '.shark', 'checkpoints');
      await fs.promises.mkdir(checkpointDir, { recursive: true });

      const checkpointData = {
        id: checkpointId,
        timestamp: new Date().toISOString(),
        message: message || 'checkpoint',
        state: stateStore.snapshot(),
      };

      await fs.promises.writeFile(
        path.join(checkpointDir, `${checkpointId}.json`),
        JSON.stringify(checkpointData, null, 2)
      );

      let phaseResult = '';
      if (phase) {
        const result = await createPhaseSnapshot(_gateManager);
        phaseResult = ` Phase snapshot: \`${result}\``;
      }

      return `Checkpoint created: \`${checkpointId}\`.${phaseResult}`;
    },
  });
}
