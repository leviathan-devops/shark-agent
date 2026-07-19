/**
 * PlanningDecisionLayer — Central Orchestrator for ALL Planning Brain
 * proactive intelligence.
 *
 * This is the convergence point where behavioral findings + CSE + CME + PSE
 * verdicts merge. It queries the Hive Mind for cross-session patterns,
 * synthesizes lightweight T1 injectables (messages.transform only — NEVER
 * system.transform for dynamic content), manages cooldown/dedup, and produces
 * precision bullets (50–80 characters).
 *
 * Bible Principle: "Trident Audits & Generates Review Artifacts."
 * The PlanningDecisionLayer generates the lightweight context artifacts that
 * keep the Execution Brain honest across compaction boundaries.
 *
 * DESIGN INVARIANTS:
 *   1. NEVER throws in the messages-transform hot path — all wrapped try-catch.
 *   2. NEVER uses system.transform for dynamic content — messages.transform only.
 *   3. T1 injectables: 150–300 tokens normal, ceiling 600–900.
 *   4. Precision bullets: 50–80 CHARACTERS (not tokens).
 *   5. HiveBridge is async with 1-minute cache.
 *   6. ContextDocUpdater is synchronous (fast filesystem I/O) — zero model tokens.
 */

import { type ThoughtConstruct, ThoughtConstructBuilder } from './thought-construct-builder.js';
import { ThoughtStreamGraph } from './thought-stream-graph.js';
import {
  BehavioralRuleEngine,
  type BehavioralAnalysisResult,
  type BehavioralFinding,
  type RuleContext,
  type BehavioralBlindSpotReport,
} from './behavioral-rules.js';
import type { VerbFrameLexicon } from '../karpathy/verb-frame-lexicon.js';
import { ProgramCache } from '../../shared/pipeline/program-cache.js';
import { logInfo } from '../../shared/shark-logger.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

// ===========================================================================
// LOCAL TYPES
// ===========================================================================

/**
 * The memoized result of a full planning-decision pipeline pass.
 * Stored in DecisionCache keyed by a SHA-256 signature of the input state.
 */
export interface PlanningDecision {
  /** Timestamp the decision was computed (ms epoch). */
  computedAt: number;
  /** Gate context when the decision was made. */
  gate: string;
  /** Behavioral findings merged into this decision. */
  findings: BehavioralFinding[];
  /** Hive-sourced insights merged into this decision. */
  hiveInsights: HiveInsight[];
  /** Required context docs the agent has not yet read. */
  requiredContextDocs: string[];
  /** The synthesized T1 injectable content (null = nothing to inject). */
  injectable: string | null;
  /** SHA-256 hash of the injectable (for dedup). */
  injectableHash: string;
}

/** A single insight recovered from Hive Mind storage. */
export interface HiveInsight {
  key: string;
  content: string;
  /** Relevance score 0–1 (keyword overlap × recency decay). */
  relevance: number;
  /** Source file the insight was read from. */
  source: string;
  /** mtime of the source file (ms epoch). */
  timestamp: number;
}

/** A source entry feeding the T1 synthesis pipeline. */
interface T1Source {
  text: string;
  relevance: number;
  source: string;
}

// ===========================================================================
// HiveBridge — Cross-Session Pattern Query
// ===========================================================================

/**
 * Queries Hive Mind storage for past patterns relevant to the current context.
 *
 * Search locations (in priority order):
 *   1. ~/.local/share/opencode/hive-mind/
 *   2. {workspace}/.shark/hive-mind/
 *
 * Reads both `.md` and `.jsonl` files, scoring each by keyword relevance ×
 * recency decay. Returns the top 5 insights. Results are cached for 1 minute
 * to avoid redundant filesystem walks on the message hot path.
 */
export class HiveBridge {
  private readonly hiveDirs: string[];
  private cache: { query: string; results: HiveInsight[]; timestamp: number } | null = null;
  private readonly cacheTtl = 60_000; // 1 minute

  constructor(workspacePath: string) {
    const home = process.env.HOME || '/root';
    const candidates = [
      path.join(home, '.local', 'share', 'opencode', 'hive-mind'),
      path.join(workspacePath, '.shark', 'hive-mind'),
    ];
    this.hiveDirs = candidates.filter((p: string) => {
      try {
        return fs.existsSync(p);
      } catch (filterErr) {
        logInfo('[HiveBridge] dir existence check failed for ' + p + ': ' + (filterErr instanceof Error ? filterErr.message : String(filterErr)));
        return false;
      }
    });
  }

  /**
   * Query the Hive Mind for insights matching the given keywords.
   * Returns top 5 ranked by relevance × recency decay.
   */
  async query(keywords: string[]): Promise<HiveInsight[]> {
    const queryStr = keywords.sort().join('|');

    // Cache hit?
    if (this.cache && this.cache.query === queryStr && Date.now() - this.cache.timestamp < this.cacheTtl) {
      return this.cache.results;
    }

    if (this.hiveDirs.length === 0 || keywords.length === 0) {
      const empty: HiveInsight[] = [];
      this.cache = { query: queryStr, results: empty, timestamp: Date.now() };
      return empty;
    }

    const results = this.scanHive(keywords);

    // Sort by relevance descending, take top 5
    results.sort((a: HiveInsight, b: HiveInsight) => b.relevance - a.relevance);
    const top5 = results.slice(0, 5);

    this.cache = { query: queryStr, results: top5, timestamp: Date.now() };
    return top5;
  }

  /**
   * Synchronously scan hive directories and score entries.
   * Never throws — returns [] on any error.
   */
  private scanHive(keywords: string[]): HiveInsight[] {
    const insights: HiveInsight[] = [];
    const lowerKeywords = keywords.map((k: string) => k.toLowerCase()).filter((k: string) => k.length > 2);
    if (lowerKeywords.length === 0) return insights;

    const now = Date.now();
    const recencyDecay = (mtime: number): number => {
      const ageDays = (now - mtime) / 86_400_000;
      // Half-life of ~30 days → 0.5 relevance at 30d, ~0.25 at 60d
      return Math.exp(-ageDays / 43);
    };

    for (const hiveDir of this.hiveDirs) {
      let entries: string[];
      try {
        entries = this.listHiveFiles(hiveDir);
      } catch (scanErr) {
        logInfo('[HiveBridge] listHiveFiles failed for ' + hiveDir + ': ' + (scanErr instanceof Error ? scanErr.message : String(scanErr)));
        continue;
      }

      for (const filePath of entries) {
        let stat: fs.Stats;
        let content: string;
        try {
          stat = fs.statSync(filePath);
          content = fs.readFileSync(filePath, 'utf-8');
        } catch (readErr) {
          logInfo('[HiveBridge] skip unreadable file ' + filePath + ': ' + (readErr instanceof Error ? readErr.message : String(readErr)));
          continue;
        }

        try {
          const baseName = path.basename(filePath);

          // Score by keyword density in content + filename
          const lowerContent = content.toLowerCase();
          const lowerName = baseName.toLowerCase();
          let hits = 0;
          for (const kw of lowerKeywords) {
            // Count occurrences but cap at 3 to avoid keyword-flood bias
            let idx = lowerContent.indexOf(kw);
            let count = 0;
            while (idx !== -1 && count < 3) {
              count++;
              idx = lowerContent.indexOf(kw, idx + 1);
            }
            if (lowerName.includes(kw)) count += 2; // filename match weighted higher
            hits += count;
          }

          if (hits === 0) continue;

          const relevance = Math.min(1, (hits / (lowerKeywords.length * 4)) * recencyDecay(stat.mtimeMs));
          if (relevance < 0.05) continue;

          // Extract a summary snippet (first ~200 chars of meaningful content)
          const snippet = this.extractSnippet(content, lowerKeywords[0]);
          insights.push({
            key: baseName.replace(/\.(md|jsonl)$/i, ''),
            content: snippet,
            relevance,
            source: filePath,
            timestamp: stat.mtimeMs,
          });
        } catch (scoreErr) {
          logInfo('[HiveBridge] score error for ' + filePath + ': ' + (scoreErr instanceof Error ? scoreErr.message : String(scoreErr)));
          continue;
        }
      }
    }

    return insights;
  }

  /** Recursively list .md and .jsonl files in a hive directory. */
  private listHiveFiles(dir: string, depth = 0): string[] {
    if (depth > 3) return []; // Prevent runaway recursion
    const files: string[] = [];
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (dirErr) {
      logInfo('[HiveBridge] readdirSync failed for ' + dir + ': ' + (dirErr instanceof Error ? dirErr.message : String(dirErr)));
      return files;
    }
    for (const entry of dirents) {
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          files.push(...this.listHiveFiles(fullPath, depth + 1));
        } else if (entry.isFile() && /\.(md|jsonl)$/i.test(entry.name)) {
          files.push(fullPath);
        }
      } catch (entryErr) {
        logInfo('[HiveBridge] entry skip ' + fullPath + ': ' + (entryErr instanceof Error ? entryErr.message : String(entryErr)));
        continue;
      }
    }
    return files;
  }

  /** Extract a ~200-char snippet centered on the first keyword occurrence. */
  private extractSnippet(content: string, keyword: string): string {
    const clean = content.replace(/^#.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    if (clean.length <= 220) return clean;
    const idx = clean.toLowerCase().indexOf(keyword);
    if (idx === -1) return clean.substring(0, 200).trim();
    const start = Math.max(0, idx - 80);
    const end = Math.min(clean.length, idx + 140);
    return clean.substring(start, end).trim();
  }

  /** Clear the query cache (used on compaction). */
  invalidateCache(): void {
    this.cache = null;
  }
}

// ===========================================================================
// ContextDocUpdater — Mechanical Context Doc Updates (Zero Model Tokens)
// ===========================================================================

/**
 * Performs mechanical, deterministic updates to context management docs
 * based on tool.after signals. This consumes ZERO model tokens — it is
 * pure filesystem I/O that keeps the stream-of-consciousness docs fresh
 * for compaction survival.
 *
 * NEVER throws. All operations are wrapped in try-catch.
 */
export class ContextDocUpdater {
  private readonly contextDir: string;
  private lastBuildHash: string | null = null;
  private lastGate: string | null = null;

  constructor(workspacePath: string) {
    this.contextDir = path.join(
      workspacePath,
      'SHARK_v5.1.0_PLANNING_BRAIN',
      'CONTEXT_MANAGEMENT',
    );
  }

  /**
   * Called from onToolAfter. Detects significant state transitions and
   * updates the relevant context docs. Synchronous, never throws.
   */
  update(
    toolName: string,
    _args: unknown,
    output: unknown,
    gate: string,
  ): void {
    try {
      this.detectBuildHashChange(toolName, output);
      this.detectTaskCompletion(toolName, _args);
      this.detectEvidenceWrite(toolName, output, gate);
      this.detectGateChange(gate);
      this.detectErrors(toolName, output, gate);
    } catch (err) {
      // NEVER throws — log and swallow
      logInfo('[ContextDocUpdater] non-fatal error: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  /** Detect build hash changes → update BUILD_STATE.md. */
  private detectBuildHashChange(toolName: string, output: unknown): void {
    if (toolName !== 'bash' && toolName !== 'terminal' && toolName !== 'write') return;
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output ?? '');
    // Look for build output markers
    const hashMatch = outputStr.match(/(?:bundleHash|buildHash|sha256)[:\s]*([a-f0-9]{16,64})/i);
    if (!hashMatch) return;
    const currentHash = hashMatch[1];
    if (currentHash === this.lastBuildHash) return;

    const prevHash = this.lastBuildHash || 'none';
    this.lastBuildHash = currentHash;
    this.appendDoc('BUILD_STATE.md', `\n## build-hash-change — ${new Date().toISOString()}\n` +
      `Prev: ${prevHash.substring(0, 16)}\n` +
      `Curr: ${currentHash.substring(0, 16)}\n` +
      `Tool: ${toolName}\n`);
  }

  /** Detect task completions → update BUILD_STATE.md + TASK_QUEUE.md. */
  private detectTaskCompletion(toolName: string, args: unknown): void {
    if (toolName !== 'todowrite' && toolName !== 'task') return;
    const argsObj = (args || {}) as Record<string, unknown>;
    const todos = Array.isArray(argsObj['todos']) ? argsObj['todos'] : [];
    for (const todo of todos) {
      if (todo && typeof todo === 'object') {
        const t = todo as Record<string, unknown>;
        const content = typeof t['content'] === 'string' ? t['content'] : '';
        const status = typeof t['status'] === 'string' ? t['status'] : '';
        if (status === 'completed' && content) {
          const ts = new Date().toISOString();
          this.appendDoc('BUILD_STATE.md', `\n## ${content} — COMPLETE (${ts})\nGoal: task completion\nResult: ${content}\n`);
          this.appendDoc('TASK_QUEUE.md', `\n**Current Focus:** ${content}\n[x] ${content} (COMPLETE — ${ts})\n**Next:** continue next task\n`);
        }
      }
    }
  }

  /** Detect evidence writes → update EVIDENCE_STATE.md. */
  private detectEvidenceWrite(toolName: string, output: unknown, gate: string): void {
    const evidenceTools = ['shark-test-runner', 'shark-evidence', 'shark-run-trident', 'shark-spawn-container'];
    if (!evidenceTools.includes(toolName)) return;

    const outputStr = typeof output === 'string' ? output : JSON.stringify(output ?? '');
    const passed = /(?:pass|success|complete|green)/i.test(outputStr) && !/fail|error|block/i.test(outputStr);
    const bytesWritten = this.extractBytes(outputStr);

    this.appendDoc('EVIDENCE_STATE.md', `\n## ${toolName} — ${passed ? 'VERIFIED' : 'PENDING'} (${new Date().toISOString()})\n` +
      `Gate: ${gate}\nBytes: ${bytesWritten}\nConfidence: ${passed ? 'high' : 'low'}\n`);
  }

  /** Detect gate transitions → update CHANGELOG.md. */
  private detectGateChange(gate: string): void {
    if (this.lastGate === null) {
      this.lastGate = gate;
      return;
    }
    if (gate !== this.lastGate) {
      const prev = this.lastGate;
      this.lastGate = gate;
      this.appendDoc('CHANGELOG.md', `\n## gate-transition — ${new Date().toISOString()}\n` +
        `Insight: Gate advanced ${prev} → ${gate}\n` +
        `Impact: New gate phase requires fresh evidence verification.\n`);
    }
  }

  /** Detect errors/blocks → update DEBUG_LOG.md. */
  private detectErrors(toolName: string, output: unknown, gate: string): void {
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output ?? '');
    if (!/(?:BLOCKED|error|failed|ERROR|panic|crash)/i.test(outputStr)) return;

    const category = outputStr.match(/(?:findingId|finding_id)[:\s]*([A-Z0-9-]+)/i)?.[1] || 'unknown';
    const description = `${toolName} at ${gate} produced an error/block signal`;

    this.appendDoc('DEBUG_LOG.md', `\n## ${category} — ${new Date().toISOString()}\n` +
      `Description: ${description}\n` +
      `Root Cause: enforcement or build failure detected in tool output\n` +
      `Resolution: investigate tool output and address the underlying issue\n` +
      `Lesson: verify evidence before advancing gate\n`);
  }

  /** Extract byte count from output string (best-effort). */
  private extractBytes(outputStr: string): number {
    const m = outputStr.match(/(\d+)\s*bytes?/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  /**
   * Append content to a context doc. Synchronous, never throws.
   * Pure filesystem I/O — zero model tokens.
   */
  private appendDoc(docName: string, content: string): void {
    try {
      const docPath = path.join(this.contextDir, docName);
      if (!fs.existsSync(this.contextDir)) {
        fs.mkdirSync(this.contextDir, { recursive: true });
      }
      // Read existing, append, write back
      let existing = '';
      if (fs.existsSync(docPath)) {
        existing = fs.readFileSync(docPath, 'utf-8');
      } else {
        existing = `# ${docName.replace('.md', '')}\n\nInitialized by PlanningDecisionLayer.\n`;
      }
      fs.writeFileSync(docPath, existing + content, 'utf-8');
    } catch (err) {
      // NEVER throws — log and continue
      logInfo(`[ContextDocUpdater] appendDoc(${docName}) failed: ` + (err instanceof Error ? err.message : String(err)));
    }
  }

  /** Serialize for compaction survival. */
  serialize(): string {
    return JSON.stringify({
      lastBuildHash: this.lastBuildHash,
      lastGate: this.lastGate,
      contextDir: this.contextDir,
    });
  }

  restore(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.lastBuildHash = parsed.lastBuildHash ?? null;
      this.lastGate = parsed.lastGate ?? null;
    } catch (err) {
      // Non-fatal — log and use defaults
      logInfo('[ContextDocUpdater] restore non-fatal: ' + (err instanceof Error ? err.message : String(err)));
    }
  }
}

// ===========================================================================
// DecisionCache — SHA-256 Keyed Memoization
// ===========================================================================

/**
 * Wraps ProgramCache<PlanningDecision> to memoize planning decisions.
 * Prevents redundant behavioral analysis + hive queries when the input
 * state hasn't changed within the TTL window.
 *
 * Key = SHA-256 of (gate + toolCategory + graphSignature + findingCount).
 */
export class DecisionCache {
  private readonly cache: ProgramCache<PlanningDecision>;

  constructor(maxSize = 64, ttlMs = 300_000) {
    this.cache = new ProgramCache<PlanningDecision>(maxSize, ttlMs);
  }

  /**
   * Compute the cache key for a given input state.
   */
  computeKey(
    gate: string,
    toolCategory: string,
    graphSignature: string,
    findingCount: number,
  ): string {
    return createHash('sha256')
      .update(`${gate}||${toolCategory}||${graphSignature}||${findingCount}`)
      .digest('hex')
      .substring(0, 16);
  }

  get(key: string): PlanningDecision | null {
    return this.cache.get(key);
  }

  set(key: string, decision: PlanningDecision): void {
    this.cache.set(key, decision);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get stats(): { size: number; hits: number; misses: number } {
    return this.cache.stats;
  }
}

// ===========================================================================
// PlanningDecisionLayer — Main Orchestrator
// ===========================================================================

/**
 * The central orchestrator for ALL Planning Brain proactive intelligence.
 *
 * Pipeline (messages.transform hook):
 *   1. Build ThoughtConstructs from recent messages
 *   2. Append to ThoughtStreamGraph
 *   3. Run BehavioralRuleEngine on graph
 *   4. Check DecisionCache (skip if nothing changed)
 *   5. Query HiveBridge for relevant patterns
 *   6. Synthesize T1 injectable (4-layer: collect → score → compress → format)
 *   7. Cooldown + dedup via SHA-256 hashing
 *   8. Return injectable content or null
 *
 * NEVER throws in the message hot path.
 * NEVER uses system.transform for dynamic content.
 */
export class PlanningDecisionLayer {
  private ruleEngine: BehavioralRuleEngine;
  private hiveBridge: HiveBridge;
  private docUpdater: ContextDocUpdater;
  private decisionCache: ProgramCache<PlanningDecision>;
  private constructBuilder: ThoughtConstructBuilder;
  private thoughtGraph: ThoughtStreamGraph;
  private lastInjection: { hash: string; timestamp: number } | null = null;
  private readonly injectionCooldown = 20_000; // 20 seconds

  constructor(workspacePath: string, lexicon?: VerbFrameLexicon) {
    this.hiveBridge = new HiveBridge(workspacePath);
    this.docUpdater = new ContextDocUpdater(workspacePath);
    this.decisionCache = new ProgramCache<PlanningDecision>(64, 300_000);
    // Instantiate real engines from sibling modules (PB-1, PB-2, PB-3).
    // All fault-tolerant — downstream callers wrap every method in try-catch.
    this.ruleEngine = new BehavioralRuleEngine();
    this.constructBuilder = new ThoughtConstructBuilder(lexicon ?? undefined, workspacePath);
    this.thoughtGraph = new ThoughtStreamGraph();
  }

  // ───────────────────────────────────────────────────────────────
  // MAIN: messages.transform hook
  // ───────────────────────────────────────────────────────────────

  /**
   * The primary entry point for the messages.transform hook.
   * Returns a T1 injectable string to prepend to the conversation, or null
   * if nothing actionable was found.
   *
   * NEVER throws — all logic is wrapped in try-catch.
   */
  async onMessagesTransform(
    messages: Array<{ role: string; content: string; _nlpContext?: unknown }>,
    gate: string,
    toolHistory: Array<{ toolName: string; category: string }>,
    filesystemState: { bytesWritten: number; evidenceFilesCreated: number } | null,
  ): Promise<string | null> {
    try {
      // Step 1: Build ThoughtConstructs from recent messages
      const recentMessages = messages.slice(-12);
      const constructs: ThoughtConstruct[] = [];
      for (const msg of recentMessages) {
        if (!msg.content || typeof msg.content !== 'string') continue;
        const tc = this.buildConstructSafe(msg as { role: string; content: string; _nlpContext?: unknown }, gate);
        if (tc) constructs.push(tc);
      }
      if (constructs.length === 0) return null;

      // Step 2: Append constructs to the thought graph
      this.appendConstructsSafe(constructs);

      // Step 3: Run behavioral rule engine on the graph
      const ruleContext: RuleContext = {
        gate,
        toolHistory,
        filesystemState,
        taskQueuePending: [],
        recentFiles: [],
      };
      const analysis = this.runRulesSafe(this.thoughtGraph, ruleContext);
      if (!analysis) return null;

      // Step 4: Check decision cache (skip if nothing changed)
      const toolCategory = this.dominantToolCategory(toolHistory);
      const graphSig = this.computeGraphSignature(gate, constructs);
      const cacheKey = ProgramCache.contentKey(gate, toolCategory, graphSig, String(analysis.findings.length));
      const cached = this.decisionCache.get(cacheKey);
      if (cached) {
        return this.applyCooldownDedup(cached.injectable, cached.injectableHash);
      }

      // Step 5: Query HiveBridge for relevant patterns
      const keywords = this.extractKeywords(constructs, analysis.findings);
      const hiveInsights = await this.queryHiveSafe(keywords);

      // Step 6: Synthesize T1 injectable (4-layer: collect → score → compress → format)
      const requiredDocs = this.detectRequiredContextDocs(analysis, gate);
      const injectable = this.synthesizeT1(
        analysis.findings,
        hiveInsights,
        requiredDocs,
        gate,
      );
      const injectableHash = injectable
        ? createHash('sha256').update(injectable).digest('hex').substring(0, 16)
        : '';

      // Cache the decision
      const decision: PlanningDecision = {
        computedAt: Date.now(),
        gate,
        findings: analysis.findings,
        hiveInsights,
        requiredContextDocs: requiredDocs,
        injectable,
        injectableHash,
      };
      try {
        this.decisionCache.set(cacheKey, decision);
      } catch (cacheErr) {
        // Non-fatal — cache is best-effort
        logInfo('[PlanningDecisionLayer] decisionCache.set non-fatal: ' + (cacheErr instanceof Error ? cacheErr.message : String(cacheErr)));
      }

      // Step 7: Cooldown + dedup
      return this.applyCooldownDedup(injectable, injectableHash);
    } catch (err) {
      // NEVER throws in the message hot path
      logInfo('[PlanningDecisionLayer] onMessagesTransform non-fatal: ' + (err instanceof Error ? err.message : String(err)));
      return null;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // TOOL.AFTER: Mechanical doc updates
  // ───────────────────────────────────────────────────────────────

  /**
   * Called from tool.after hook. Delegates to ContextDocUpdater for
   * mechanical, zero-token filesystem updates. Synchronous, never throws.
   */
  onToolAfter(toolName: string, args: unknown, output: unknown, gate: string): void {
    try {
      this.docUpdater.update(toolName, args, output, gate);
    } catch (err) {
      logInfo('[PlanningDecisionLayer] onToolAfter non-fatal: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  // ───────────────────────────────────────────────────────────────
  // T1 Injectable Synthesis (4-layer: collect → score → compress → format)
  // ───────────────────────────────────────────────────────────────

  /**
   * Synthesize a T1 injectable from collected sources.
   *
   * Layer 1: COLLECT — gather all candidate text from findings, hive, docs.
   * Layer 2: SCORE — rank by relevance.
   * Layer 3: COMPRESS — fit within token budget.
   * Layer 4: FORMAT — structured list output.
   *
   * Budget: 150–300 tokens normal, ceiling 600–900.
   */
  private synthesizeT1(
    findings: BehavioralFinding[],
    hiveInsights: HiveInsight[],
    requiredDocs: string[],
    gate: string,
  ): string | null {
    // Layer 1: COLLECT
    const sources: T1Source[] = [];

    for (const finding of findings) {
      if (!finding) continue;
      const severityWeight =
        finding.severity === 'CRITICAL' ? 1.0 :
        finding.severity === 'HIGH' ? 0.8 :
        finding.severity === 'MEDIUM' ? 0.5 : 0.3;
      sources.push({
        text: this.formatFinding(finding),
        relevance: severityWeight,
        source: 'behavioral-finding',
      });
    }

    for (const insight of hiveInsights) {
      sources.push({
        text: `[HIVE] ${insight.content}`,
        relevance: insight.relevance * 0.7, // Hive insights weighted below active findings
        source: 'hive-mind',
      });
    }

    for (const doc of requiredDocs) {
      sources.push({
        text: `[CONTEXT] Read ${doc} before proceeding at ${gate} gate.`,
        relevance: 0.6,
        source: 'required-doc',
      });
    }

    if (sources.length === 0) return null;

    // Layer 2: SCORE — sort by relevance descending
    sources.sort((a: T1Source, b: T1Source) => b.relevance - a.relevance);

    // Layer 3: COMPRESS — fit within token budget (~4 chars/token)
    const minBudget = 600;   // ~150 tokens
    const maxBudget = 2400;  // ~600 tokens
    const ceiling = 3600;    // ~900 tokens absolute ceiling

    let totalChars = 0;
    const selected: string[] = [];
    for (const src of sources) {
      if (totalChars + src.text.length > ceiling && selected.length >= 3) break;
      selected.push(src.text);
      totalChars += src.text.length + 1; // +1 for newline
      if (totalChars >= maxBudget && selected.length >= 4) break;
    }

    if (totalChars < minBudget && sources.length > selected.length) {
      // Top up to minimum budget
      for (let i = selected.length; i < sources.length && totalChars < minBudget; i++) {
        selected.push(sources[i].text);
        totalChars += sources[i].text.length + 1;
      }
    }

    // Layer 4: FORMAT — structured list
    const header = `<!-- T1-INJECTABLE gate=${gate} sources=${selected.length} -->`;
    const body = selected.map((s: string) => `- ${s}`).join('\n');
    return `${header}\n${body}`;
  }

  /** Format a behavioral finding as a precision source line. */
  private formatFinding(finding: BehavioralFinding): string {
    return `[${finding.severity}] ${finding.ruleId}: ${finding.message}`;
  }

  // ───────────────────────────────────────────────────────────────
  // PRECISION BULLET FORMATTING
  // ───────────────────────────────────────────────────────────────

  /**
   * Format a message as a precision bullet (50–80 characters).
   * Truncates with ellipsis if too long, pads context if too short.
   */
  static formatBullet(message: string): string {
    if (!message) return '';
    // Strip markdown/formatting for length counting
    const clean = message.replace(/^[-*]\s*/, '').replace(/\*\*/g, '').trim();
    const MIN = 50;
    const MAX = 80;

    if (clean.length <= MAX && clean.length >= MIN) {
      return `- ${clean}`;
    }
    if (clean.length > MAX) {
      // Truncate at word boundary
      const truncated = clean.substring(0, MAX - 4);
      const lastSpace = truncated.lastIndexOf(' ');
      const cut = lastSpace > MIN ? truncated.substring(0, lastSpace) : truncated;
      return `- ${cut}...`;
    }
    // Too short — pad with context tag
    return `- ${clean} (planning-brain)`;
  }

  // ───────────────────────────────────────────────────────────────
  // COOLDOWN + DEDUP
  // ───────────────────────────────────────────────────────────────

  /**
   * Apply 20-second cooldown and SHA-256 dedup.
   * Returns the injectable if it passes both checks, null otherwise.
   */
  private applyCooldownDedup(injectable: string | null, hash: string): string | null {
    if (!injectable) return null;
    const now = Date.now();

    // Dedup: same content hash as last injection
    if (this.lastInjection && this.lastInjection.hash === hash) {
      return null;
    }

    // Cooldown: too soon since last injection (different content)
    if (this.lastInjection && now - this.lastInjection.timestamp < this.injectionCooldown) {
      return null;
    }

    this.lastInjection = { hash, timestamp: now };
    return injectable;
  }

  // ───────────────────────────────────────────────────────────────
  // HELPER METHODS (all wrapped — never throw)
  // ───────────────────────────────────────────────────────────────

  /** Safely build a ThoughtConstruct, returning null on any error. */
  private buildConstructSafe(
    message: { role: string; content: string; _nlpContext?: unknown },
    gate: string,
  ): ThoughtConstruct | null {
    try {
      const builder = this.constructBuilder as unknown as { build?: (m: { role: string; content: string; _nlpContext?: unknown }, g: string) => ThoughtConstruct };
      if (!this.constructBuilder || typeof builder.build !== 'function') {
        return null;
      }
      return builder.build(message, gate);
    } catch (err) {
      logInfo('[PlanningDecisionLayer] buildConstruct non-fatal: ' + (err instanceof Error ? err.message : String(err)));
      return null;
    }
  }

  /** Safely append constructs to the thought graph. */
  private appendConstructsSafe(constructs: ThoughtConstruct[]): void {
    try {
      const graph = this.thoughtGraph as unknown as { append?: (c: ThoughtConstruct) => number };
      if (graph && typeof graph.append === 'function') {
        for (const c of constructs) graph.append(c);
      }
    } catch (err) {
      logInfo('[PlanningDecisionLayer] appendConstructs non-fatal: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  /** Safely run the behavioral rule engine. */
  private runRulesSafe(graph: ThoughtStreamGraph, context: RuleContext): BehavioralAnalysisResult | null {
    try {
      const engine = this.ruleEngine as unknown as { analyze?: (g: ThoughtStreamGraph, ctx: RuleContext) => BehavioralAnalysisResult };
      if (!engine || typeof engine.analyze !== 'function') return null;
      return engine.analyze(graph, context);
    } catch (err) {
      logInfo('[PlanningDecisionLayer] runRules non-fatal: ' + (err instanceof Error ? err.message : String(err)));
      return null;
    }
  }

  /** Safely query the hive bridge. */
  private async queryHiveSafe(keywords: string[]): Promise<HiveInsight[]> {
    try {
      return await this.hiveBridge.query(keywords);
    } catch (err) {
      logInfo('[PlanningDecisionLayer] queryHive non-fatal: ' + (err instanceof Error ? err.message : String(err)));
      return [];
    }
  }

  /** Extract keywords from constructs and findings for hive search. */
  private extractKeywords(constructs: ThoughtConstruct[], findings: BehavioralFinding[]): string[] {
    const keywords = new Set<string>();
    try {
      for (const c of constructs) {
        if (c.intentCategory) keywords.add(c.intentCategory.toLowerCase());
        if (c.kind) keywords.add(c.kind.toLowerCase());
        if (c.targetEntity) keywords.add(c.targetEntity.toLowerCase());
      }
    } catch (err) {
      logInfo('[PlanningDecisionLayer] extractKeywords constructs non-fatal: ' + (err instanceof Error ? err.message : String(err)));
    }
    try {
      for (const f of findings) {
        if (f.ruleId) keywords.add(f.ruleId.toLowerCase());
      }
    } catch (err) {
      logInfo('[PlanningDecisionLayer] extractKeywords findings non-fatal: ' + (err instanceof Error ? err.message : String(err)));
    }
    return Array.from(keywords).slice(0, 10);
  }

  /** Detect which context docs the agent hasn't read but should for this gate. */
  private detectRequiredContextDocs(analysis: BehavioralAnalysisResult, gate: string): string[] {
    const docs: string[] = [];
    try {
      // If blind spot report shows shallow tool history depth, flag context docs
      const report = analysis.blindSpotReport;
      if (report.toolHistoryDepth < 3) {
        docs.push('TASK_QUEUE.md');
      }
      if (report.limitations.some((l: string) => /evidence|verify/i.test(l))) {
        docs.push('EVIDENCE_STATE.md');
      }
      // Gate-specific required docs
      switch (gate.toUpperCase()) {
        case 'PLAN':
          docs.push('TASK_QUEUE.md');
          break;
        case 'BUILD':
          docs.push('BUILD_STATE.md');
          break;
        case 'TEST':
        case 'AUDIT':
          docs.push('EVIDENCE_STATE.md');
          break;
        case 'DELIVERY':
          docs.push('EVIDENCE_STATE.md', 'BUILD_STATE.md');
          break;
        default:
          break;
      }
    } catch (err) {
      logInfo('[PlanningDecisionLayer] detectRequiredContextDocs non-fatal: ' + (err instanceof Error ? err.message : String(err)));
    }
    return [...new Set(docs)];
  }

  /** Compute a signature of the current graph + constructs for cache keying. */
  private computeGraphSignature(gate: string, constructs: ThoughtConstruct[]): string {
    try {
      const intents = constructs
        .map((c: ThoughtConstruct) => c.intentCategory)
        .join(',');
      return createHash('sha256').update(`${gate}|${intents}`).digest('hex').substring(0, 12);
    } catch (err) {
      logInfo('[PlanningDecisionLayer] computeGraphSignature non-fatal: ' + (err instanceof Error ? err.message : String(err)));
      return 'fallback';
    }
  }

  /** Determine the dominant tool category from recent tool history. */
  private dominantToolCategory(toolHistory: Array<{ toolName: string; category: string }>): string {
    if (toolHistory.length === 0) return 'none';
    const counts: Record<string, number> = {};
    for (const t of toolHistory) {
      const cat = t.category || 'unknown';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    let maxCat = 'unknown';
    let maxCount = 0;
    for (const [cat, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxCat = cat;
      }
    }
    return maxCat;
  }

  // ───────────────────────────────────────────────────────────────
  // COMPACTION SURVIVAL
  // ───────────────────────────────────────────────────────────────

  /** Serialize internal state for compaction survival. */
  serialize(): string {
    return JSON.stringify({
      lastInjection: this.lastInjection,
      docUpdaterState: this.docUpdater.serialize(),
      cacheSize: this.decisionCache.size,
    });
  }

  /** Restore internal state after compaction. */
  restore(data: string): void {
    try {
      const parsed = JSON.parse(data);
      if (parsed.lastInjection) {
        this.lastInjection = parsed.lastInjection;
      }
      if (typeof parsed.docUpdaterState === 'string') {
        this.docUpdater.restore(parsed.docUpdaterState);
      }
      // Invalidate hive cache on restore (stale after compaction)
      this.hiveBridge.invalidateCache();
    } catch (err) {
      logInfo('[PlanningDecisionLayer] restore non-fatal: ' + (err instanceof Error ? err.message : String(err)));
    }
  }
}
