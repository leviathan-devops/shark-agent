/**
 * Checkpoint History Tool — Phase version listing and restoration
 */
import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
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

export function createCheckpointHistoryTool() {
  return tool({
    description: 'List preserved phase versions and restore to a previous phase',
    args: {
      action: z.enum(['list', 'journey', 'restore']).describe('Action: list phases, show journey timeline, or restore a phase'),
      phase: z.string().optional().describe('Phase name to restore (e.g. v4.9_phase2_build)'),
    },
    execute: async (args) => {
      const { action, phase } = args;
      const cwd = process.cwd();
      const versionsDir = path.join(cwd, '.shark', 'versions');

      if (action === 'list') {
        try {
          const entries = await fs.promises.readdir(versionsDir, { withFileTypes: true });
          const phases = entries
            .filter((e: fs.Dirent) => e.isDirectory())
            .map((e: fs.Dirent) => e.name)
            .sort();

          if (phases.length === 0) {
            return JSON.stringify({ phases: [], message: 'No preserved phases found.' }, null, 2);
          }

          const details = phases.map((p: string) => {
            const versionPath = path.join(versionsDir, p, 'VERSION.md');
            let versionInfo = 'N/A';
            try {
              versionInfo = fs.readFileSync(versionPath, 'utf-8').split('\n')[0]?.replace('# ', '') || 'N/A';
            } catch {
              console.warn('[checkpoint-history] versionInfo read failed');
            }
            return { phase: p, info: versionInfo };
          });

          return JSON.stringify({ phases: details }, null, 2);
        } catch {
          console.warn('[checkpoint-history] list phases failed');
          return JSON.stringify({ phases: [], message: 'No .shark/versions directory found.' }, null, 2);
        }
      }

      if (action === 'journey') {
        const journeyPath = path.join(cwd, '.shark', 'BUILD_JOURNEY.md');
        try {
          const content = await fs.promises.readFile(journeyPath, 'utf-8');
          return content;
        } catch {
          console.warn('[checkpoint-history] journey file read failed');
          return '# Shark Build Journey\n\nNo build journey recorded yet.';
        }
      }

      if (action === 'restore') {
        if (!phase) {
          return JSON.stringify({ error: 'Phase name required for restore action' });
        }

        const phaseDir = path.join(versionsDir, phase);
        try {
          await fs.promises.access(phaseDir);
        } catch {
          console.warn('[checkpoint-history] phase access failed');
          return JSON.stringify({ error: `Phase '${phase}' not found` });
        }

        const restored: string[] = [];
        for (const subdir of ['src', 'dist', 'compaction_survival']) {
          const srcDir = path.join(phaseDir, subdir);
          const destDir = path.join(cwd, subdir);
          try {
            await fs.promises.rm(destDir, { recursive: true, force: true });
            await copyDir(srcDir, destDir);
            restored.push(subdir);
          } catch {
            console.warn('[checkpoint-history] restore subdir failed: ' + subdir);
          }
        }

        return JSON.stringify({
          restored: true,
          phase,
          directories: restored,
          message: `Restored ${restored.join(', ')} from phase '${phase}'`,
        }, null, 2);
      }

      return JSON.stringify({ error: 'Unknown action' });
    },
  });
}
