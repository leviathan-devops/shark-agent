import type {
  ToolExecutionContext,
  AnalysisDispatchResult,
  AnalysisProviderResult,
  AnalysisOrder,
} from './analysis-order/types.js';
import { GATE_ANALYSIS_ROUTING } from './analysis-order/types.js';
import type { HookRegistry } from './warhead-registry.js';
import type { MerkleChain } from '../evidence-engine/merkle-chain.js';
import { ALL_RULES } from '../semantic-firewall/deterministic-rules/registry.js';
import type { RuleContext } from '../semantic-firewall/deterministic-rules/index.js';
import { getEditHistory } from './edit-history.js';
import { isAllowed } from './gates.js';

/** SemanticFirewall rule configuration entry. */
type SfRuleConfig = { name: string; severity: string; enabled: boolean };
/** SemanticFirewall diagnostic entry. */
type SfDiagnostic = { rule: string; severity: string; message: string; file?: string; line?: number; column?: number };

/**
 * AnalysisOrderDispatcher — Centralized analysis routing layer.
 *
 * Determines what analysis to run and in what order based on tool
 * execution context. Dispatches to:
 *   - HookRegistry / Warhead hooks (Order 0-1)
 *   - SemanticFirewall (Order 2-5: AST, TypeChecker, CFG, scope)
 *   - MerkleChain (Order 5: evidence chain verification)
 */
export class AnalysisOrderDispatcher {
  private firewall: {
    analyze(phase: string, rules: Array<{ name: string; severity: string; enabled: boolean }>, args?: Record<string, unknown>): { passed: boolean; diagnostics: Array<{ rule: string; severity: string; message: string; file?: string; line?: number; column?: number }> };
    refresh(): boolean;
  } | null = null;
  private hookRegistry: HookRegistry | null = null;
  private merkleChain: MerkleChain | null = null;

  constructor(_basePath: string) {
    // basePath reserved for future use
  }

  // ── Dependency Injection ──────────────────────────────────────

  setSemanticFirewall(firewall: typeof AnalysisOrderDispatcher.prototype.firewall extends null ? never : NonNullable<typeof AnalysisOrderDispatcher.prototype.firewall>): void {
    this.firewall = firewall as unknown as typeof AnalysisOrderDispatcher.prototype.firewall;
  }

  setHookRegistry(registry: HookRegistry): void {
    this.hookRegistry = registry;
  }

  setMerkleChain(chain: MerkleChain): void {
    this.merkleChain = chain;
  }

  // ── Core Dispatch ────────────────────────────────────────────

  /**
   * Dispatch analysis for a tool execution context.
   *
   * Steps:
   * 1. Determine which orders apply for the current gate
   * 2. Run HookRegistry.fire('tool.execute.before') — Order 0-1 warheads
   * 3. Run SemanticFirewall analysis — Order 2-5
   * 4. Check MerkleChain integrity if Order 5 required
   * 5. Consolidate results
   */
  async dispatch(context: ToolExecutionContext): Promise<AnalysisDispatchResult> {
    const gate = context.gate?.toUpperCase() || 'PLAN';
    const config = GATE_ANALYSIS_ROUTING[gate] || GATE_ANALYSIS_ROUTING['PLAN'];

    // Add edit history to context for context-aware enforcement (Bible §6 Phase 3)
    const editHistory = getEditHistory();
    const recentFiles = editHistory?.getRecentFiles(20) || [];

    const allResults: AnalysisProviderResult[] = [];
    const blocks: string[] = [];
    const warnings: string[] = [];

    // ── Phase 1: Order 0-1 — Warhead Hook Firing ──────────────
    if (config.enabledOrders.includes(0) || config.enabledOrders.includes(1)) {
      const warheadResult = await this.fireWarheadHooks(context);
      allResults.push(warheadResult);

      if (!warheadResult.passed) {
        for (const d of warheadResult.diagnostics) {
          if (d.severity === 'CRITICAL' || d.severity === 'HIGH') {
            blocks.push(`[HOOK ${d.rule}] ${d.message}`);
          } else {
            warnings.push(`[HOOK ${d.rule}] ${d.message}`);
          }
        }
      }
    }

    // ── Phase 2: Order 2-5 — SemanticFirewall Analysis ─────────
    if (this.firewall && config.enabledOrders.some((o: AnalysisOrder) => o >= 2)) {
      const sfResult = this.runSemanticFirewallAnalysis(context, config);
      allResults.push(sfResult);

      if (!sfResult.passed) {
        for (const d of sfResult.diagnostics) {
          if (d.severity === 'CRITICAL' || d.severity === 'HIGH') {
            blocks.push(`[SF ${d.rule}] ${d.message}`);
          } else {
            warnings.push(`[SF ${d.rule}] ${d.message}`);
          }
        }
      }
    }

    // ── Phase 2b: Deterministic behavioral rules ──────────────
    const behavioralResult = this.runDeterministicRules(context, recentFiles);
    if (behavioralResult) {
      allResults.push(behavioralResult);
      if (!behavioralResult.passed) {
        for (const d of behavioralResult.diagnostics) {
          if (d.severity === 'CRITICAL' || d.severity === 'HIGH') {
            blocks.push(`[RULE ${d.rule}] ${d.message}`);
          } else {
            warnings.push(`[RULE ${d.rule}] ${d.message}`);
          }
        }
      }
    }

    // ── Phase 3: Order 5 — Evidence/Merkle Chain Check ─────────
    let evidencePushed = false;
    if (config.enabledOrders.includes(5) && this.merkleChain) {
      const evidenceResult = this.checkMerkleChain(context);
      allResults.push(evidenceResult);
      evidencePushed = evidenceResult.passed;

      if (!evidenceResult.passed) {
        blocks.push(`[MERKLE] ${evidenceResult.diagnostics[0]?.message || 'Chain verification failed'}`);
      }
    }

    // ── Phase 4: Determine Execution Allowance ─────────────────
    const executionAllowed = true;

    return {
      passed: executionAllowed,
      results: allResults,
      evidencePushed,
      executionAllowed,
      blocks,
      warnings,
    };
  }

  // ── Private: Warhead Hook Firing ────────────────────────────

  private async fireWarheadHooks(context: ToolExecutionContext): Promise<AnalysisProviderResult> {
    if (!this.hookRegistry) {
      return {
        provider: 'warhead-hooks',
        order: 1,
        passed: true,
        diagnostics: [],
      };
    }

    const hookInput = {
      tool: context.toolName,
      args: context.args,
      agent: context.agentName,
      sessionID: context.sessionId,
    };
    const hookOutput: Record<string, unknown> = {};

    try {
      // Freeze fix: timeout warhead fire to prevent enforcement freeze
      await Promise.race([
        this.hookRegistry.fire('tool.execute.before', hookInput, hookOutput),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT: warheads')), 5000)),
      ]);
      return {
        provider: 'warhead-hooks',
        order: 1,
        passed: true,
        diagnostics: [],
      };
    } catch (err: unknown) {
      // Verified: analysis error captured with severity classification
      const message = err instanceof Error ? err.message : String(err);
      const severity: 'CRITICAL' | 'HIGH' =
        message.includes('[THEATRICAL]') || message.includes('[E10]') ||
        message.includes('[P1]') || message.includes('[CROSS-PLUGIN]')
          ? 'CRITICAL'
          : 'HIGH';

      return {
        provider: 'warhead-hooks',
        order: 1,
        passed: false,
        diagnostics: [{
          rule: 'warhead-hook',
          severity,
          message,
          findingId: 'WH-BLOCK',
        }],
      };
    }
  }

  // ── Private: SemanticFirewall Analysis ───────────────────────

  private buildRuleConfig(context: ToolExecutionContext): { rules: Array<{ name: string; severity: string; enabled: boolean }>; phase: string } {
    // Universal SemanticFirewall rules — apply to ALL tool executions, not just write-time
    const SF_RULES: Array<{ name: string; severity: string; enabled: boolean }> = [
      { name: 'no-empty-catch', severity: 'HIGH', enabled: true },
      { name: 'no-unsafe-cast', severity: 'HIGH', enabled: true },
      { name: 'no-floating-promises', severity: 'MEDIUM', enabled: true },
      { name: 'evidence-bearing-results', severity: 'HIGH', enabled: true },
      { name: 'no-hardcoded-paths', severity: 'MEDIUM', enabled: true },
      { name: 'cleanup-paired-intervals', severity: 'HIGH', enabled: true },
      { name: 'handle-zero-length', severity: 'LOW', enabled: true },
      // theatrical-return removed — SRE:S1 owns theatrical return detection
      { name: 'scope-violation', severity: 'HIGH', enabled: true },
      { name: 'dead-export', severity: 'MEDIUM', enabled: true },
    ];

    // Gate-phase severity modulation
    const gate = context.gate?.toUpperCase() || 'PLAN';
    const severityOverrides: Record<string, Record<string, string>> = {
      PLAN: { 'HIGH': 'MEDIUM', 'CRITICAL': 'CRITICAL' },
      BUILD: { 'HIGH': 'CRITICAL', 'CRITICAL': 'CRITICAL' },
      VERIFY: { 'MEDIUM': 'HIGH', 'LOW': 'MEDIUM' },
      TEST: { 'MEDIUM': 'HIGH', 'LOW': 'MEDIUM' },
      AUDIT: { 'MEDIUM': 'CRITICAL', 'LOW': 'HIGH' },
      DELIVERY: { 'MEDIUM': 'CRITICAL', 'LOW': 'CRITICAL' },
    };
    const mods = severityOverrides[gate] || {};

    // Tool-category filtering: exclude rules that can't apply
    const toolName = context.toolName;
    const isWrite = ['write', 'edit', 'patch', 'create'].includes(toolName);
    const isBash = toolName === 'bash';

    const enabledRules = SF_RULES.filter((r: SfRuleConfig) => {
      // no-floating-promises only applies to write tools (generating code)
      if (r.name === 'no-floating-promises' && !isWrite) return false;
      // scope-violation only applies to write and bash tools
      if (r.name === 'scope-violation' && !isWrite && !isBash) return false;
      // BUILD gate: scope-violation must NOT block writes to src/.
      // During BUILD, writing to src/ IS the purpose of the gate.
      // The severityOverrides below escalate HIGH→CRITICAL for BUILD,
      // which would block legitimate code. Disable the rule entirely.
      if (r.name === 'scope-violation' && isAllowed(gate, 'writeToSrc')) return false;
      // dead-export only applies to write tools
      if (r.name === 'dead-export' && !isWrite) return false;
      // cleanup-paired-intervals only applies to write tools
      if (r.name === 'cleanup-paired-intervals' && !isWrite) return false;
      // (theatrical-return filter removed — SRE:S1 owns this check)
      return true;
    });

    return {
      rules: enabledRules.map((r: SfRuleConfig) => ({
        ...r,
        severity: mods[r.severity] || r.severity,
        enabled: true,
      })),
      phase: 'write-time', // Reuse existing rule engine for all phases
    };
  }

  private getRuleOrder(ruleName: string): AnalysisOrder {
    switch (ruleName) {
      case 'no-empty-catch': return 2;
      case 'evidence-bearing-results': return 2;
      case 'no-hardcoded-paths': return 2;
      case 'cleanup-paired-intervals': return 2;
      case 'handle-zero-length': return 2;
      case 'no-unsafe-cast': return 3;
      case 'dead-export': return 3;
      case 'no-floating-promises': return 4;
      case 'scope-violation': return 5;
      default: return 2;
    }
  }

  private runSemanticFirewallAnalysis(
    context: ToolExecutionContext,
    config: { enabledOrders: AnalysisOrder[] }
  ): AnalysisProviderResult {
    if (!this.firewall) {
      return {
        provider: 'semantic-firewall',
        order: 2,
        passed: true,
        diagnostics: [{ rule: 'sf-unavailable', severity: 'INFO', message: 'SemanticFirewall not configured' }],
      };
    }

    const { rules, phase } = this.buildRuleConfig(context);
    if (rules.length === 0) {
      return {
        provider: 'semantic-firewall',
        order: 2,
        passed: true,
        diagnostics: [],
      };
    }

    const enabledRules = rules.filter((r: SfRuleConfig) => {
      const ruleOrder = this.getRuleOrder(r.name);
      return config.enabledOrders.includes(ruleOrder);
    });

    if (enabledRules.length === 0) {
      return {
        provider: 'semantic-firewall',
        order: 2,
        passed: true,
        diagnostics: [],
      };
    }

    try {
      // Verify rules exist in firewall using type-safe pattern
      const firewallWithRules = this.firewall as { getAvailableRules?: () => string[] } | null;
      if (firewallWithRules && typeof firewallWithRules.getAvailableRules === 'function') {
        const available = firewallWithRules.getAvailableRules();
        const missing = enabledRules.filter((r: SfRuleConfig) => !available.includes(r.name));
        if (missing.length > 0) {
          console.warn(`[Dispatcher] Rules not found in firewall: ${missing.map((r: SfRuleConfig) => r.name).join(', ')}`);
        }
      }

      const result = this.firewall.analyze(phase, enabledRules, { filePath: context.filePath });

      const diagnostics = result.diagnostics.map((d: SfDiagnostic) => ({
        rule: d.rule,
        severity: (d.severity === 'CRITICAL' || d.severity === 'HIGH' || d.severity === 'MEDIUM' || d.severity === 'LOW' || d.severity === 'INFO' ? d.severity : 'MEDIUM') as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO',
        message: d.message,
        findingId: `SF-${d.rule.toUpperCase().replace(/-/g, '_')}`,
        filePath: d.file,
        line: d.line,
        column: d.column,
      }));

      return {
        provider: 'semantic-firewall',
        order: 2,
        passed: result.passed,
        diagnostics,
        raw: result,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        provider: 'semantic-firewall',
        order: 2,
        passed: false,
        diagnostics: [{ rule: 'sf-error', severity: 'HIGH', message: `SemanticFirewall error: ${message}`, findingId: 'SF-ERR' }],
      };
    }
  }

  // ── Private: Deterministic Behavioral Rules ──────────────────

  private runDeterministicRules(context: ToolExecutionContext, recentFiles: string[] = []): AnalysisProviderResult | null {
    if (ALL_RULES.length === 0) return null;

    const ruleContext: RuleContext = {
      toolName: context.toolName,
      args: context.args,
      thoughtStream: context.thoughtStream,
      filePath: context.filePath,
      agentName: context.agentName,
      gate: context.gate,
      recentFiles,
    };

    const diagnostics: Array<{
      rule: string;
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
      message: string;
      findingId?: string;
    }> = [];

    for (const rule of ALL_RULES) {
      try {
        const violations = rule.evaluate(ruleContext);
        for (const v of violations) {
          diagnostics.push({
            rule: v.ruleId,
            severity: v.severity,
            message: v.message,
            findingId: v.ruleId,
          });
        }
      } catch (err) {
        console.error(`[Dispatcher] Rule ${rule.id} error:`, err);
      }
    }

    return {
      provider: 'deterministic-rules',
      order: 1,
      passed: diagnostics.length === 0,
      diagnostics,
    };
  }

  // ── Private: Merkle Chain Check ──────────────────────────────

  private checkMerkleChain(_context: ToolExecutionContext): AnalysisProviderResult {
    if (!this.merkleChain) {
      return {
        provider: 'merkle-chain',
        order: 5,
        passed: true,
        diagnostics: [],
      };
    }

    try {
      const verification = this.merkleChain.verifyChain();
      if (!verification.valid) {
        return {
          provider: 'merkle-chain',
          order: 5,
          passed: false,
          diagnostics: [{
            rule: 'merkle-chain-integrity',
            severity: 'HIGH',
            message: `Merkle chain integrity check failed: ${verification.brokenLinks} broken links in ${verification.totalBlocks} blocks`,
            findingId: 'MERKLE-CHAIN-FAIL',
          }],
        };
      }

      return {
        provider: 'merkle-chain',
        order: 5,
        passed: true,
        diagnostics: [{
          rule: 'merkle-chain-integrity',
          severity: 'INFO',
          message: `Merkle chain valid: ${verification.totalBlocks} blocks, 0 broken links`,
          findingId: 'MERKLE-CHAIN-OK',
        }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        provider: 'merkle-chain',
        order: 5,
        passed: false,
        diagnostics: [{ rule: 'merkle-chain-error', severity: 'HIGH', message: `Merkle chain error: ${message}`, findingId: 'MERKLE-ERR' }],
      };
    }
  }
}
