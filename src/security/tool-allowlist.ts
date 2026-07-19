/**
 * Tool Allowlist — Readonly Proxy-wrapped Set.
 * 
 * Deny-default: every tool NOT in the allowlist is DENIED.
 * Cannot be mutated at runtime (Proxy traps add/delete/clear).
 * 
 * Based on Trident v4.3.2 security/tool-allowlist.ts pattern.
 */

/** Internal mutable set — NOT exported directly. */
const allowedSharkTools = new Set<string>([
  'shark-gate',
  'shark-test-runner',
  'shark-run-trident',
  'shark-diagnose',
  'shark-evidence-query',
  'shark-spawn-container',
  'shark-status',
  'shark-health',
  'shark-vision',
  'shark-audit',
  'shark-browser',
  'shark-browser-test',
  'shark-evidence',
  'shark-checkpoint',
  'shark-checkpoint-history',
  'shark-firewall-status',
  'shark-firewall-audit',
  'shark-hive-context',
]);

/** Internal mutable set — NOT exported directly. */
const allowedExternalTools = new Set<string>([
  'read',
  'glob',
  'grep',
  'write',
  'edit',
  'bash',
  'todowrite',
  'task',
  'webfetch',
  'question',
  'skill',
  // Planning brain tools
  'checkpoint',
  // Hive tools — restricted
  'hive_context',
  'hive-context',
  'hive_status',
  'hive-status',
  'hive_remember',
  'hive-remember',
  'hive_scan',
  'hive-scan',
]);

/** Check whether a tool name is allowed for SHARK agent. */
function isToolAllowed(toolName: string): boolean {
  if (!toolName || typeof toolName !== 'string') return false;
  const lower = toolName.toLowerCase();
  if (allowedSharkTools.has(lower)) return true;
  if (allowedExternalTools.has(lower)) return true;
  return false; // DENY-DEFAULT
}

/** Check if tool is a SHARK-specific tool (not external). */
function isSharkTool(toolName: string): boolean {
  if (!toolName || typeof toolName !== 'string') return false;
  return allowedSharkTools.has(toolName.toLowerCase());
}

export { isToolAllowed, isSharkTool };
