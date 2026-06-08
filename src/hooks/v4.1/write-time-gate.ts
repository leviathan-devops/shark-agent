import { SemanticFirewall } from '../../semantic-firewall/semantic-firewall.js';
import { ExecutionContext } from '../../semantic-firewall/execution-context.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { StructuredBlockError } from '../../shark/enforcement-brain/enforcement-brain.js';
import type { RuleConfig, AnalysisPhase } from '../../semantic-firewall/types.js';

const WRITE_TIME_RULES: RuleConfig[] = [
  { name: 'no-empty-catch', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-unsafe-cast', severity: 'HIGH', enabled: true, orders: 3 },
  { name: 'no-floating-promises', severity: 'MEDIUM', enabled: true, orders: 4 },
  { name: 'evidence-bearing-results', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-hardcoded-paths', severity: 'MEDIUM', enabled: true, orders: 2 },
  { name: 'cleanup-paired-intervals', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'handle-zero-length', severity: 'LOW', enabled: true, orders: 2 },
  { name: 'dead-export', severity: 'MEDIUM', enabled: true, orders: 3 },
  { name: 'scope-violation', severity: 'HIGH', enabled: true, orders: 5 },
];

export function createWriteTimeGate(firewall: SemanticFirewall, context: ExecutionContext) {
  return async (input: Record<string, unknown>, output: Record<string, unknown>) => {
    const toolName = input?.tool || '';
    const WRITE_TOOLS = ['write', 'write_file', 'mcp_write_file', 'edit', 'mcp_edit', 'patch', 'mcp_patch', 'create', 'mcp_create', 'bash'];
    if (!WRITE_TOOLS.includes(toolName)) return;
    const agent = input?.agent || '';
    if (agent && !isSharkAgent(agent)) return;
    if ((toolName === 'write' || toolName === 'write_file' || toolName === 'edit' || toolName === 'mcp_edit' || toolName === 'patch' || toolName === 'mcp_patch' || toolName === 'create' || toolName === 'mcp_create') && context) {
      const filePath = typeof ((input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {}).filePath === 'string'
        ? ((input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {}).filePath
        : typeof ((input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {}).path === 'string'
        ? ((input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {}).path
        : '';
      if (filePath && !context.isSharkProjectFile(filePath)) {
        if (!context.isOperationAllowedForGate(toolName, filePath)) {
          throw new StructuredBlockError({
            level: 'BLOCK',
            lobe: 'semantic-firewall',
            findingId: 'SF-SCOPE-VIOLATION',
            message: '[HIGH] Scope violation: write to "' + filePath + '" is outside project root "' + context.projectRoot + '"',
            correction: 'Only write to files within the project directory'
          });
        }
      }
    }
    const args = (input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {};
    if (context.shouldAllowEngineeringOperation(toolName, args)) return;
    const result = firewall.analyze('write-time' as AnalysisPhase, WRITE_TIME_RULES);
    if (!result.passed) {
      const critical = result.diagnostics.filter(d => d.severity === 'CRITICAL' || d.severity === 'HIGH');
      if (critical.length > 0) {
        const first = critical[0];
        throw new StructuredBlockError({ level: 'BLOCK', lobe: 'semantic-firewall', findingId: 'SF-' + first.rule.toUpperCase(), message: '[' + first.severity + '] ' + first.message, correction: first.message });
      }
    }
    if (WRITE_TOOLS.includes(toolName) && toolName !== 'bash') {
      const filePath = typeof args.filePath === 'string' ? args.filePath : '';
      if (filePath) context.recordEdit(toolName, filePath);
    }
  };
}
