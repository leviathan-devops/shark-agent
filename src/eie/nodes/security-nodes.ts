/**
 * src/eie/nodes/security-nodes.ts — 25 Security Knowledge Nodes
 *
 * From KB-06 Adversarial Resilience:
 * - Prompt injection (5 categories with AST patterns)
 * - Enforcement gaming (5 patterns)
 * - Supply chain analysis (blast radius, cycles)
 * - Capability models (5 domains)
 * - Information flow control (lattice, taint)
 * - Red team fuzzing (adversarial corpus)
 * - Cross-detector correlation
 *
 * Source: KB-06_ADVERSARIAL_RESILIENCE.md
 */

import type { KnowledgeNode } from '../types';

// ══ PROMPT INJECTION (5 categories) ════════════════════════════

export const SEC_INJECTION_DIRECT: KnowledgeNode = {
  id: 'SEC-INJECTION-DIRECT',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'PROMPT INJECTION — DIRECT: Attacker embeds malicious instructions directly in input text. Detection: AST scan for string concatenation in system prompts.',
  detectionMethod: 'AST: Find StringLiteral concatenation in system prompt construction. Flag dynamic prompt building without sanitization.',
  fixTemplate: 'Never concatenate user input into system prompts. Use template parameters with escaping.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-INJECTION-DIRECT: Dynamic prompt construction from user input. Sanitize or parameterize.',
  warheadTemplate: 'Direct prompt injection allows attackers to override system instructions.',
  evidenceSpec: { id: 'no-direct-injection', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-INJECTION-INDIRECT', 'SEC-INJECTION-TEMPLATE', 'SEC-INFO-FLOW-TAINT'],
  selfVerified: true,
};

export const SEC_INJECTION_INDIRECT: KnowledgeNode = {
  id: 'SEC-INJECTION-INDIRECT',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'PROMPT INJECTION — INDIRECT: Malicious instructions embedded in data sources (files, API responses, web content) that the agent processes.',
  detectionMethod: 'Trace data flow from external sources (fs.readFile, fetch response) to prompt construction. Flag unvalidated data used in prompts.',
  fixTemplate: 'Sanitize all external data before use in prompts. Strip instruction-like patterns. Use allowlists.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-INJECTION-INDIRECT: External data used in prompt without sanitization.',
  warheadTemplate: 'Indirect injection via data sources is harder to detect. Sanitize all external inputs.',
  evidenceSpec: { id: 'no-indirect-injection', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-INJECTION-DIRECT', 'SEC-INFO-FLOW-TAINT'],
  selfVerified: true,
};

export const SEC_INJECTION_TEMPLATE: KnowledgeNode = {
  id: 'SEC-INJECTION-TEMPLATE',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'PROMPT INJECTION — TEMPLATE: Injection via template literals where user input is embedded in prompt templates without escaping.',
  detectionMethod: 'AST: Find template literal expressions (TemplateExpression) in prompt construction. Flag ${userInput} patterns.',
  fixTemplate: 'Use safe prompt builder: buildPrompt(systemPart, sanitizedUserPart). No raw template interpolation.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-INJECTION-TEMPLATE: Template literal with user input in prompt. Use safe builder.',
  warheadTemplate: 'Template injection allows user input to break out of intended prompt structure.',
  evidenceSpec: { id: 'no-template-injection', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-INJECTION-DIRECT', 'SEC-INJECTION-INDIRECT'],
  selfVerified: true,
};

export const SEC_INJECTION_TOOL: KnowledgeNode = {
  id: 'SEC-INJECTION-TOOL',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'PROMPT INJECTION — TOOL MEDIATED: Injection through tool descriptions, tool results, or tool parameter schemas.',
  detectionMethod: 'Scan tool descriptions and parameter schemas for instruction-like content. Validate tool results before use.',
  fixTemplate: 'Tool descriptions are static and reviewed. Tool results are validated with schema before processing.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-INJECTION-TOOL: Tool result or description contains injection. Validate and sanitize.',
  warheadTemplate: 'Tool-mediated injection exploits the agent\'s trust in tool outputs.',
  evidenceSpec: { id: 'no-tool-injection', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-INJECTION-INDIRECT', 'SEC-CAPABILITY-PROCESS'],
  selfVerified: true,
};

export const SEC_INJECTION_ENCODING: KnowledgeNode = {
  id: 'SEC-INJECTION-ENCODING',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'PROMPT INJECTION — ENCODING: Injection via encoded content (base64, unicode escapes, HTML entities) that decodes to malicious instructions.',
  detectionMethod: 'Find decode operations (atob, Buffer.from base64, JSON.parse of user data) feeding into prompt construction.',
  fixTemplate: 'Decode in sandbox. Validate decoded content against allowlist. Never pass raw decoded content to prompt.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-INJECTION-ENCODING: Decoded user content in prompt. Validate after decoding.',
  warheadTemplate: 'Encoded injection bypasses simple string filters. Validate after decoding.',
  evidenceSpec: { id: 'no-encoding-injection', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-INJECTION-DIRECT', 'SEC-INJECTION-INDIRECT'],
  selfVerified: true,
};

// ══ ENFORCEMENT GAMING (5 patterns) ════════════════════════════

export const SEC_GAMING_BYPASS: KnowledgeNode = {
  id: 'SEC-GAMING-BYPASS',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'ENFORCEMENT GAMING — BYPASS: Agent attempts to bypass enforcement by using alternative code paths.',
  detectionMethod: 'Monitor all code paths. Ensure enforcement hooks cover every entry point.',
  fixTemplate: 'Enforcement is on tool.before — ALL tools pass through it. No bypass paths.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-GAMING-BYPASS: Enforcement bypass attempt detected. All paths are covered.',
  warheadTemplate: 'Enforcement bypass attempts must be detected and blocked.',
  evidenceSpec: { id: 'no-bypass', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['AP-TOOL-BLOCKING-BYPASS', 'FX-25-FIX-TOOL-BYPASS'],
  selfVerified: true,
};

export const SEC_GAMING_WEAKENING: KnowledgeNode = {
  id: 'SEC-GAMING-WEAKEN',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'ENFORCEMENT GAMING — WEAKENING: Agent reduces enforcement severity to avoid blocks.',
  detectionMethod: 'Monitor severity changes. Track if rules are downgraded from block to warn/guide.',
  fixTemplate: 'Severity levels are static. No runtime modification. No downgrade paths.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-GAMING-WEAKEN: Enforcement severity weakened. Restore original levels.',
  warheadTemplate: 'Severity levels must be immutable. No runtime modification allowed.',
  evidenceSpec: { id: 'no-weakening', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['AP-UNDERMINING', 'FX-35-FIX-UNDERMINING'],
  selfVerified: true,
};

export const SEC_GAMING_DISABLE: KnowledgeNode = {
  id: 'SEC-GAMING-DISABLE',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'ENFORCEMENT GAMING — DISABLING: Agent disables enforcement rules entirely.',
  detectionMethod: 'Monitor rule registration. Track if rules are removed from active set.',
  fixTemplate: 'Rules are registered at startup. No runtime removal. Rule set is immutable.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-GAMING-DISABLE: Enforcement rule disabled. Rules are immutable.',
  warheadTemplate: 'Disabling enforcement rules is a critical security violation.',
  evidenceSpec: { id: 'no-disabling', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['AP-ENV-VAR-BYPASS', 'FX-24-FIX-ENV-VAR-BYPASS'],
  selfVerified: true,
};

export const SEC_GAMING_SPOOF: KnowledgeNode = {
  id: 'SEC-GAMING-SPOOF',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'ENFORCEMENT GAMING — SPOOFING: Agent spoofs enforcement results to appear compliant.',
  detectionMethod: 'Cross-reference enforcement results with mechanical evidence. Verify each result independently.',
  fixTemplate: 'Enforcement results are mechanically produced. Each result is independently verified.',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT'] }],
  bulletTemplate: 'SEC-GAMING-SPOOF: Enforcement result spoofed. Verify independently.',
  warheadTemplate: 'Spoofed enforcement results are detected by cross-referencing with mechanical evidence.',
  evidenceSpec: { id: 'no-spoofing', verify: 'claim-reality', minQuality: 0.99 },
  severity: 'block',
  layer: 5,
  links: ['AP-EVIDENCE-FABRICATION', 'FM-11-EVIDENCE-FABRICATION'],
  selfVerified: true,
};

export const SEC_GAMING_REPLAY: KnowledgeNode = {
  id: 'SEC-GAMING-REPLAY',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'ENFORCEMENT GAMING — REPLAY: Agent replays old evidence to satisfy new requirements.',
  detectionMethod: 'Check evidence timestamps. Verify evidence was produced AFTER the current gate entry.',
  fixTemplate: 'Evidence is timestamped. Stale evidence (>1 gate old) is rejected. Fresh evidence required.',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT', 'DELIVERY'] }],
  bulletTemplate: 'SEC-GAMING-REPLAY: Stale evidence replayed. Produce fresh evidence.',
  warheadTemplate: 'Replaying old evidence is evidence fabrication. Fresh evidence required per gate.',
  evidenceSpec: { id: 'no-replay', verify: 'fs-check', minQuality: 0.99 },
  severity: 'block',
  layer: 5,
  links: ['AP-EVIDENCE-FABRICATION'],
  selfVerified: true,
};

// ══ SUPPLY CHAIN ANALYSIS ══════════════════════════════════════

export const SEC_SUPPLY_BLAST_RADIUS: KnowledgeNode = {
  id: 'SEC-SUPPLY-BLAST-RADIUS',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'SUPPLY CHAIN — BLAST RADIUS: Analyze dependency blast radius. How many files/functions are affected by a dependency change?',
  detectionMethod: 'Build dependency graph. For each dependency, count downstream consumers. Flag high blast radius deps.',
  fixTemplate: 'Minimize direct dependencies. Use interfaces to reduce blast radius. Isolate critical deps.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-SUPPLY-BLAST: High blast radius dependency ({dep}). Minimize consumers.',
  warheadTemplate: 'High blast radius means a single dependency failure cascades widely.',
  evidenceSpec: { id: 'blast-radius', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'warn',
  layer: 3,
  links: ['SEC-SUPPLY-CYCLES', 'R6-DEPENDENCY-INTEGRITY'],
  selfVerified: true,
};

export const SEC_SUPPLY_CYCLES: KnowledgeNode = {
  id: 'SEC-SUPPLY-CYCLES',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'SUPPLY CHAIN — CIRCULAR DEPENDENCIES: Detect circular imports. Circular deps cause initialization order bugs.',
  detectionMethod: 'Build import graph. Detect cycles with DFS. Flag any circular dependency.',
  fixTemplate: 'Break cycles by extracting shared code into a separate module. Use interfaces to break compile-time cycles.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'SEC-SUPPLY-CYCLES: Circular dependency detected ({a} → {b} → {a}). Break the cycle.',
  warheadTemplate: 'Circular dependencies cause undefined import errors and initialization order bugs.',
  evidenceSpec: { id: 'no-cycles', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 3,
  links: ['SEC-SUPPLY-BLAST-RADIUS', 'R6-DEPENDENCY-INTEGRITY'],
  selfVerified: true,
};

export const SEC_SUPPLY_INTEGRITY: KnowledgeNode = {
  id: 'SEC-SUPPLY-INTEGRITY',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'SUPPLY CHAIN — INTEGRITY: Verify package integrity with checksums. Lock file must be present and verified.',
  detectionMethod: 'Check for lock file (bun.lockb, package-lock.json). Verify checksums match.',
  fixTemplate: 'Use bun.lockb. Pin exact versions. Verify checksums on install.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-SUPPLY-INTEGRITY: No lock file or checksum mismatch. Pin and verify.',
  warheadTemplate: 'Supply chain integrity prevents dependency injection attacks.',
  evidenceSpec: { id: 'supply-integrity', verify: 'fs-check', minQuality: 0.95 },
  severity: 'warn',
  layer: 3,
  links: ['SEC-SUPPLY-BLAST-RADIUS', 'SEC-SUPPLY-CYCLES'],
  selfVerified: true,
};

// ══ CAPABILITY MODELS (5 domains) ═════════════════════════════

export const SEC_CAPABILITY_FS: KnowledgeNode = {
  id: 'SEC-CAPABILITY-FS',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'CAPABILITY MODEL — FILESYSTEM: Declared filesystem access boundaries. Agent can only access declared paths.',
  detectionMethod: 'Find fs operations. Check against declared capability (allowlist of paths). Flag out-of-bounds access.',
  fixTemplate: 'const ALLOWED_PATHS = ["/tmp", path.join(cwd, "src")]; if (!ALLOWED_PATHS.some(p => target.startsWith(p))) throw new Error("denied");',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-CAPABILITY-FS: Filesystem access outside declared boundaries. Deny.',
  warheadTemplate: 'Filesystem capability boundaries prevent unauthorized file access.',
  evidenceSpec: { id: 'fs-capability', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-CAPABILITY-NETWORK', 'SEC-CAPABILITY-PROCESS'],
  selfVerified: true,
};

export const SEC_CAPABILITY_NETWORK: KnowledgeNode = {
  id: 'SEC-CAPABILITY-NETWORK',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'CAPABILITY MODEL — NETWORK: Declared network endpoints. Agent can only access approved URLs/hosts.',
  detectionMethod: 'Find fetch/http/WebSocket calls. Check against declared endpoints allowlist.',
  fixTemplate: 'const ALLOWED_HOSTS = ["api.example.com"]; const url = new URL(target); if (!ALLOWED_HOSTS.includes(url.hostname)) throw new Error("denied");',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-CAPABILITY-NETWORK: Network access to unapproved host. Deny.',
  warheadTemplate: 'Network capability boundaries prevent data exfiltration.',
  evidenceSpec: { id: 'network-capability', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-CAPABILITY-FS', 'AP-NETWORK-EGRESS'],
  selfVerified: true,
};

export const SEC_CAPABILITY_PROCESS: KnowledgeNode = {
  id: 'SEC-CAPABILITY-PROCESS',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'CAPABILITY MODEL — PROCESS: Declared process execution capabilities. Agent can only spawn approved commands.',
  detectionMethod: 'Find exec/execSync/spawn calls. Check against declared command allowlist.',
  fixTemplate: 'const ALLOWED_CMDS = ["bun", "tsc", "git"]; const cmd = args[0]; if (!ALLOWED_CMDS.includes(cmd)) throw new Error("denied");',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-CAPABILITY-PROCESS: Process execution outside declared capabilities. Deny.',
  warheadTemplate: 'Process capability boundaries prevent arbitrary code execution.',
  evidenceSpec: { id: 'process-capability', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-CAPABILITY-FS', 'SEC-CAPABILITY-NETWORK'],
  selfVerified: true,
};

export const SEC_CAPABILITY_ENV: KnowledgeNode = {
  id: 'SEC-CAPABILITY-ENV',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'CAPABILITY MODEL — ENVIRONMENT: Declared environment variable access. Agent can only read approved env vars.',
  detectionMethod: 'Find process.env accesses. Check against declared env var allowlist.',
  fixTemplate: 'const ALLOWED_ENV = ["NODE_ENV", "PORT", "LOG_LEVEL"]; if (!ALLOWED_ENV.includes(key)) throw new Error("denied");',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-CAPABILITY-ENV: Environment variable access outside allowlist. Deny.',
  warheadTemplate: 'Environment capability boundaries prevent secret leakage.',
  evidenceSpec: { id: 'env-capability', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-CAPABILITY-FS', 'AP-ENV-VAR-BYPASS'],
  selfVerified: true,
};

export const SEC_CAPABILITY_MEMORY: KnowledgeNode = {
  id: 'SEC-CAPABILITY-MEMORY',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'CAPABILITY MODEL — MEMORY: Declared memory budget. Agent cannot exceed allocated memory/heap.',
  detectionMethod: 'Monitor process.memoryUsage(). Flag if exceeds declared budget.',
  fixTemplate: 'const MAX_HEAP = 512 * 1024 * 1024; if (process.memoryUsage().heapUsed > MAX_HEAP) throw new Error("memory budget exceeded");',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-CAPABILITY-MEMORY: Memory usage exceeds budget. Optimize or increase budget.',
  warheadTemplate: 'Memory capability prevents resource exhaustion attacks.',
  evidenceSpec: { id: 'memory-capability', verify: 'fs-check', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['SEC-CAPABILITY-PROCESS'],
  selfVerified: true,
};

// ══ INFORMATION FLOW CONTROL ══════════════════════════════════

export const SEC_INFO_FLOW_LATTICE: KnowledgeNode = {
  id: 'SEC-INFO-FLOW-LATTICE',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'INFORMATION FLOW — LATTICE: Sensitivity labels (public, internal, confidential, secret). Data can only flow to equal or higher labels.',
  detectionMethod: 'Tag data with sensitivity labels. Track flow. Flag data flowing from high to low label.',
  fixTemplate: 'type Label = "public" | "internal" | "confidential" | "secret"; function canFlow(from: Label, to: Label): boolean { return LABEL_ORDER[from] <= LABEL_ORDER[to]; }',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-INFO-FLOW-LATTICE: Data flowing from {high} to {low} label. Prevent downgrade.',
  warheadTemplate: 'Lattice-based information flow prevents sensitive data leakage.',
  evidenceSpec: { id: 'info-flow-lattice', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'warn',
  layer: 3,
  links: ['SEC-INFO-FLOW-TAINT'],
  selfVerified: true,
};

export const SEC_INFO_FLOW_TAINT: KnowledgeNode = {
  id: 'SEC-INFO-FLOW-TAINT',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'INFORMATION FLOW — TAINT TRACKING: Track taint from untrusted sources through the program. Tainted data must be sanitized before use.',
  detectionMethod: 'DFA: Track data from untrusted sources (user input, network, file). Flag tainted data used in sensitive sinks (eval, exec, prompt).',
  fixTemplate: 'Tag data as tainted on input. Propagate taint through operations. Require sanitization before sensitive use.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-INFO-FLOW-TAINT: Tainted data used in sensitive sink. Sanitize first.',
  warheadTemplate: 'Taint tracking prevents injection by tracking untrusted data to sensitive sinks.',
  evidenceSpec: { id: 'taint-tracked', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 3,
  links: ['SEC-INFO-FLOW-LATTICE', 'SEC-INJECTION-DIRECT'],
  selfVerified: true,
};

// ══ RED TEAM FUZZING ═══════════════════════════════════════════

export const SEC_REDTIME_FUZZ: KnowledgeNode = {
  id: 'SEC-REDTIME-FUZZ',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'RED TEAM FUZZING: Test with adversarial corpus — injection attempts, edge cases, oversized payloads, unicode tricks.',
  detectionMethod: 'Run fuzzing with adversarial corpus. Check for crashes, unhandled errors, or unexpected behavior.',
  fixTemplate: 'Create adversarial corpus: SQL injection, XSS, path traversal, unicode, oversized, null bytes. Run as test inputs.',
  conditions: [{ field: 'gate', op: 'in', value: ['TEST', 'AUDIT'] }],
  bulletTemplate: 'SEC-REDTIME-FUZZ: No adversarial fuzzing tests. Add adversarial corpus.',
  warheadTemplate: 'Red team fuzzing finds vulnerabilities that normal testing misses.',
  evidenceSpec: { id: 'redteam-fuzz', verify: 'test-run', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['TEST-NEGATIVE-SECURITY', 'SEC-INJECTION-DIRECT'],
  selfVerified: true,
};

export const SEC_CROSS_DETECTOR: KnowledgeNode = {
  id: 'SEC-CROSS-DETECTOR',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'CROSS-DETECTOR CORRELATION: Multiple detectors that individually seem benign but together indicate a systematic bypass. Example: `any` type + empty catch = systematic error swallowing.',
  detectionMethod: 'Cross-reference findings from multiple detectors. Flag co-occurrence patterns that indicate systematic issues.',
  fixTemplate: 'Implement correlation engine: if detector A (any type) AND detector B (empty catch) co-occur, escalate to CRITICAL.',
  conditions: [{ field: 'gate', op: 'in', value: ['AUDIT'] }],
  bulletTemplate: 'SEC-CROSS-DETECTOR: Pattern {a} + {b} = systematic bypass. Escalate to CRITICAL.',
  warheadTemplate: 'Cross-detector correlation catches systematic issues that individual detectors miss.',
  evidenceSpec: { id: 'cross-detector', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 5,
  links: ['AP-UNSAFE-CAST', 'AP-EMPTY-CATCH'],
  selfVerified: true,
};

export const SEC_SANDBOX_ISOLATION: KnowledgeNode = {
  id: 'SEC-SANDBOX-ISOLATION',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'SANDBOX ISOLATION: Container must be fully isolated from host. No shared filesystem, no host network, no host processes.',
  detectionMethod: 'Check container config for volume mounts, network modes, pid namespace sharing.',
  fixTemplate: 'Container config: no --volume mounts to host, network mode = bridge, pid = private.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-SANDBOX-ISOLATION: Container has host access. Isolate completely.',
  warheadTemplate: 'Sandbox isolation prevents container escape attacks.',
  evidenceSpec: { id: 'sandbox-isolated', verify: 'fs-check', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['AP-CONTAINER-ESCAPE', 'FX-27-FIX-CONTAINER-ESCAPE'],
  selfVerified: true,
};

export const SEC_NETWORK_MODEL: KnowledgeNode = {
  id: 'SEC-NETWORK-MODEL',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'NETWORK MODEL: All network access must be explicitly declared and enforced. No default-allow.',
  detectionMethod: 'Find all network calls. Verify each is in the declared network capability allowlist.',
  fixTemplate: 'Default-deny network model. Each endpoint explicitly allowed. All others denied.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-NETWORK-MODEL: Undeclared network access. Add to allowlist or deny.',
  warheadTemplate: 'Default-deny network model prevents unauthorized data exfiltration.',
  evidenceSpec: { id: 'network-model', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-CAPABILITY-NETWORK', 'AP-NETWORK-EGRESS'],
  selfVerified: true,
};

export const SEC_TIMING_ATTACK: KnowledgeNode = {
  id: 'SEC-TIMING-ATTACK',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'TIMING ATTACK RESISTANCE: Comparison operations on secrets must use constant-time comparison to prevent timing side channels.',
  detectionMethod: 'Find string/array comparisons on secrets (passwords, tokens). Flag non-constant-time comparisons.',
  fixTemplate: 'Use crypto.timingSafeEqual(a, b) for secret comparisons. Never use === or !== for secrets.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-TIMING-ATTACK: Non-constant-time comparison on secret. Use crypto.timingSafeEqual.',
  warheadTemplate: 'Timing attacks extract secrets by measuring comparison execution time.',
  evidenceSpec: { id: 'timing-safe', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'warn',
  layer: 3,
  links: ['SEC-INFO-FLOW-TAINT'],
  selfVerified: true,
};

export const SEC_AUDIT_TRAIL: KnowledgeNode = {
  id: 'SEC-AUDIT-TRAIL',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'AUDIT TRAIL: All security-relevant actions must be logged with immutable append-only audit trail.',
  detectionMethod: 'Find security-relevant operations (auth, access, config change). Verify each is logged.',
  fixTemplate: 'Append to audit log: log.append({ timestamp, action, actor, resource, result }). Log is append-only.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-AUDIT-TRAIL: Security action not logged. Add to append-only audit log.',
  warheadTemplate: 'Audit trails provide forensic evidence for security incidents.',
  evidenceSpec: { id: 'audit-trail', verify: 'fs-check', minQuality: 0.95 },
  severity: 'warn',
  layer: 3,
  links: ['PERSIST-MERKLE-CHAIN', 'PERSIST-APPEND-ONLY'],
  selfVerified: true,
};

// ══ ADVANCED SECURITY NODES (10 nodes) ═════════════════════════

export const SEC_ADVANCED_TIMING_ATTACK: KnowledgeNode = {
  id: 'SEC-ADVANCED-TIMING-ATTACK',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'ADVANCED TIMING ATTACK: Beyond simple comparison timing — cache timing, branch prediction timing, and power analysis leak secrets through microsecond-level delays.',
  detectionMethod: 'Find operations on secrets that branch or access memory in data-dependent patterns (cache-line dependent operations).',
  fixTemplate: 'Use constant-time comparison (crypto.timingSafeEqual). Avoid data-dependent memory access patterns on secrets.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-ADVANCED-TIMING-ATTACK: Data-dependent timing on secret. Use constant-time operations.',
  warheadTemplate: 'Advanced timing attacks extract secrets through cache and branch-timing side channels.',
  evidenceSpec: { id: 'no-adv-timing', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'warn',
  layer: 3,
  links: ['SEC-TIMING-ATTACK', 'SEC-ADVANCED-SIDE-CHANNEL'],
  selfVerified: true,
};

export const SEC_ADVANCED_SIDE_CHANNEL: KnowledgeNode = {
  id: 'SEC-ADVANCED-SIDE-CHANNEL',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'ADVANCED SIDE CHANNEL: Power analysis, electromagnetic emanation, and acoustic side channels leak cryptographic keys from physical operations.',
  detectionMethod: 'Find crypto operations that do not use side-channel-resistant implementations (hardware AES, constant-time RSA).',
  fixTemplate: 'Use vetted crypto libraries with side-channel resistance. Never implement custom crypto.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-ADVANCED-SIDE-CHANNEL: Custom or non-resistant crypto. Use vetted libraries.',
  warheadTemplate: 'Side-channel attacks on physical devices extract keys without breaking the algorithm.',
  evidenceSpec: { id: 'no-side-channel', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 3,
  links: ['SEC-ADVANCED-TIMING-ATTACK', 'SEC-INFO-FLOW-TAINT'],
  selfVerified: true,
};

export const SEC_ADVANCED_DESERIALIZATION: KnowledgeNode = {
  id: 'SEC-ADVANCED-DESERIALIZATION',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'DESERIALIZATION ATTACK: Unsafe deserialization (JSON.parse of untrusted data, eval-based revival) allows code injection or prototype pollution.',
  detectionMethod: 'Find JSON.parse on untrusted input without schema validation. Find custom reviver functions that execute code.',
  fixTemplate: 'Validate deserialized data against a schema (zod, io-ts). Use Object.create(null) to avoid prototype pollution.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-ADVANCED-DESERIALIZATION: Unsafe deserialization of untrusted data. Validate with schema.',
  warheadTemplate: 'Deserialization attacks inject code or pollute prototypes through crafted payloads.',
  evidenceSpec: { id: 'no-unsafe-deser', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-INJECTION-INDIRECT', 'VALID-SECURITY-PROTOTYPE-POLLUTION'],
  selfVerified: true,
};

export const SEC_ADVANCED_XXE: KnowledgeNode = {
  id: 'SEC-ADVANCED-XXE',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'XML EXTERNAL ENTITY (XXE): XML parsers that resolve external entities allow file read, SSRF, and denial of service via billion-laughs.',
  detectionMethod: 'Find XML parser usage (DOMParser, libxmljs) without disabling external entity resolution.',
  fixTemplate: 'Disable DTD processing and external entity resolution in the parser config. Prefer JSON over XML.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-ADVANCED-XXE: XML parser with entities enabled. Disable DTD/external entities.',
  warheadTemplate: 'XXE attacks read local files or trigger SSRF through crafted XML entities.',
  evidenceSpec: { id: 'no-xxe', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-ADVANCED-SSRF', 'SEC-CAPABILITY-FS'],
  selfVerified: true,
};

export const SEC_ADVANCED_SSRF: KnowledgeNode = {
  id: 'SEC-ADVANCED-SSRF',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'SERVER-SIDE REQUEST FORGERY (SSRF): Server-side fetch of a user-provided URL allows access to internal network, cloud metadata, and localhost services.',
  detectionMethod: 'Find fetch/http calls with user-controlled URLs. Flag requests without internal-network IP filtering.',
  fixTemplate: 'Validate and resolve URLs. Reject internal IPs (127.0.0.0/8, 10.0.0.0/8, 169.254.169.254). Use an allowlist of hosts.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-ADVANCED-SSRF: Server-side fetch of user-provided URL. Filter internal networks.',
  warheadTemplate: 'SSRF bypasses firewalls by making the server fetch internal resources on behalf of the attacker.',
  evidenceSpec: { id: 'no-ssrf', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-CAPABILITY-NETWORK', 'SEC-NETWORK-MODEL'],
  selfVerified: true,
};

export const SEC_ADVANCED_TEMPLATE_INJECTION: KnowledgeNode = {
  id: 'SEC-ADVANCED-TEMPLATE-INJECTION',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'SERVER-SIDE TEMPLATE INJECTION (SSTI): User input in template expressions ({{userInput}}) allows code execution via template engine eval.',
  detectionMethod: 'Find template rendering with user input in template expressions. Flag render() calls with untrusted template strings.',
  fixTemplate: 'Never render user input as template. Use context variables, not template expressions. Escape before rendering.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-ADVANCED-TEMPLATE-INJECTION: User input in template expression. Use context vars.',
  warheadTemplate: 'SSTI allows remote code execution through template engines that eval expressions.',
  evidenceSpec: { id: 'no-ssti', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-INJECTION-TEMPLATE', 'SEC-INJECTION-DIRECT'],
  selfVerified: true,
};

export const SEC_ADVANCED_LDAP_INJECTION: KnowledgeNode = {
  id: 'SEC-ADVANCED-LDAP-INJECTION',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'LDAP INJECTION: User input in LDAP queries allows bypass of authentication or extraction of directory data via metacharacters (*, |, &).',
  detectionMethod: 'Find LDAP query construction with string concatenation of user input.',
  fixTemplate: 'Escape LDAP metacharacters in user input. Use parameterized LDAP queries.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-ADVANCED-LDAP-INJECTION: Unescaped user input in LDAP query. Escape metacharacters.',
  warheadTemplate: 'LDAP injection bypasses authentication by injecting wildcards into directory queries.',
  evidenceSpec: { id: 'no-ldap-inj', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-INJECTION-DIRECT', 'SEC-INFO-FLOW-TAINT'],
  selfVerified: true,
};

export const SEC_ADVANCED_XPATH_INJECTION: KnowledgeNode = {
  id: 'SEC-ADVANCED-XPATH-INJECTION',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'XPATH INJECTION: User input in XPath queries allows extraction of XML data or authentication bypass via XPath metacharacters.',
  detectionMethod: 'Find XPath query construction with string concatenation of user input.',
  fixTemplate: 'Parameterize XPath queries. Escape user input before embedding in XPath expressions.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-ADVANCED-XPATH-INJECTION: Unescaped user input in XPath query. Parameterize.',
  warheadTemplate: 'XPath injection extracts sensitive data from XML stores via crafted query expressions.',
  evidenceSpec: { id: 'no-xpath-inj', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['SEC-INJECTION-DIRECT', 'SEC-ADVANCED-XXE'],
  selfVerified: true,
};

export const SEC_ADVANCED_LOG_INJECTION: KnowledgeNode = {
  id: 'SEC-ADVANCED-LOG-INJECTION',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'LOG INJECTION: User input in log entries allows log forging (fake entries), log injection (newlines, ANSI escapes), and log-based XSS.',
  detectionMethod: 'Find logger calls with raw user input. Flag log entries without newline/control-character sanitization.',
  fixTemplate: 'Sanitize user input before logging: strip newlines, carriage returns, and ANSI escape sequences.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-ADVANCED-LOG-INJECTION: Raw user input in log entry. Sanitize control characters.',
  warheadTemplate: 'Log injection forges audit trails or injects XSS into log viewers.',
  evidenceSpec: { id: 'no-log-inj', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'warn',
  layer: 3,
  links: ['SEC-AUDIT-TRAIL', 'SEC-INJECTION-ENCODING'],
  selfVerified: true,
};

export const SEC_ADVANCED_OPEN_REDIRECT: KnowledgeNode = {
  id: 'SEC-ADVANCED-OPEN-REDIRECT',
  source: 'alg-sys',
  sourceFile: 'KB-06_ADVERSARIAL_RESILIENCE.md',
  category: 'security',
  rule: 'OPEN REDIRECT: User-provided redirect URL allows phishing by redirecting to attacker-controlled sites from a trusted domain.',
  detectionMethod: 'Find redirect responses (302, Location header) with user-controlled URLs.',
  fixTemplate: 'Validate redirect URLs against an allowlist of trusted hosts. Reject absolute URLs from user input.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'SEC-ADVANCED-OPEN-REDIRECT: User-controlled redirect URL. Validate against allowlist.',
  warheadTemplate: 'Open redirects enable phishing campaigns using trusted domain URLs.',
  evidenceSpec: { id: 'no-open-redirect', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['SEC-CAPABILITY-NETWORK', 'SEC-INJECTION-DIRECT'],
  selfVerified: true,
};

// EXPORTS
export const securityNodes: KnowledgeNode[] = [
  SEC_INJECTION_DIRECT, SEC_INJECTION_INDIRECT, SEC_INJECTION_TEMPLATE, SEC_INJECTION_TOOL, SEC_INJECTION_ENCODING,
  SEC_GAMING_BYPASS, SEC_GAMING_WEAKENING, SEC_GAMING_DISABLE, SEC_GAMING_SPOOF, SEC_GAMING_REPLAY,
  SEC_SUPPLY_BLAST_RADIUS, SEC_SUPPLY_CYCLES, SEC_SUPPLY_INTEGRITY,
  SEC_CAPABILITY_FS, SEC_CAPABILITY_NETWORK, SEC_CAPABILITY_PROCESS, SEC_CAPABILITY_ENV, SEC_CAPABILITY_MEMORY,
  SEC_INFO_FLOW_LATTICE, SEC_INFO_FLOW_TAINT,
  SEC_REDTIME_FUZZ, SEC_CROSS_DETECTOR, SEC_SANDBOX_ISOLATION, SEC_NETWORK_MODEL,
  SEC_TIMING_ATTACK, SEC_AUDIT_TRAIL,
  // Advanced Security
  SEC_ADVANCED_TIMING_ATTACK, SEC_ADVANCED_SIDE_CHANNEL, SEC_ADVANCED_DESERIALIZATION,
  SEC_ADVANCED_XXE, SEC_ADVANCED_SSRF, SEC_ADVANCED_TEMPLATE_INJECTION,
  SEC_ADVANCED_LDAP_INJECTION, SEC_ADVANCED_XPATH_INJECTION, SEC_ADVANCED_LOG_INJECTION,
  SEC_ADVANCED_OPEN_REDIRECT,
];
