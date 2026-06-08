/**
 * PlanningBrainRegistry — Multi-Project Planning Brain Manager
 *
 * Replaces the singleton PlanningBrain with a registry that manages
 * N planning brain instances, one per active project.
 *
 * Each PlanningBrain instance has its own:
 * - CommonSenseLobe (with its own verification matrix)
 * - ContextManagementLobe (with its own 9 context docs)
 * - LoopState
 * - basePath / contextDir
 *
 * Project detection strategy (in priority order):
 * 1. Tool argument file paths — scan write/edit/read/bash args for file paths,
 *    walk up directories looking for .sharkconfig
 * 2. .sharkconfig in cwd — if the user cd'd into a project directory
 * 3. Session default — use the workspace root as fallback
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PlanningBrain, type PlanningBrainConfig } from './index.js';

export interface SharkConfig {
  project: {
    id: string;
    name: string;
    root: string;
  };
  planningBrain: {
    enabled: boolean;
    autoDetect: boolean;
    contextDir: string;
  };
  identity: {
    dir: string;
    agent: string;
  };
}

export class PlanningBrainRegistry {
  private instances: Map<string, PlanningBrain> = new Map();
  private configCache: Map<string, SharkConfig> = new Map();
  private projectPathCache: Map<string, string> = new Map();
  private activeProjectId: string | null = null;

  /**
   * Get or create a PlanningBrain for a given project root.
   */
  getOrCreate(projectRoot: string): PlanningBrain | null {
    const config = this.loadConfig(projectRoot);
    if (!config) return null;

    const projectId = config.project.id;

    // Check if already exists
    const existing = this.instances.get(projectId);
    if (existing) return existing;

    // Check if planning brain is enabled
    if (!config.planningBrain.enabled) return null;
    if (process.env.SHARK_PLANNING_BRAIN !== 'enabled') return null;

    // Create context directory
    const contextDir = path.join(projectRoot, config.planningBrain.contextDir);
    try { fs.mkdirSync(contextDir, { recursive: true }); } catch { /* ignore */ }

    // Create new PlanningBrain instance
    const pbConfig: PlanningBrainConfig = {
      basePath: projectRoot,
      contextDir,
    };
    const brain = new PlanningBrain(pbConfig);
    this.instances.set(projectId, brain);
    this.activeProjectId = projectId;

    return brain;
  }

  /**
   * Get the active PlanningBrain instance.
   */
  getActive(): PlanningBrain | null {
    if (this.activeProjectId) {
      return this.instances.get(this.activeProjectId) || null;
    }
    return null;
  }

  /**
   * Get a specific PlanningBrain by project ID.
   */
  get(projectId: string): PlanningBrain | null {
    return this.instances.get(projectId) || null;
  }

  /**
   * Detect project from tool arguments by scanning file paths.
   */
  detectProjectFromArgs(args: unknown): string | null {
    const allText = JSON.stringify(args || '');
    const paths = allText.match(/\/[^\s,"']+/g) || [];
    for (const p of paths) {
      const projectRoot = this.findProjectRoot(p);
      if (projectRoot) return projectRoot;
    }
    return null;
  }

  /**
   * Walk up from a file path looking for .sharkconfig.
   */
  findProjectRoot(filePath: string): string | null {
    // Check cache first
    if (this.projectPathCache.has(filePath)) {
      return this.projectPathCache.get(filePath) || null;
    }

    let dir = path.dirname(path.resolve(filePath));
    const root = path.parse(dir).root;
    let iterations = 0;

    while (dir !== root && iterations < 20) {
      const configPath = path.join(dir, '.sharkconfig');
      if (fs.existsSync(configPath)) {
        this.projectPathCache.set(filePath, dir);
        return dir;
      }
      dir = path.dirname(dir);
      iterations++;
    }

    this.projectPathCache.set(filePath, null);
    return null;
  }

  /**
   * Load .sharkconfig from a project root.
   */
  private loadConfig(projectRoot: string): SharkConfig | null {
    // Check cache
    if (this.configCache.has(projectRoot)) {
      return this.configCache.get(projectRoot) || null;
    }

    try {
      const configPath = path.join(projectRoot, '.sharkconfig');
      if (!fs.existsSync(configPath)) return null;
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config: SharkConfig = JSON.parse(raw);
      this.configCache.set(projectRoot, config);
      return config;
    } catch {
      return null;
    }
  }

  /**
   * Switch active project.
   */
  switchProject(projectId: string): PlanningBrain | null {
    if (this.instances.has(projectId)) {
      this.activeProjectId = projectId;
      return this.instances.get(projectId) || null;
    }
    return null;
  }

  /**
   * Get all active project IDs.
   */
  getActiveProjects(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Read another project's thought stream.
   */
  getThreadStream(projectId: string): string | null {
    const brain = this.instances.get(projectId);
    if (!brain) return null;
    // The thought stream is stored in the context directory
    const config = this.findConfigForBrain(brain);
    if (!config) return null;
    const thoughtStreamPath = path.join(
      config.project.root,
      config.planningBrain.contextDir,
      'THOUGHT_STREAM.md',
    );
    try {
      return fs.readFileSync(thoughtStreamPath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Search all project threads for a query.
   */
  searchAllThreads(query: string): Array<{ projectId: string; matches: string[] }> {
    const results: Array<{ projectId: string; matches: string[] }> = [];
    for (const [projectId, brain] of this.instances) {
      const config = this.findConfigForBrain(brain);
      if (!config) continue;
      const thoughtStreamPath = path.join(
        config.project.root,
        config.planningBrain.contextDir,
        'THOUGHT_STREAM.md',
      );
      try {
        const content = fs.readFileSync(thoughtStreamPath, 'utf-8');
        const lines = content.split('\n');
        const matches = lines.filter(l => l.toLowerCase().includes(query.toLowerCase()));
        if (matches.length > 0) {
          results.push({ projectId, matches });
        }
      } catch {
        continue;
      }
    }
    return results;
  }

  /**
   * Create cross-reference link between projects.
   */
  linkProjects(sourceId: string, targetId: string, reason: string): void {
    const source = this.instances.get(sourceId);
    const target = this.instances.get(targetId);
    if (!source || !target) return;

    const sourceConfig = this.findConfigForBrain(source);
    const targetConfig = this.findConfigForBrain(target);
    if (!sourceConfig || !targetConfig) return;

    const ts = new Date().toISOString();
    const sourceDecisionPath = path.join(
      sourceConfig.project.root,
      sourceConfig.planningBrain.contextDir,
      'DECISION_CHAIN.md',
    );
    const targetDecisionPath = path.join(
      targetConfig.project.root,
      targetConfig.planningBrain.contextDir,
      'DECISION_CHAIN.md',
    );

    const linkEntry = `\n- **${ts}** Cross-reference: ${sourceId} ↔ ${targetId} — ${reason}\n`;

    try { fs.appendFileSync(sourceDecisionPath, linkEntry); } catch { /* ignore */ }
    try { fs.appendFileSync(targetDecisionPath, linkEntry); } catch { /* ignore */ }
  }

  /**
   * Get summary of all active threads.
   */
  getThreadMap(): Record<string, { projectName: string; threadPath: string; entryCount: number }> {
    const map: Record<string, { projectName: string; threadPath: string; entryCount: number }> = {};
    for (const [projectId, brain] of this.instances) {
      const config = this.findConfigForBrain(brain);
      if (!config) continue;
      const threadPath = path.join(
        config.project.root,
        config.planningBrain.contextDir,
        'THOUGHT_STREAM.md',
      );
      let entryCount = 0;
      try {
        const content = fs.readFileSync(threadPath, 'utf-8');
        entryCount = content.split('\n').filter(l => l.startsWith('- **')).length;
      } catch {
        entryCount = 0;
      }
      map[projectId] = {
        projectName: config.project.name,
        threadPath,
        entryCount,
      };
    }
    return map;
  }

  /**
   * Reset all instances.
   */
  resetAll(): void {
    this.instances.clear();
    this.configCache.clear();
    this.projectPathCache.clear();
    this.activeProjectId = null;
  }

  private findConfigForBrain(brain: PlanningBrain): SharkConfig | null {
    for (const [root, config] of this.configCache) {
      const brainConfig = (brain as any).config;
      if (brainConfig && brainConfig.basePath === root) {
        return config;
      }
    }
    return null;
  }
}

// Singleton registry
let _registry: PlanningBrainRegistry | null = null;

export function getRegistry(): PlanningBrainRegistry {
  if (!_registry) {
    _registry = new PlanningBrainRegistry();
  }
  return _registry;
}

export function resetRegistry(): void {
  _registry?.resetAll();
  _registry = null;
}
