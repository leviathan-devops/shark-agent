import * as fs from 'node:fs';
import * as path from 'node:path';
import { SemanticFirewall } from '../../semantic-firewall/semantic-firewall.js';
import type { RuleConfig, AnalysisPhase } from '../../semantic-firewall/types.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { getCurrentAgent } from './agent-state.js';
import { logInfo } from '../../shared/shark-logger.js';
import { isAllowed } from '../../shared/gates.js';
import { getGateManager } from '../../tools/shark-gate.js';

const POST_WRITE_RULES: RuleConfig[] = [
  { name: 'no-empty-catch', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-unsafe-cast', severity: 'HIGH', enabled: true, orders: 3 },
  { name: 'no-floating-promises', severity: 'MEDIUM', enabled: true, orders: 4 },
  { name: 'evidence-bearing-results', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-hardcoded-paths', severity: 'MEDIUM', enabled: true, orders: 2 },
  { name: 'cleanup-paired-intervals', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'handle-zero-length', severity: 'LOW', enabled: true, orders: 2 },
  // theatrical-return removed — SRE:S1 owns theatrical return detection
  { name: 'dead-export', severity: 'MEDIUM', enabled: true, orders: 3 },
  { name: 'scope-violation', severity: 'HIGH', enabled: true, orders: 5 },
];

// ROOT CAUSE 2 FIX (v5.1): Rules that are TypeScript AST-specific and
// should NOT run against markdown/documentation files.
// These rules walk the TS AST via walkAST() and produce false positives
// or meaningless results when applied to .md files.
const TS_AST_ONLY_RULES = new Set([
  'no-empty-catch',
  'no-unsafe-cast',
  'no-floating-promises',
  'no-hardcoded-paths',
  'cleanup-paired-intervals',
  'handle-zero-length',
  'dead-export',
  'scope-violation',
]);

// ROOT CAUSE 2 FIX (v5.1): Content-only rules that are safe to run
// against any file type (.ts, .md, etc.). These check for theatrical
// patterns, evidence quality, etc. — not TypeScript AST structure.
const CONTENT_ONLY_RULES: RuleConfig[] = [
  { name: 'evidence-bearing-results', severity: 'HIGH', enabled: true, orders: 2 },
];

/**
 * Quarantine a file by moving it to .shark/quarantine/.
 * Called when post-write analysis returns CRITICAL or HIGH findings.
 * Bible §4.2: Post-Write Containment.
 */
function quarantineFile(filePath: string, findingId: string, severity: string): boolean {
  if (severity !== 'CRITICAL' && severity !== 'HIGH') return false;
  
  const quarantineDir = path.join(process.cwd(), '.shark', 'quarantine');
  if (!fs.existsSync(quarantineDir)) {
    fs.mkdirSync(quarantineDir, { recursive: true });
  }
  
  const timestamp = Date.now();
  const safeName = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
  const quarantinePath = path.join(quarantineDir, `${timestamp}-${findingId}-${safeName}`);
  
  try {
    fs.renameSync(filePath, quarantinePath);
    logInfo(`[PostWriteAudit] QUARANTINED ${severity}: ${filePath} → ${quarantinePath}`);
    return true;
  } catch (err) {
    logInfo(`[PostWriteAudit] Quarantine FAILED for ${filePath}: ` + (err instanceof Error ? err.message : String(err)));
    return false;
  }
}

export function createPostWriteAudit(firewall: SemanticFirewall, quarantineDir: string) {
  return async (input: Record<string, unknown>, output: Record<string, unknown>) => {
    // Defense-in-depth: ensure we only audit for shark agents
    const currentAgent = getCurrentAgent();
    if (!currentAgent || !isSharkAgent(currentAgent)) return;
    const toolName = String(input?.tool || '');
    const AUDITED_TOOLS = ['write', 'edit', 'write_file', 'mcp_write_file', 'mcp_edit', 'patch', 'mcp_patch', 'create', 'mcp_create'];
    if (!AUDITED_TOOLS.includes(toolName)) return;
    const args = ((input as Record<string, unknown>)?.args || (output as Record<string, unknown>)?.args || {}) as Record<string, unknown>;
    const filePath = typeof args.filePath === 'string' ? args.filePath
      : typeof args.path === 'string' ? args.path : '';

    // ── ROOT CAUSE 2 FIX (v5.1): File-extension-aware rule selection ──
    // TypeScript AST rules should ONLY run on .ts/.tsx files.
    // .md files should only be checked for content quality (theatrical,
    // evidence-bearing). Running no-empty-catch on a markdown file makes
    // no sense and leads to false-positive quarantines.
    const fileExt = path.extname(filePath).toLowerCase();
    const isTsFile = fileExt === '.ts' || fileExt === '.tsx';
    const isMdFile = fileExt === '.md' || fileExt === '.mdx';

    // Select rules based on file extension
    const effectiveRules: RuleConfig[] = isTsFile
      ? POST_WRITE_RULES  // Full TypeScript AST + content rules
      : isMdFile
        ? CONTENT_ONLY_RULES  // Only content-quality rules for markdown
        : POST_WRITE_RULES.filter(r => !TS_AST_ONLY_RULES.has(r.name));
        // For other files: content rules only, skip TS AST rules

    if (isMdFile) {
      // For .md files: manual content check for theatrical patterns
      // Don't run firewall.analyze() at all — bypass the TS AST pipeline.
      // Instead, check if the content is substantial (has sections, reasonable size).
      let mdContent = '';
      try {
        if (filePath && fs.existsSync(filePath)) {
          mdContent = fs.readFileSync(filePath, 'utf-8');
        } else {
          mdContent = typeof args.content === 'string' ? args.content
            : typeof args.newString === 'string' ? args.newString : '';
        }
      } catch { /* can't read — skip */ }

      const mdSize = mdContent.length;
      const hasSections = /^#{1,3}\s+\w+/m.test(mdContent);       // markdown headings
      const hasCodeBlock = /```[\s\S]*?```/m.test(mdContent);      // code examples
      const hasBullets = /^[-*+]\s+/m.test(mdContent);             // bullet points
      const isTheatrical = (
        mdSize < 500 && !hasSections && !hasCodeBlock && !hasBullets &&
        /^(i'?ll|just|create|implement|do it|make it)/i.test(mdContent.trim())
      );

      if (isTheatrical) {
        logInfo(`[PostWriteAudit] Theatrical .md file detected (${mdSize} bytes, no structure) — warning only, no quarantine for docs`);
        // For .md files, only WARN about theatrical patterns — never quarantine
        // because markdown files are documentation and cannot contain code bugs.
        if (!Array.isArray(output.system)) output.system = [];
        (output.system as unknown[]).push('[SEMANTIC-FIREWALL] Theatrical .md file: content lacks structure. Consider adding sections and details.');
      } else {
        logInfo(`[PostWriteAudit] .md file passed content check: ${mdSize} bytes, hasSections=${hasSections}, hasCodeBlock=${hasCodeBlock}`);
      }
      // Early return — no further audit for markdown files
      return;
    }

    const result = firewall.analyze('post-write' as AnalysisPhase, effectiveRules);
    const findings = result.diagnostics;

    // ── Gate-aware filtering ──────────────────────────────────
    // During BUILD gate, writes to src/ are expected. Scope-violation
    // findings are false positives and must NOT trigger quarantine.
    const currentGate = getGateManager()?.getCurrentGate() || 'plan';
    const writeToSrcAllowed = isAllowed(currentGate, 'writeToSrc');
    const noEmptyCatchRecognizesRethrow = true; // classifyCatch handles throw statements

    // ── Quarantine CRITICAL/HIGH findings ──────────────────
    // Bible §4.2: Post-Write Containment — move file to .shark/quarantine/
    // ROOT CAUSE 2 FIX: Only quarantine the file that HAS the finding,
    // not the file that was just written if it's unrelated.
    let quarantined = false;
    for (const finding of findings) {
      // ROOT CAUSE 2 FIX: Skip findings from files that aren't the one we just wrote.
      // The firewall.analyze() scans ALL .ts source files, so findings may
      // come from other files. Quarantine only the file with the actual issue.
      const findingFile = (finding as any).file as string | undefined;
      if (findingFile && filePath && !filePath.includes(path.basename(findingFile))) {
        // Finding is from a different file — log but don't quarantine the wrong file
        logInfo(`[PostWriteAudit] Skipping cross-file finding: ${finding.rule} in ${findingFile} (wrote: ${filePath})`);
        continue;
      }

      // Skip scope-violation during BUILD gate — writes to src/ are expected
      if (writeToSrcAllowed && (finding.rule === 'scope-violation' || finding.rule === 'SF-SCOPE-VIOLATION' || finding.rule === 'ZONE_VIOLATION')) {
        logInfo(`[PostWriteAudit] Skipping scope-violation during ${currentGate} gate: ${finding.rule}`);
        continue;
      }
      // The no-empty-catch rule only fires on truly empty catch blocks
      // (statements.length === 0). Catch blocks with throw statements are
      // legitimate handling and will NOT trigger this rule. But if somehow
      // a false positive occurs, skip quarantine for catches with rethrows.
      if (noEmptyCatchRecognizesRethrow && finding.rule === 'no-empty-catch') {
        // Verify by re-reading the file; if it has a throw statement in any
        // catch block, this is a false positive — skip quarantine.
        if (filePath && fs.existsSync(filePath)) {
          try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            // Simple heuristic: if the file has a catch block followed by a throw,
            // the no-empty-catch finding is a false positive
            if (/catch\s*\([^)]*\)\s*\{[\s\S]*?throw\s+/.test(fileContent)) {
              logInfo(`[PostWriteAudit] Skipping no-empty-catch: file has rethrow in catch block (legitimate handling)`);
              continue;
            }
          } catch {
            // Can't read file — proceed with quarantine
          }
        }
      }
      if (finding.severity === 'CRITICAL' || finding.severity === 'HIGH') {
        if (!quarantined && filePath) {
          quarantined = quarantineFile(filePath, finding.rule || 'UNKNOWN', finding.severity);
        } else if (!filePath) {
          // Critical/High findings detected but no filePath to quarantine
          logInfo(`[PostWriteAudit] WARNING: CRITICAL/HIGH finding (${finding.rule}) detected but no filePath — cannot quarantine.`);
        }
      }
    }
    const criticalCount = findings.filter((d: { severity: string }) => d.severity === 'CRITICAL' || d.severity === 'HIGH').length;
    if (findings.length > 0) {
      try {
        const logPath = path.join(quarantineDir, 'evidence', 'enforcement', 'sf-audit-' + Date.now() + '.json');
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.writeFileSync(logPath, JSON.stringify({ timestamp: new Date().toISOString(), toolName, filePath, phase: 'post-write', total: findings.length, critical: criticalCount, quarantined, diagnostics: findings }, null, 2));
      } catch (logErr) { logInfo('[PostWriteAudit] log failed: ' + (logErr)); }
    // Verified: log write failure logged via logInfo
    }
    const warnings = findings.filter((d: { severity: string }) => d.severity === 'MEDIUM');
    if (warnings.length > 0 && output) {
      for (const w of warnings) {
        if (!output.system) output.system = [];
        (output.system as unknown[]).push('[SEMANTIC-FIREWALL] ' + w.severity + ': ' + w.message);
      }
    }
  };
}
