/**
 * Brain State Store — Shared State for Triple-Brain Architecture
 *
 * Manages the 7 state domains across the three brains.
 * Each brain owns specific domains but can read all.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DomainName, BrainName } from './domain-ownership.js';
import { canWrite, canRead } from './domain-ownership.js';
import { validatePath } from '../../shared/validate-path.js';

export interface BrainState {
  brain: BrainName;
  timestamp: string;
  gate: string;
  iteration: string;
  state: {
    currentTask?: string;
    progress?: string;
    blocks?: string[];
    context?: Record<string, unknown>;
  };
  evidence?: {
    path: string;
    checkpoints: string[];
  };
}

export interface StateStore {
  read(domain: DomainName, brain: BrainName): BrainState | null;
  write(domain: DomainName, brain: BrainName, state: BrainState): boolean;
  getPath(domain: DomainName): string;
}

const STATE_DIR = '.shark';
const BRAIN_STATES_DIR = 'brain-states';

function ensureDirectories(basePath: string): void {
  const brainStatesPath = path.join(basePath, STATE_DIR, BRAIN_STATES_DIR);
  if (!fs.existsSync(brainStatesPath)) {
    fs.mkdirSync(validatePath(brainStatesPath, true), { recursive: true });
  }
}

export function createStateStore(basePath: string = process.cwd()): StateStore {
  ensureDirectories(basePath);

  return {
    read(domain: DomainName, brain: BrainName): BrainState | null {
      if (!canRead(domain, brain)) {
        return null;
      }

      const filePath = path.join(basePath, STATE_DIR, BRAIN_STATES_DIR, `${domain}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as BrainState;
      } catch {
        return null;
      }
    },

    write(domain: DomainName, brain: BrainName, state: BrainState): boolean {
      if (!canWrite(domain, brain)) {
        return false;
      }

      const filePath = path.join(basePath, STATE_DIR, BRAIN_STATES_DIR, `${domain}.json`);
      try {
        fs.writeFileSync(validatePath(filePath, true), JSON.stringify(state, null, 2));
        return true;
      } catch (err) {
        return false;
      }
    },

    getPath(domain: DomainName): string {
      return path.join(basePath, STATE_DIR, BRAIN_STATES_DIR, `${domain}.json`);
    },
  };
}

export function saveAllBrainStates(
  store: StateStore,
  states: Record<DomainName, BrainState>
): void {
  for (const [domain, state] of Object.entries(states)) {
    store.write(domain as DomainName, 'shark-execution', state);
  }
}

export function loadAllBrainStates(store: StateStore): Record<DomainName, BrainState | null> {
  const domains: DomainName[] = [
    'execution-state',
    'thinking-state',
    'context-bridge',
    'workflow-state',
    'quality-state',
    'security-state',
    'plan-state',
  ];

  const result: Record<DomainName, BrainState | null> = {} as Record<DomainName, BrainState | null>;
  for (const domain of domains) {
    result[domain] = store.read(domain, 'shark-execution');
  }
  return result;
}