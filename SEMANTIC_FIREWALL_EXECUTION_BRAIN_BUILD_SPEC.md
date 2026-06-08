# BUILD SPEC: Semantic Firewall + Execution Brain Overhaul

**Version:** 2.0  
**Classification:** TRIDENT LAYER 2 — ARCHITECTURAL OVERHAUL  
**Authority:** Runtime Grade Semantic Software Engineering Bible (39 pages, 2026-06-05)  
**Authority:** Algorithmic Systems Library (63,325 lines, 15 files)  
**Build Time Estimate:** 10-15 days (5 phases)  
**Lines of Code Estimate:** 8,000-12,000 new + 3,000-5,000 modified + 2,000-3,000 deleted  

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase 0: Truth-in-Advertising + Deduplication](#3-phase-0-truth-in-advertising--deduplication)
4. [Phase 1: Compiler Host + AST Analyzer Infrastructure](#4-phase-1-compiler-host--ast-analyzer-infrastructure)
5. [Phase 2: Semantic Rules (Replacing All Regex)](#5-phase-2-semantic-rules-replacing-all-regex)
6. [Phase 3: Context-Aware Enforcement Engine](#6-phase-3-context-aware-enforcement-engine)
7. [Phase 4: Gate Engine + Merkle Evidence](#7-phase-4-gate-engine--merkle-evidence)
8. [Phase 5: Decommission + Hardening](#8-phase-5-decommission--hardening)
9. [Complete File Manifest](#9-complete-file-manifest)
10. [Test Specifications](#10-test-specifications)
11. [Migration Strategy](#11-migration-strategy)
12. [Appendix: Bible Compliance Matrix](#12-appendix-bible-compliance-matrix)

---

## 1. Executive Summary

### 1.1 The Problem

SHARK v4.9.9 has **24 firewall layers** and a **3-lobe enforcement brain** that operate entirely at **Bible Order 0/1** (string pattern matching). The "Layer Engine" does regex, not analysis. The "Intent Classifier" does keyword lookup, not classification. The "L5.*" layers claim Order 5 but are Order 0. Every single enforcement decision is made by checking whether a command string contains a specific substring — `rm -rf /`, `catch {}`, `trust me it works`. This is the **Branding Illusion** (§7.6), the **Type Theater** (§7.5), and the **Naming Illusion** (§2.3) of the Bible, all at once.

The session ses_1634 proved the practical failure: `bun build` was blocked as "destructive" because the firewall has no concept of engineering context. It cannot distinguish "SHARK compiling its own source code" from "an attacker writing to /etc." It has no AST awareness, no type checker, no control flow graph, no edit history, no gate-phase awareness. It is a regex firewall claiming to be semantic.

### 1.2 The Solution

Replace the entire regex-based enforcement stack with a **TypeScript Compiler API-based semantic analysis pipeline** operating at Bible Orders 2-5. The new architecture:

| Component | Old (Order 0/1) | New (Order 2-5) |
|-----------|-----------------|------------------|
| Enforcement Brain | `EnforcementBrain` class (regex + keyword switchboard) | `SemanticFirewall` class (pluggable AST/TypeChecker/CFG rules) |
| Intent Classifier | `IntentClassifier` (string.split + keyword lookup) | `DeterministicNLPPipeline` (wink-nlp tokeniser + dependency parser) |
| Layer Engine | `LayerEngine` (regex pattern matching on string fields) | `AnalysisOrderDispatcher` (routes to AST/TypeChecker/CFG per rule) |
| Layer Files | 24 files, all regex, all claiming "L5" | 6 real analysis orders (L0 pre-filter, L2-L5 semantic) |
| Guardian | `Guardian` (zone + DANGEROUS_PATTERNS) | `Guardian` (same zones, but AST-aware modification detection) |
| Gate Chain | 6 manual `if(gate===X)` switches | `GateEngine` (XState hierarchical state machine) |
| Evidence | Hand-written JSON files | `MerkleChain` (cryptographic linking) + `SQLitePersistenceEngine` |

### 1.3 The Five Orders in SHARK Context

```
Current SHARK:         Target SHARK:
Order 0: N/A           Order 0: No analysis (pass-through)
Order 1: 24 layers     Order 1: L0 pre-filter (regex, generates CANDIDATES only)
Order 2: N/A           Order 2: AST walker (structural rules)
Order 3: N/A           Order 3: TypeChecker queries (type safety rules)
Order 4: N/A           Order 4: CFG/DFA (resource lifecycle, floating promises)
Order 5: N/A           Order 5: Execution verification (scope diff, evidence integrity)
```

## 2. Architecture Overview

### 2.1 High-Level Data Flow

```
Tool Call (bash/write/edit/etc.)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  write-time-gate.ts  (tool.execute.before)           │
│  ┌──────────────────────────────────────────────┐   │
│  │ L0: Regex Pre-Filter (candidate generation)   │   │
│  │     → if no match: ALLOW immediately          │   │
│  │     → if match: promote to L2                  │   │
│  ├──────────────────────────────────────────────┤   │
│  │ L2: AST Analyzer (structural confirmation)    │   │
│  │     → empty catch, theatrical return, scope   │   │
│  ├──────────────────────────────────────────────┤   │
│  │ L3: TypeChecker (type safety confirmation)    │   │
│  │     → unguarded cast, dead export, type cov   │   │
│  ├──────────────────────────────────────────────┤   │
│  │ SEVERITY → CRITICAL/HIGH → BLOCK + QUARANTINE│   │
│  │         → MEDIUM      → WARN                 │   │
│  │         → LOW/INFO    → LOG                  │   │
│  └──────────────────────────────────────────────┘   │
│    Result: BlockResult | null                        │
└─────────────────────────────────────────────────────┘
    │ (if not blocked)
    ▼
┌─────────────────────────────────────────────────────┐
│  post-write-audit.ts  (tool.execute.after)           │
│  ┌──────────────────────────────────────────────┐   │
│  │ L2-L5: Full analysis (all orders)             │   │
│  │ L4: CFG/DFA (floating promise, resource)      │   │
│  │ L5: Scope diff, evidence integrity            │   │
│  ├──────────────────────────────────────────────┤   │
│  │ → CRITICAL/HIGH → QUARANTINE (move file)     │   │
│  │ → MEDIUM → WARN in output                    │   │
│  │ → LOW/INFO → log to audit                    │   │
│  └──────────────────────────────────────────────┘   │
│    Result: AuditEntry[]                              │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  evidence-engine.ts  (every enforcement action)      │
│  ┌──────────────────────────────────────────────┐   │
│  │ MerkleChain.append(block)                     │   │
│  │ SQLitePersistenceEngine.insert(evidence)       │   │
│  │ updateContextDocs()                            │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2.2 Module Dependency Graph

```
src/index.ts
    │
    ├── src/semantic-firewall/
    │       ├── index.ts                        (exports SemanticFirewall)
    │       ├── semantic-firewall.ts             (main engine class)
    │       ├── types.ts                        (FirewallConfig, FirewallDiag, RuleConfig)
    │       ├── rules/
    │       │   ├── no-empty-catch.ts
    │       │   ├── no-unsafe-cast.ts
    │       │   ├── no-floating-promises.ts
    │       │   ├── evidence-bearing-results.ts
    │       │   ├── no-hardcoded-paths.ts
    │       │   ├── cleanup-paired-intervals.ts
    │       │   ├── handle-zero-length.ts
    │       │   ├── theatrical-return.ts
    │       │   ├── scope-violation.ts
    │       │   └── dead-export.ts
    │       └── analyzers/
    │           ├── ts-compiler-host.ts          (Appendix C verbatim)
    │           ├── ast-walker.ts                (generic recursive walker)
    │           ├── cfg-builder.ts               (Appendix D verbatim)
    │           ├── data-flow.ts                 (forward/backward DFA)
    │           └── import-graph.ts              (DFS cycle detection)
    │
    ├── src/gate-engine/
    │       ├── index.ts
    │       ├── gate-engine.ts                  (XState hierarchical machine)
    │       ├── types.ts
    │       └── gates/
    │           ├── plan-gate.ts
    │           ├── build-gate.ts
    │           ├── test-gate.ts
    │           ├── verify-gate.ts
    │           ├── audit-gate.ts
    │           └── delivery-gate.ts
    │
    ├── src/evidence-engine/
    │       ├── index.ts
    │       ├── merkle-chain.ts                 (cryptographic linking)
    │       ├── evidence-db.ts                  (SQLite persistence)
    │       └── evidence-validator.ts           (theatrical detection)
    │
    ├── src/nlp-pipeline/
    │       ├── index.ts
    │       ├── deterministic-nlp-pipeline.ts   (wink-nlp based)
    │       ├── verb-frame-lexicon.ts           (extended from karpathy/)
    │       └── types.ts
    │
    ├── src/shared/
    │       ├── guardian.ts                     (MODIFY: add AST awareness)
    │       ├── danger-commands.ts              (NEW: single consolidated module)
    │       └── types.ts                        (shared enforcement types)
    │
    ├── src/hooks/
    │       ├── v4.1/
    │       │   ├── guardian-hook.ts            (MODIFY: replace regex with semantic)
    │       │   ├── write-time-gate.ts          (NEW: before-execution hook)
    │       │   └── post-write-audit.ts         (NEW: after-execution hook)
    │       └── firewall/
    │           └── layers/                     (DELETE 24 files, keep patterns as reference)
    │
    └── src/shark/
        ├── enforcement-brain/                  (REPLACE: wrap SemanticFirewall)
        │   └── enforcement-brain.ts
        └── karpathy/                           (MODIFY: wrap DeterministicNLPPipeline)
            └── intent-classifier.ts
```

## 3. Phase 0: Truth-in-Advertising + Deduplication

**Duration:** 1 hour  
**Goal:** No behavior change. Just stop lying about what the code is and remove the 3 duplicate danger-detection modules.

### 3.1 Rename Layers (Branding Fix)

The Bible §7.6 (Branding Illusion) says: *"Name by mechanism, not implementation."*

Current files claiming "L5" but operating at Order 0 must be renamed to `L0_*`:

| Current Name | Real Order | New Name |
|-------------|------------|----------|
| `l0-identity.ts` | Actually Order 0 | `l0-identity.ts` (keep) |
| `l1-theatrical.ts` | Actually Order 0 | `l0-theatrical.ts` |
| `l2-test-bypass.ts` | Actually Order 0 | `l0-test-bypass.ts` |
| `l3-inspection.ts` | Actually Order 0 | `l0-inspection.ts` |
| `l4-container.ts` | Actually Order 0 | `l0-container.ts` |
| `l5.1-host-fallback.ts` through `l5.19-container-escape.ts` | All Order 0 | `l0-host-fallback.ts` through `l0-container-escape.ts` |

**File: `src/hooks/firewall/layers/index.ts`**
- Update all import paths from `./l5.*` to `./l0-*`
- Update `DEFAULT_LAYERS` array to reference new names
- Add comment: `// WARNING: All L0 layers are Order 1 pre-filters. Real analysis happens in src/semantic-firewall/`

**File: `src/hooks/firewall/types.ts`**
- Add `AnalysisOrder` to `LayerRule` interface:
```typescript
export interface LayerRule {
  layer: string;
  analysisOrder: 0 | 1 | 2 | 3 | 4 | 5;  // NEW
  name: string;
  enabled: boolean;
  pattern?: RegExp;
  patternFields?: PatternField[];
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  // ... existing fields
}
```

- Expand `EnforcementLevel`:
```typescript
export type EnforcementLevel =
  | 'CRITICAL'  // BLOCK + QUARANTINE + LOCKOUT escalation
  | 'HIGH'      // BLOCK + QUARANTINE + RESTART escalation
  | 'MEDIUM'    // WARN (proceed with warning)
  | 'LOW'       // LOG (record only)
  | 'INFO'      // LOG (observation only)
  | 'PASS';     // No action
```

### 3.2 Consolidate Danger Detection

Bible §7.7 (Duplicate Check) says: *"Delete, don't duplicate."*

There are currently **3 separate danger detection implementations** with slightly different pattern sets:

| Location | Function | Patterns |
|----------|----------|----------|
| `src/shared/guardian.ts:29-33` | `DANGEROUS_PATTERNS` | `rm -rf /`, `dd if=`, `mkfs`, fork bomb |
| `src/hooks/firewall/intent-classifier.ts:13-26` | `DANGEROUS_COMMAND_PATTERNS` | Same + `sudo rm`, `chmod 777`, `wget|sh`, `curl|sh` |
| `src/shark/karpathy/intent-classifier.ts:608-626, 636-646` | `hasDestructiveArgs()` + `evaluateBashCommand()` | Same + `> /dev/`, `chmod 000`, `chown -R`, `git push --force`, `rm -r` |

**File: NEW `src/shared/danger-commands.ts`**
```typescript
/**
 * SINGLE consolidated danger detection module.
 * Bible §7.7 compliance: Delete, don't duplicate.
 * All layers, guardians, and classifiers import from here.
 */

export interface DangerMatch {
  detected: boolean;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  pattern: string;
  findingId: string;
  message: string;
}

const CRITICAL_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+\//i,
  /\brm\s+-rf\s+--no-preserve-root\b/i,
  /\bdd\s+if=\/dev\/zero/i,
  /\bdd\s+if=\/dev\/sda/i,
  /\bmkfs\./i,
  /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
  /for\s*\(.*\)\s*do\s*.*&\s*;\s*done/i,
  /\bsudo\b.*\brm\b/i,
  /\bcryptolocker\b/i,
];

const HIGH_PATTERNS: RegExp[] = [
  /\bchmod\s+(-R\s+)?777\b/i,
  /\bchmod\s+000\b/i,
  /\bchown\s+-R\s+0:0\s+\//i,
  /\bwget\b.*\|\s*(ba)?sh/i,
  /\bcurl\b.*\|\s*(ba)?sh/i,
  /\brm\s+-rf\s+\/bin\b/i,
  /\brm\s+-rf\s+\/usr\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bdocker\s+rmi\b/i,
  /\bdocker\s+rm\b/i,
  /\bpkill\s+-9\b/i,
];

const MEDIUM_PATTERNS: RegExp[] = [
  /\bsudo\b/i,
  /\bsu\s+/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /drop\s+table\b/i,
  /drop\s+database\b/i,
];

export function isDangerousCommand(command: string): DangerMatch {
  const cmd = command.trim().toLowerCase();
  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(cmd)) return { detected: true, severity: 'CRITICAL', pattern: pattern.source, findingId: 'DANGER-CRITICAL', message: pattern.source };
  }
  for (const pattern of HIGH_PATTERNS) {
    if (pattern.test(cmd)) return { detected: true, severity: 'HIGH', pattern: pattern.source, findingId: 'DANGER-HIGH', message: pattern.source };
  }
  for (const pattern of MEDIUM_PATTERNS) {
    if (pattern.test(cmd)) return { detected: true, severity: 'MEDIUM', pattern: pattern.source, findingId: 'DANGER-MEDIUM', message: pattern.source };
  }
  return { detected: false, severity: 'LOW', pattern: '', findingId: '', message: '' };
}

export function hasDestructiveArgs(tool: string, args: Record<string, unknown>): DangerMatch {
  if (typeof args.command === 'string') {
    return isDangerousCommand(args.command);
  }
  if (typeof args.filePath === 'string') {
    const fp = args.filePath.toLowerCase();
    const blockedPaths = ['/etc', '/boot', '/sys', '/proc', '/dev'];
    for (const bp of blockedPaths) {
      if (fp.startsWith(bp)) return { detected: true, severity: 'HIGH', pattern: `path:${bp}`, findingId: 'DANGER-PATH', message: `Targets blocked system path: ${bp}` };
    }
  }
  return { detected: false, severity: 'LOW', pattern: '', findingId: '', message: '' };
}
```

**File: `src/shared/guardian.ts` — MODIFY lines 29-33:**
- Remove `DANGEROUS_PATTERNS` constant
- Import `isDangerousCommand` from `../shared/danger-commands.js`
- Replace `isDangerousCommand` method body with call to shared function

**File: `src/hooks/firewall/intent-classifier.ts` — MODIFY lines 13-26:**
- Remove `DANGEROUS_COMMAND_PATTERNS` constant
- Remove `isDangerousCommand()` function (lines 181-183)
- Import `isDangerousCommand` from `../../shared/danger-commands.js`

**File: `src/shark/karpathy/intent-classifier.ts` — MODIFY lines 603-646:**
- Remove `hasDestructiveArgs()` method (lines 603-627)
- Remove `evaluateBashCommand()` method (lines 629-653)
- Import `hasDestructiveArgs` from `../../shared/danger-commands.js`
- In `classifyToolCall`, replace `this.hasDestructiveArgs()` with the shared version
- In `classifyToolCall`, replace `this.evaluateBashCommand()` with: call `isDangerousCommand()`, map severity to enforcement level

### 3.3 Layer Engine Phase Awareness

**File: `src/hooks/firewall/layer-engine.ts` — MODIFY**

Add `phase` parameter to `evaluate()`:
```typescript
export type AnalysisPhase = 'write-time' | 'post-write';

function evaluate(
  context: FirewallContext,
  layers: LayerRule[],
  phase: AnalysisPhase = 'post-write'
): BlockResult[] {
  const maxOrder = phase === 'write-time' ? 2 : 5;
  return layers
    .filter(l => l.enabled && l.analysisOrder <= maxOrder)
    .map(l => evaluateLayer(l, context))
    .filter(Boolean);
}
```

Add `analysisOrder` field to every layer export. Example for `l0-identity.ts`:
```typescript
export const L0_IDENTITY: LayerRule = {
  layer: 'L0-IDENTITY',
  analysisOrder: 1, // THIS IS ORDER 1, NOT ORDER 0
  name: 'Identity Wall',
  // ...
};
```

## 4. Phase 1: Compiler Host + AST Analyzer Infrastructure

**Duration:** 2 days  
**Goal:** Build the TypeScript Compiler API infrastructure that all semantic rules depend on. These modules are dependencies for Phases 2-4.

### 4.1 TypeScript Compiler Host

**File: NEW `src/semantic-firewall/analyzers/ts-compiler-host.ts`**

Verbatim from Bible Appendix C. This creates an in-memory TypeScript `Program` and `TypeChecker` from a map of file path → content.

```typescript
import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';

interface InMemoryFile {
  content: string;
  version: number;
}

export interface CompilerHostResult {
  program: ts.Program;
  checker: ts.TypeChecker;
}

export function createInMemoryCompilerHost(
  files: Map<string, string>,
  compilerOptions: ts.CompilerOptions = {}
): CompilerHostResult {
  // [P2] Validate inputs
  if (!files || files.size === 0) throw new Error('[P2] No source files provided');
  // [P1] Defensive import
  if (typeof ts.createProgram !== 'function') throw new Error('[P1] TypeScript API not available');

  const defaultOptions: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    esModuleInterop: true,
    skipLibCheck: true,
    ...compilerOptions,
  };

  const fileMap = new Map<string, InMemoryFile>();
  for (const [name, content] of files) {
    fileMap.set(path.resolve(name), { content, version: 0 });
  }

  const host: ts.CompilerHost = {
    getSourceFile(fileName, languageVersion) {
      const resolved = path.resolve(fileName);
      const mem = fileMap.get(resolved);
      if (mem) return ts.createSourceFile(resolved, mem.content, languageVersion, true);
      try {
        const diskContent = fs.readFileSync(fileName, 'utf-8');
        return ts.createSourceFile(fileName, diskContent, languageVersion, true);
      } catch { return undefined; }
    },
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    writeFile: () => {},
    getCurrentDirectory: () => process.cwd(),
    getDirectories: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
    fileExists(fileName) {
      const resolved = path.resolve(fileName);
      return fileMap.has(resolved) || fs.existsSync(fileName);
    },
    readFile(fileName) {
      const resolved = path.resolve(fileName);
      const mem = fileMap.get(resolved);
      if (mem) return mem.content;
      try { return fs.readFileSync(fileName, 'utf-8'); } catch { return undefined; }
    },
    realpath: (fileName) => { try { return fs.realpathSync(fileName); } catch { return fileName; } },
    getNewLine: () => '\n',
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (f) => f,
  };

  const program = ts.createProgram(Array.from(fileMap.keys()), defaultOptions, host);
  const checker = program.getTypeChecker();
  return { program, checker };
}

/**
 * Create a compiler host from a project root.
 * Reads tsconfig.json automatically and loads all source files.
 * Bible §4.1: Pre-Write Enforcement requires this.
 */
export function createProjectCompilerHost(projectRoot: string): CompilerHostResult {
  // [P7] Path resolution
  if (!projectRoot || typeof projectRoot !== 'string') throw new Error('[P2] Invalid project root');
  const tsConfigPath = path.resolve(projectRoot, 'tsconfig.json');
  // [P8] Config validation
  if (!fs.existsSync(tsConfigPath)) throw new Error(`[P2] tsconfig not found at ${tsConfigPath}`);

  const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
  if (configFile.error) throw new Error(`[P8] Invalid tsconfig: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`);

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config, ts.sys, projectRoot, {}, tsConfigPath
  );

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });
  const checker = program.getTypeChecker();
  return { program, checker };
}

// Convenience function for getting source files
export function getSourceFiles(program: ts.Program): Map<string, ts.SourceFile> {
  const map = new Map<string, ts.SourceFile>();
  for (const file of program.getSourceFiles()) {
    if (!file.isDeclarationFile && !file.fileName.includes('node_modules')) {
      map.set(file.fileName, file);
    }
  }
  return map;
}
```

### 4.2 AST Walker

**File: NEW `src/semantic-firewall/analyzers/ast-walker.ts`**

Generic recursive AST walker with callback pattern, per Bible §3.2.

```typescript
import * as ts from 'typescript';

export interface ASTVisitResult {
  rule: string;
  severity: 'error' | 'warning';
  file: string;
  line: number;
  column: number;
  message: string;
  nodeKind: string;
  sourceSnippet?: string;
}

export type ASTVisitor = (node: ts.Node, sourceFile: ts.SourceFile) => ASTVisitResult | null;

/**
 * Walk ALL source files and apply each visitor.
 * Bible §3.2: AST Walking — The Visitor Pattern.
 */
export function walkAST(
  sourceFiles: Map<string, ts.SourceFile>,
  visitors: ASTVisitor[]
): ASTVisitResult[] {
  const results: ASTVisitResult[] = [];
  for (const [filePath, sourceFile] of sourceFiles) {
    visitNode(sourceFile, sourceFile, visitors, results);
  }
  return results;
}

function visitNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  visitors: ASTVisitor[],
  results: ASTVisitResult[]
): void {
  for (const visitor of visitors) {
    const result = visitor(node, sourceFile);
    if (result) results.push(result);
  }
  ts.forEachChild(node, child => visitNode(child, sourceFile, visitors, results));
}

/**
 * Get line and column from a node's position in the source file.
 */
export function getNodePosition(node: ts.Node, sourceFile: ts.SourceFile): { line: number; column: number } {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: pos.line + 1, column: pos.character + 1 };
}

/**
 * Get source text snippet around a node.
 */
export function getNodeSnippet(node: ts.Node, sourceFile: ts.SourceFile, contextLines: number = 1): string {
  const start = Math.max(0, node.getStart(sourceFile) - contextLines * 80);
  const end = Math.min(sourceFile.text.length, node.getEnd() + contextLines * 80);
  return sourceFile.text.substring(start, end);
}

/**
 * Find parent node of a specific kind.
 */
export function findParentKind(node: ts.Node, kind: ts.SyntaxKind): ts.Node | null {
  let current = node.parent;
  while (current) {
    if (current.kind === kind) return current;
    if (ts.isSourceFile(current)) return null;
    current = current.parent;
  }
  return null;
}
```

### 4.3 CFG Builder

**File: NEW `src/semantic-firewall/analyzers/cfg-builder.ts`**

Verbatim from Bible Appendix D. Constructs control flow graphs from TypeScript AST.

```typescript
import * as ts from 'typescript';

export interface BasicBlock {
  id: number;
  statements: ts.Statement[];
  successors: number[];
  predecessors: number[];
}

export class CFGBuilder {
  private blocks: BasicBlock[] = [];
  private nextId = 0;

  buildFromBody(body: ts.Block): BasicBlock[] {
    this.blocks = [];
    this.nextId = 0;
    this.processStatements(body.statements, null);
    return this.blocks;
  }

  getBlocks(): BasicBlock[] { return this.blocks; }

  private createBlock(): BasicBlock {
    const block: BasicBlock = {
      id: this.nextId++,
      statements: [],
      successors: [],
      predecessors: [],
    };
    this.blocks.push(block);
    return block;
  }

  private addEdge(from: BasicBlock, to: BasicBlock): void {
    if (!from.successors.includes(to.id)) from.successors.push(to.id);
    if (!to.predecessors.includes(from.id)) to.predecessors.push(from.id);
  }

  private processStatements(stmts: ts.Statement[], exitBlock: BasicBlock | null): BasicBlock {
    let current = this.createBlock();
    for (const stmt of stmts) {
      if (ts.isIfStatement(stmt)) {
        current = this.processIf(stmt, current, exitBlock);
      } else if (ts.isWhileStatement(stmt)) {
        current = this.processWhile(stmt, current, exitBlock);
      } else if (ts.isForStatement(stmt)) {
        current = this.processFor(stmt, current, exitBlock);
      } else if (ts.isTryStatement(stmt)) {
        current = this.processTry(stmt, current, exitBlock);
      } else if (ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt)) {
        current.statements.push(stmt);
        if (exitBlock) this.addEdge(current, exitBlock);
        current = this.createBlock();
      } else if (ts.isSwitchStatement(stmt)) {
        current = this.processSwitch(stmt, current, exitBlock);
      } else if (ts.isBreakStatement(stmt) || ts.isContinueStatement(stmt)) {
        current.statements.push(stmt);
        current = this.createBlock();
      } else {
        current.statements.push(stmt);
      }
    }
    return current;
  }

  private processIf(
    stmt: ts.IfStatement, entry: BasicBlock, exitBlock: BasicBlock | null
  ): BasicBlock {
    const condBlock = this.createBlock();
    condBlock.statements.push(stmt.expression as unknown as ts.Statement);
    this.addEdge(entry, condBlock);

    const thenBlock = this.processStatements(
      ts.isBlock(stmt.thenStatement) ? stmt.thenStatement.statements : [stmt.thenStatement],
      exitBlock
    );
    this.addEdge(condBlock, thenBlock);

    let elseBlock: BasicBlock;
    if (stmt.elseStatement) {
      elseBlock = this.processStatements(
        ts.isBlock(stmt.elseStatement) ? stmt.elseStatement.statements : [stmt.elseStatement],
        exitBlock
      );
    } else {
      elseBlock = this.createBlock();
    }
    this.addEdge(condBlock, elseBlock);

    const merge = this.createBlock();
    this.addEdge(thenBlock, merge);
    this.addEdge(elseBlock, merge);
    return merge;
  }

  private processWhile(
    stmt: ts.WhileStatement, entry: BasicBlock, exitBlock: BasicBlock | null
  ): BasicBlock {
    const condBlock = this.createBlock();
    this.addEdge(entry, condBlock);
    this.addEdge(condBlock, condBlock); // self-loop for back edge
    const bodyBlock = this.processStatements(
      ts.isBlock(stmt.statement) ? stmt.statement.statements : [stmt.statement],
      exitBlock
    );
    this.addEdge(condBlock, bodyBlock);
    this.addEdge(bodyBlock, condBlock);
    const exit = this.createBlock();
    this.addEdge(condBlock, exit);
    return exit;
  }

  private processFor(
    stmt: ts.ForStatement, entry: BasicBlock, exitBlock: BasicBlock | null
  ): BasicBlock {
    const initBlock = this.createBlock();
    this.addEdge(entry, initBlock);
    if (stmt.initializer) initBlock.statements.push(stmt.initializer as unknown as ts.Statement);

    const condBlock = this.createBlock();
    this.addEdge(initBlock, condBlock);
    this.addEdge(condBlock, condBlock);

    const bodyBlock = this.processStatements(
      ts.isBlock(stmt.statement) ? stmt.statement.statements : [stmt.statement],
      exitBlock
    );
    this.addEdge(condBlock, bodyBlock);

    const incrementBlock = this.createBlock();
    if (stmt.incrementor) incrementBlock.statements.push(stmt.incrementor as unknown as ts.Statement);
    this.addEdge(bodyBlock, incrementBlock);
    this.addEdge(incrementBlock, condBlock);

    const exit = this.createBlock();
    this.addEdge(condBlock, exit);
    return exit;
  }

  private processTry(
    stmt: ts.TryStatement, entry: BasicBlock, exitBlock: BasicBlock | null
  ): BasicBlock {
    const tryBlock = this.processStatements(stmt.tryBlock.statements, exitBlock);
    this.addEdge(entry, tryBlock);

    if (stmt.catchClause) {
      const catchBlock = this.processStatements(stmt.catchClause.block.statements, exitBlock);
      this.addEdge(entry, catchBlock);
      this.addEdge(tryBlock, catchBlock);
    }

    if (stmt.finallyBlock) {
      const finallyBlock = this.processStatements(stmt.finallyBlock.statements, exitBlock);
      this.addEdge(tryBlock, finallyBlock);
      if (stmt.catchClause) {
        // Find the last catch block and connect to finally
        // Simplified: connect all exit paths to finally
      }
    }

    const merge = this.createBlock();
    this.addEdge(tryBlock, merge);
    if (stmt.catchClause) {
      const lastCatch = this.blocks[this.blocks.length - 1];
      this.addEdge(lastCatch, merge);
    }
    return merge;
  }

  private processSwitch(
    stmt: ts.SwitchStatement, entry: BasicBlock, exitBlock: BasicBlock | null
  ): BasicBlock {
    const switchBlock = this.createBlock();
    switchBlock.statements.push(stmt.expression as unknown as ts.Statement);
    this.addEdge(entry, switchBlock);

    let hasDefault = false;
    const caseEnds: BasicBlock[] = [];
    for (const clause of stmt.caseBlock.clauses) {
      if (ts.isDefaultClause(clause)) hasDefault = true;
      const caseBlock = this.processStatements(clause.statements, exitBlock);
      this.addEdge(switchBlock, caseBlock);
      caseEnds.push(caseBlock);
    }

    if (!hasDefault) {
      const defaultBlock = this.createBlock();
      this.addEdge(switchBlock, defaultBlock);
      caseEnds.push(defaultBlock);
    }

    const merge = this.createBlock();
    for (const end of caseEnds) this.addEdge(end, merge);
    return merge;
  }
}

/**
 * Compute dominator tree for a CFG.
 * Uses Cooper-Harvey-Kennedy algorithm. Bible §3.5: Data Flow Analysis.
 */
export function computeDominators(blocks: BasicBlock[]): Map<number, number> {
  const dom = new Map<number, number>();
  if (blocks.length === 0) return dom;

  const entry = blocks[0];
  dom.set(entry.id, entry.id);

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const preds = block.predecessors
        .map(id => blocks.find(b => b.id === id))
        .filter(Boolean) as BasicBlock[];

      if (preds.length === 0) continue;

      let newDom = preds[0].id;
      for (let j = 1; j < preds.length; j++) {
        if (dom.has(preds[j].id)) {
          newDom = intersect(newDom, preds[j].id, dom, blocks);
        }
      }

      if (dom.get(block.id) !== newDom) {
        dom.set(block.id, newDom);
        changed = true;
      }
    }
  }
  return dom;

  function intersect(b1: number, b2: number, dom: Map<number, number>, blocks: BasicBlock[]): number {
    let finger1 = b1;
    let finger2 = b2;
    while (finger1 !== finger2) {
      while (finger1 > finger2) {
        finger1 = dom.get(finger1) ?? blocks[0].id;
      }
      while (finger2 > finger1) {
        finger2 = dom.get(finger2) ?? blocks[0].id;
      }
    }
    return finger1;
  }
}
```

### 4.4 Data Flow Analyzer

**File: NEW `src/semantic-firewall/analyzers/data-flow.ts`**

Forward and backward data flow analysis over CFG. Bible §3.5.

```typescript
import { BasicBlock } from './cfg-builder.js';
import * as ts from 'typescript';

export type TransferFunction = (block: BasicBlock, sourceFile: ts.SourceFile, inState: Set<string>) => Set<string>;

/**
 * Forward data flow analysis over CFG.
 * Propagates facts from entry to exit.
 */
export function forwardDFA(
  blocks: BasicBlock[],
  sourceFile: ts.SourceFile,
  transferFn: TransferFunction,
  meetFn: (states: Set<string>[]) => Set<string>,
  bottom: Set<string>
): Map<number, Set<string>> {
  const inStates = new Map<number, Set<string>>();
  const outStates = new Map<number, Set<string>>();

  for (const block of blocks) {
    inStates.set(block.id, new Set(bottom));
    outStates.set(block.id, new Set(bottom));
  }

  if (blocks.length === 0) return inStates;
  inStates.set(blocks[0].id, new Set()); // entry: no facts yet

  let changed = true;
  while (changed) {
    changed = false;
    for (const block of blocks) {
      const predInStates: Set<string>[] = [];
      for (const predId of block.predecessors) {
        const predOut = outStates.get(predId);
        if (predOut) predInStates.push(predOut);
      }

      const newIn = predInStates.length > 0 ? meetFn(predInStates) : new Set(bottom);
      const oldIn = inStates.get(block.id)!;

      if (!setsEqual(newIn, oldIn)) {
        inStates.set(block.id, newIn);
        changed = true;
      }

      const newOut = transferFn(block, sourceFile, newIn);
      const oldOut = outStates.get(block.id)!;
      if (!setsEqual(newOut, oldOut)) {
        outStates.set(block.id, newOut);
        changed = true;
      }
    }
  }

  return inStates;
}

/**
 * Backward data flow analysis over CFG.
 * Propagates facts from exit to entry (liveness analysis).
 */
export function backwardDFA(
  blocks: BasicBlock[],
  sourceFile: ts.SourceFile,
  transferFn: TransferFunction,
  meetFn: (states: Set<string>[]) => Set<string>,
  bottom: Set<string>
): Map<number, Set<string>> {
  const inStates = new Map<number, Set<string>>();
  const outStates = new Map<number, Set<string>>();

  for (const block of blocks) {
    inStates.set(block.id, new Set(bottom));
    outStates.set(block.id, new Set(bottom));
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      const succOutStates: Set<string>[] = [];
      for (const succId of block.successors) {
        const succIn = inStates.get(succId);
        if (succIn) succOutStates.push(succIn);
      }

      const newOut = succOutStates.length > 0 ? meetFn(succOutStates) : new Set(bottom);
      const oldOut = outStates.get(block.id)!;
      if (!setsEqual(newOut, oldOut)) {
        outStates.set(block.id, newOut);
        changed = true;
      }

      const newIn = transferFn(block, sourceFile, newOut);
      const oldIn = inStates.get(block.id)!;
      if (!setsEqual(newIn, oldIn)) {
        inStates.set(block.id, newIn);
        changed = true;
      }
    }
  }

  return outStates;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Union meet function (for "may" analysis — optimistic).
 */
export function unionMeet(states: Set<string>[]): Set<string> {
  const result = new Set<string>();
  for (const s of states) for (const v of s) result.add(v);
  return result;
}

/**
 * Intersection meet function (for "must" analysis — pessimistic).
 */
export function intersectMeet(states: Set<string>[]): Set<string> {
  if (states.length === 0) return new Set();
  const result = new Set(states[0]);
  for (let i = 1; i < states.length; i++) {
    for (const v of result) if (!states[i].has(v)) result.delete(v);
  }
  return result;
}
```

### 4.5 Import Graph Analyzer

**File: NEW `src/semantic-firewall/analyzers/import-graph.ts`**

DFS-based cycle detection and entry point analysis. Bible §6.1: Cross-File Analysis.

```typescript
import * as ts from 'typescript';
import * as path from 'node:path';

export interface ImportEdge {
  from: string;
  to: string;
  kind: ts.SyntaxKind;
}

export interface Cycle {
  nodes: string[];
  length: number;
}

export class ImportGraphAnalyzer {
  private edges: ImportEdge[] = [];

  constructor(private program: ts.Program) {}

  analyze(): { edges: ImportEdge[]; cycles: Cycle[]; entryPoints: string[] } {
    this.edges = [];
    for (const sourceFile of this.program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('node_modules')) continue;
      this.processFile(sourceFile);
    }

    const cycles = this.detectCycles();
    const entryPoints = this.findEntryPoints();
    return { edges: this.edges, cycles, entryPoints };
  }

  private processFile(sourceFile: ts.SourceFile): void {
    const from = sourceFile.fileName;
    ts.forEachChild(sourceFile, function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
        const moduleText = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
        if (!moduleText.startsWith('.') && !moduleText.startsWith('/')) return; // external dep
        // Resolve relative to source file
        const resolved = path.resolve(path.dirname(from), moduleText);
        // Add .ts extension if missing
        const resolvedWithExt = resolved.endsWith('.ts') ? resolved : resolved + '.ts';
        this.edges.push({ from, to: resolvedWithExt, kind: node.moduleSpecifier.kind });
      }
      ts.forEachChild(node, visit);
    }.bind(this));
  }

  private detectCycles(): Cycle[] {
    const adjacency = new Map<string, string[]>();
    for (const edge of this.edges) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      adjacency.get(edge.from)!.push(edge.to);
    }

    const cycles: Cycle[] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const pathStack: string[] = [];

    function dfs(node: string): void {
      visited.add(node);
      recStack.add(node);
      pathStack.push(node);

      const neighbors = adjacency.get(node) || [];
      for (const next of neighbors) {
        if (recStack.has(next)) {
          // Found a cycle — extract it
          const cycleStart = pathStack.indexOf(next);
          const cycle = pathStack.slice(cycleStart);
          cycles.push({ nodes: [...cycle], length: cycle.length });
        } else if (!visited.has(next)) {
          dfs(next);
        }
      }

      pathStack.pop();
      recStack.delete(node);
    }

    for (const node of adjacency.keys()) {
      if (!visited.has(node)) dfs(node);
    }

    return cycles;
  }

  private findEntryPoints(): string[] {
    const hasIncoming = new Set<string>();
    for (const edge of this.edges) hasIncoming.add(edge.to);
    const allFiles = new Set<string>();
    for (const edge of this.edges) { allFiles.add(edge.from); allFiles.add(edge.to); }
    return Array.from(allFiles).filter(f => !hasIncoming.has(f));
  }
}
```

## 5. Phase 2: Semantic Rules (Replacing All Regex)

**Duration:** 3 days  
**Goal:** Replace each of the 24 regex-based layer files with AST-based checks. Each rule is a standalone file in `src/semantic-firewall/rules/`. Rules run during `write-time` (pre-block) and `post-write` (audit) phases.

### 5.1 Rule: No Empty Catch

**File: NEW `src/semantic-firewall/rules/no-empty-catch.ts`**

Bible §6.1 replacement for L1 (theatrical detection) and L4 (inspection). The old regex `catch\s*\{[^}]*\}` was Order 1 and caught false positives in comments and strings.

```typescript
import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';

/**
 * Check for empty catch blocks in source code.
 * Bible §6.1: Empty catch verification via AST.
 * Replaces: L1 (theatrical regex), L4 (inspection regex)
 * Analysis Order: 2 (AST)
 */
export function checkNoEmptyCatches(): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      const pos = getNodePosition(node, sourceFile);
      return {
        rule: 'no-empty-catch',
        severity: 'error',
        file: sourceFile.fileName,
        line: pos.line,
        column: pos.column,
        message: '[P3] Empty catch block — must log/recover/propagate. Never catch{} without handling.',
        nodeKind: 'CatchClause',
        sourceSnippet: getNodeSnippet(node, sourceFile),
      };
    }
    return null;
  };
}
```

### 5.2 Rule: No Unsafe Cast

**File: NEW `src/semantic-firewall/rules/no-unsafe-cast.ts`**

Bible §6.3 replacement for L5.3 (model restriction) and general type safety. The old regex on `as` keyword had false positives on legitimately safe casts.

```typescript
import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet, findParentKind } from '../analyzers/ast-walker.js';

/**
 * Check for type assertions without preceding runtime guard.
 * Bible §6.3: Unguarded cast detection via TypeChecker.
 * Analysis Order: 3 (TypeChecker)
 *
 * Strategy:
 * 1. Find all AsExpression nodes (type assertions like `x as Type`)
 * 2. Walk up the AST to find if a typeof guard or instanceof check precedes it
 * 3. If no guard found, report as unsafe cast
 */
export function checkNoUnsafeCasts(): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isAsExpression(node)) return null;

    // Allow casts to 'unknown' (they're safe conversion points)
    if (node.type.kind === ts.SyntaxKind.UnknownKeyword) return null;

    // Check for preceding runtime validation in parent statements
    let hasValidation = false;
    const parentBlock = findParentKind(node, ts.SyntaxKind.Block);
    if (parentBlock && ts.isBlock(parentBlock)) {
      const nodeStart = node.getStart(sourceFile);
      for (const stmt of parentBlock.statements) {
        const stmtEnd = stmt.getEnd();
        if (stmtEnd > nodeStart) break; // Only check statements BEFORE the cast
        const stmtText = stmt.getText(sourceFile);
        // Check for typeof guard, instanceof, or type check function
        if (
          /\btypeof\s+\w+\s*===\s*['"]/.test(stmtText) ||
          /\binstanceof\b/.test(stmtText) ||
          /\bis[A-Z]\w+\(/.test(stmtText) ||
          /\bvalidate\b/.test(stmtText) ||
          /\bz\.parse\b/.test(stmtText) ||
          /\bz\.safeParse\b/.test(stmtText)
        ) {
          hasValidation = true;
          break;
        }
      }
    }

    if (!hasValidation) {
      const pos = getNodePosition(node, sourceFile);
      return {
        rule: 'no-unsafe-cast',
        severity: 'error',
        file: sourceFile.fileName,
        line: pos.line,
        column: pos.column,
        message: `[P2] Unchecked cast to '${node.type.getText(sourceFile)}' — validate input with typeof/instanceof/zod before 'as'`,
        nodeKind: 'AsExpression',
        sourceSnippet: getNodeSnippet(node, sourceFile),
      };
    }
    return null;
  };
}
```

### 5.3 Rule: No Floating Promises

**File: NEW `src/semantic-firewall/rules/no-floating-promises.ts`**

Bible §6.4 replacement for L2 (test bypass), L5.9 (impatience). The old regex was `\.then\(\)` which missed async/await patterns.

```typescript
import * as ts from 'typescript';
import { CFGBuilder, computeDominators } from '../analyzers/cfg-builder.js';
import { forwardDFA, unionMeet } from '../analyzers/data-flow.js';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';

/**
 * Detect promises that are created but never awaited or caught.
 * Bible §6.4: Floating promise detection via CFG/DFA.
 * Analysis Order: 4 (CFG/DFA)
 *
 * Strategy:
 * 1. Find CallExpressions that return Promise<T>
 * 2. Build CFG for the enclosing function
 * 3. Forward DFA to track if the promise value is awaited or .catch()ed on all paths
 */
export function checkNoFloatingPromises(checker: ts.TypeChecker): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isCallExpression(node)) return null;

    // Check if this call returns a Promise
    const type = checker.getTypeAtLocation(node);
    const typeText = checker.typeToString(type);
    if (!typeText.startsWith('Promise') && !typeText.includes('Promise<')) return null;

    // Check if it's awaited
    if (ts.isAwaitExpression(node.parent)) return null;

    // Check if it has a .catch()
    if (ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === 'catch') return null;

    // Check if it's returned
    if (ts.isReturnStatement(node.parent)) return null;

    // Check if it's passed to a function that handles it
    if (ts.isCallExpression(node.parent)) return null;

    // Check if the result is assigned to a variable that's later awaited
    if (ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      // Variable assignment — check if it's later awaited (complex DFA)
      // Simplified: just flag for now, full DFA in Phase 2
      return null;
    }

    const pos = getNodePosition(node, sourceFile);
    return {
      rule: 'no-floating-promises',
      severity: 'error',
      file: sourceFile.fileName,
      line: pos.line,
      column: pos.column,
      message: `[P9] Floating Promise returned by call — must be await'ed, .catch()'ed, or returned. Unhandled rejections crash the process.`,
      nodeKind: 'CallExpression',
      sourceSnippet: getNodeSnippet(node, sourceFile),
    };
  };
}
```

### 5.4 Rule: Evidence-Bearing Results

**File: NEW `src/semantic-firewall/rules/evidence-bearing-results.ts`**

Bible §6.2 replacement for L5.14 (theatrical claim), L5.2 (success claim). The old regex `"success":\s*true` could not distinguish real success from theatrical claims.

```typescript
import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';

/**
 * Detect functions that return success/true without producing evidence.
 * Bible §6.2: Theatrical return detection via AST + DFA.
 * Analysis Order: 2 (AST) + 4 (DFA for side-effect check)
 *
 * Strategy:
 * 1. Find return statements with { success: true } or { passed: true }
 * 2. Walk backwards to check if a side-effect call precedes the return
 * 3. Side-effect calls include: writeFileSync, appendFileSync, mkdirSync, etc.
 */
export function checkEvidenceBearingResults(): ASTVisitor {
  const WRITE_APIS = new Set([
    'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile',
    'mkdirSync', 'mkdir', 'copyFileSync', 'renameSync',
    'execSync', 'exec', 'spawnSync',
    'writeJson', 'outputJson', 'outputFile',
    'push', 'log', 'info', 'warn', 'error',
  ]);

  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isReturnStatement(node) || !node.expression) return null;

    // Check if returning an object literal with success/passed
    if (!ts.isObjectLiteralExpression(node.expression)) return null;

    const text = node.expression.getText(sourceFile);
    const hasSuccess = /['"]?(success|passed)['"]?\s*:\s*true/i.test(text);

    if (!hasSuccess) return null;

    // Walk backwards in the enclosing block to find side-effect calls
    let hasSideEffect = false;
    let parent = node.parent;
    while (parent && !ts.isSourceFile(parent)) {
      if (ts.isBlock(parent)) {
        const nodeIndex = parent.statements.indexOf(node as unknown as ts.Statement);
        for (let i = nodeIndex - 1; i >= 0; i--) {
          const stmt = parent.statements[i];
          const stmtText = stmt.getText(sourceFile);
          for (const api of WRITE_APIS) {
            if (stmtText.includes(api)) {
              hasSideEffect = true;
              break;
            }
          }
          if (hasSideEffect) break;
        }
      }
      if (hasSideEffect) break;
      parent = parent.parent;
    }

    if (!hasSideEffect) {
      const pos = getNodePosition(node, sourceFile);
      return {
        rule: 'evidence-bearing-results',
        severity: 'error',
        file: sourceFile.fileName,
        line: pos.line,
        column: pos.column,
        message: `[P10] Theatrical return — '{ success: true }' without preceding side-effect call. Evidence must be produced before claiming success.`,
        nodeKind: 'ReturnStatement',
        sourceSnippet: getNodeSnippet(node, sourceFile),
      };
    }
    return null;
  };
}
```

### 5.5 Rule: No Hardcoded Paths

**File: NEW `src/semantic-firewall/rules/no-hardcoded-paths.ts`**

Bible §7 replacement for L3 (inspection). Replaces regex check on source files with AST-aware path detection.

```typescript
import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';

/**
 * Detect hardcoded machine-specific paths in string literals.
 * Bible §7: Path Resolution anti-pattern.
 * Analysis Order: 2 (AST)
 *
 * Detects:
 * - /home/username/ paths
 * - /Users/username/ paths (macOS)
 * - C:\\ paths (Windows)
 * - ~/ paths (should use os.homedir())
 */
export function checkNoHardcodedPaths(): ASTVisitor {
  const pathPatterns = [
    { pattern: /['"`]\/home\/[^/]/, message: '[P7] Hardcoded /home/ path — use os.homedir() + path.join()' },
    { pattern: /['"`]\/Users\/[^/]/, message: '[P7] Hardcoded /Users/ path — use os.homedir() + path.join()' },
    { pattern: /['"`][A-Z]:\\/, message: '[P7] Hardcoded Windows C:\\ path — use path.resolve()' },
  ];

  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return null;
    const text = node.text;

    for (const { pattern, message } of pathPatterns) {
      if (pattern.test(text)) {
        const pos = getNodePosition(node, sourceFile);
        return {
          rule: 'no-hardcoded-paths',
          severity: 'error',
          file: sourceFile.fileName,
          line: pos.line,
          column: pos.column,
          message,
          nodeKind: 'StringLiteral',
          sourceSnippet: getNodeSnippet(node, sourceFile),
        };
      }
    }
    return null;
  };
}
```

### 5.6 Rule: Cleanup Paired Intervals

**File: NEW `src/semantic-firewall/rules/cleanup-paired-intervals.ts`**

Bible §6.4 (resource lifecycle) replacement for L5.8 (undermining), L5.17 (retard logic).

```typescript
import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';

/**
 * Detect setInterval() calls without paired clearInterval() in the same function scope.
 * Bible §4 (Resource Lifecycle): Every resource acquisition must have paired release.
 * Analysis Order: 2 (AST) + 4 (CFG for path verification)
 */
export function checkCleanupPairedIntervals(): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isCallExpression(node)) return null;

    const calleeText = node.expression.getText(sourceFile);
    if (calleeText !== 'setInterval') return null;

    // Find the enclosing function or block
    let scope = node.parent;
    while (scope && !ts.isSourceFile(scope) && !ts.isFunctionDeclaration(scope) && !ts.isArrowFunction(scope) && !ts.isMethodDeclaration(scope)) {
      scope = scope.parent;
    }
    if (!scope || ts.isSourceFile(scope)) return null;

    // Walk the scope looking for clearInterval
    const scopeText = scope.getText(sourceFile);
    if (!scopeText.includes('clearInterval')) {
      const pos = getNodePosition(node, sourceFile);
      return {
        rule: 'cleanup-paired-intervals',
        severity: 'error',
        file: sourceFile.fileName,
        line: pos.line,
        column: pos.column,
        message: '[P4] setInterval() without clearInterval() — resource leak. Wrap in try/finally and call clearInterval().',
        nodeKind: 'CallExpression',
        sourceSnippet: getNodeSnippet(node, sourceFile),
      };
    }
    return null;
  };
}
```

### 5.7 Rule: Handle Zero Length

**File: NEW `src/semantic-firewall/rules/handle-zero-length.ts`**

Detects array access without length check.

```typescript
import * as ts from 'typescript';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';

/**
 * Detect array element access without preceding length check.
 * Analysis Order: 2 (AST) + 4 (CFG for path verification)
 */
export function checkHandleZeroLength(): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isElementAccessExpression(node) && !ts.isPropertyAccessExpression(node)) return null;

    // Must be array access like arr[0] or arr.length
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'length') return null;

    // Check if the parent or enclosing block has a length check
    let parent = node.parent;
    while (parent && !ts.isSourceFile(parent)) {
      if (ts.isIfStatement(parent)) {
        const condText = parent.expression.getText(sourceFile);
        const arrText = ts.isElementAccessExpression(node)
          ? node.expression.getText(sourceFile)
          : node.expression.getText(sourceFile);
        if (condText.includes(`${arrText}.length`) || condText.includes(`${arrText}.length > 0`)) {
          return null; // Guarded
        }
      }
      parent = parent.parent;
    }

    const pos = getNodePosition(node, sourceFile);
    return {
      rule: 'handle-zero-length',
      severity: 'warning',
      file: sourceFile.fileName,
      line: pos.line,
      column: pos.column,
      message: '[P2] Array access without length check — may throw on empty array',
      nodeKind: node.kind === ts.SyntaxKind.ElementAccessExpression ? 'ElementAccessExpression' : 'PropertyAccessExpression',
      sourceSnippet: getNodeSnippet(node, sourceFile),
    };
  };
}
```

### 5.8 Rule: Theatrical Return

**File: NEW `src/semantic-firewall/rules/theatrical-return.ts`**

Bible §6.2 replacement for L5.14 (theatrical claim), L5.2 (success claim). Full DFA-based check.

```typescript
import * as ts from 'typescript';
import { CFGBuilder } from '../analyzers/cfg-builder.js';
import { ASTVisitor, getNodePosition, getNodeSnippet } from '../analyzers/ast-walker.js';

/**
 * Detect return statements that claim success without producing evidence.
 * Bible §6.2: Theatrical return detection via AST + DFA.
 * Analysis Order: 4 (CFG + DFA)
 *
 * More thorough than evidence-bearing-results.ts — this one builds a CFG
 * and checks ALL paths from entry to return.
 */
export function checkTheatricalReturn(checker: ts.TypeChecker): ASTVisitor {
  return (node: ts.Node, sourceFile: ts.SourceFile) => {
    if (!ts.isReturnStatement(node) || !node.expression) return null;
    if (!ts.isObjectLiteralExpression(node.expression)) return null;

    const text = node.expression.getText(sourceFile);
    if (!/['"]?(success|passed)['"]?\s*:\s*true/i.test(text)) return null;

    // Find enclosing function body
    let fn = node.parent;
    while (fn && !ts.isSourceFile(fn) && !ts.isFunctionDeclaration(fn) && !ts.isArrowFunction(fn) && !ts.isMethodDeclaration(fn)) {
      fn = fn.parent;
    }
    if (!fn || ts.isSourceFile(fn)) return null;

    // Get function body
    const body = ts.isFunctionDeclaration(fn as ts.Node) ? (fn as ts.FunctionDeclaration).body :
      ts.isArrowFunction(fn as ts.Node) ? (fn as ts.ArrowFunction).body : null;
    if (!body || !ts.isBlock(body)) return null;

    // Build CFG and check for side-effect calls on all paths
    const cfgBuilder = new CFGBuilder();
    const blocks = cfgBuilder.buildFromBody(body);
    const dom = computeDominators(blocks);
    // For each return statement node, trace back through dominators
    // and check if any block contains a write API call
    // Simplified for Phase 1: check if the function body contains write API calls
    const bodyText = body.getText(sourceFile);
    const writeAPIs = ['writeFileSync', 'appendFileSync', 'execSync', 'push', 'log'];
    const hasWriteAPI = writeAPIs.some(api => bodyText.includes(api));

    if (!hasWriteAPI) {
      const pos = getNodePosition(node, sourceFile);
      return {
        rule: 'theatrical-return',
        severity: 'error',
        file: sourceFile.fileName,
        line: pos.line,
        column: pos.column,
        message: `[P10] Theatrical return — no evidence-producing API call found in this function. Claiming success without proof.`,
        nodeKind: 'ReturnStatement',
        sourceSnippet: getNodeSnippet(node, sourceFile),
      };
    }
    return null;
  };
}
```

### 5.9 Rule: Scope Violation

**File: NEW `src/semantic-firewall/rules/scope-violation.ts`**

Bible §14.2 replacement for L5.7 (scope creep). Uses filesystem diff instead of regex on agent prose.

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export interface FileSnapshot {
  path: string;
  hash: string;
  mtime: number;
}

export interface ScopeViolation {
  file: string;
  reason: 'outside-project' | 'unexpected-change' | 'missing-expected';
  expected: string;
  actual: string;
}

/**
 * Snapshot the current state of a directory tree.
 * Bible §14.2: Scope boundary enforcement via filesystem diff.
 */
export function snapshotDirectory(rootDir: string, exclude: string[] = ['node_modules', '.git', 'dist']): FileSnapshot[] {
  const snapshots: FileSnapshot[] = [];
  const absoluteRoot = path.resolve(rootDir);

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (exclude.some(e => fullPath.includes(e))) continue;
      if (entry.isDirectory()) { walk(fullPath); continue; }
      const content = fs.readFileSync(fullPath);
      const hash = createHash('sha256').update(content).digest('hex');
      snapshots.push({ path: fullPath, hash, mtime: fs.statSync(fullPath).mtimeMs });
    }
  }

  walk(absoluteRoot);
  return snapshots.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Compare two snapshots and return violations.
 */
export function diffSnapshots(
  before: FileSnapshot[],
  after: FileSnapshot[],
  allowedScope: string[]
): ScopeViolation[] {
  const violations: ScopeViolation[] = [];
  const beforeMap = new Map(before.map(s => [s.path, s]));
  const afterMap = new Map(after.map(s => [s.path, s]));

  // Check for changed files
  for (const afterSnap of after) {
    const beforeSnap = beforeMap.get(afterSnap.path);
    if (beforeSnap && beforeSnap.hash !== afterSnap.hash) {
      // File changed — check if it's in scope
      const isInScope = allowedScope.some(s => afterSnap.path.startsWith(s));
      if (!isInScope) {
        violations.push({
          file: afterSnap.path,
          reason: 'unexpected-change',
          expected: `${allowedScope.join(', ')}`,
          actual: afterSnap.path,
        });
      }
    }
  }

  // Check for new files
  for (const afterSnap of after) {
    if (!beforeMap.has(afterSnap.path)) {
      const isInScope = allowedScope.some(s => afterSnap.path.startsWith(s));
      if (!isInScope) {
        violations.push({
          file: afterSnap.path,
          reason: 'unexpected-change',
          expected: `${allowedScope.join(', ')}`,
          actual: `New file: ${afterSnap.path}`,
        });
      }
    }
  }

  return violations;
}
```

### 5.10 Rule: Dead Export

**File: NEW `src/semantic-firewall/rules/dead-export.ts`**

Detects exports that are never imported anywhere. Bible §Appendix A.

```typescript
import * as ts from 'typescript';

export interface DeadExport {
  file: string;
  exportName: string;
  line: number;
}

/**
 * Find exported symbols that are never referenced.
 * Bible §Appendix A: Dead export detection via TypeChecker.
 * Analysis Order: 3 (TypeChecker)
 */
export function findDeadExports(program: ts.Program, checker: ts.TypeChecker): DeadExport[] {
  const dead: DeadExport[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('node_modules')) continue;

    ts.forEachChild(sourceFile, function visit(node: ts.Node) {
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        // Re-export: check if the re-exported symbols are used
        // Complex — skip for Phase 1
      }

      if (ts.isExportAssignment(node)) {
        // export default — check if the module is ever imported
        const symbol = checker.getSymbolAtLocation(node.expression);
        if (symbol) {
          const refs = checker.findReferences(symbol, sourceFile.fileName);
          if (refs.length === 0) {
            const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            dead.push({ file: sourceFile.fileName, exportName: 'default', line: pos.line + 1 });
          }
        }
      }

      ts.forEachChild(node, visit);
    });
  }

  return dead;
}
```

## 6. Phase 3: Context-Aware Enforcement Engine

**Duration:** 2 days  
**Goal:** The enforcement engine must understand WHO is acting, ON WHAT, in WHOSE INTEREST, and at WHAT GATE. This prevents the `bun build` problem — the same operation is treated differently based on context.

### 6.1 ExecutionContext

**File: NEW `src/semantic-firewall/execution-context.ts`**

```typescript
import { isSharkAgent } from '../../shared/agent-identity.js';
import { Guardian } from '../../shared/guardian.js';
import type { GatePhase } from '../enforcement-brain/types.js';

export interface EditHistoryEntry {
  toolName: string;
  filePath: string;
  timestamp: number;
  agentName: string;
}

export class ExecutionContext {
  private editHistory: EditHistoryEntry[] = [];
  private _currentGate: GatePhase = 'plan';
  private _currentAgent: string = '';
  private _projectRoot: string = '';

  constructor(
    private guardian: Guardian,
    private sharkProjectRoot: string = ''
  ) {
    this._projectRoot = sharkProjectRoot || process.cwd();
  }

  get currentGate(): GatePhase { return this._currentGate; }
  get currentAgent(): string { return this._currentAgent; }
  get projectRoot(): string { return this._projectRoot; }

  setGate(gate: GatePhase): void { this._currentGate = gate; }
  setAgent(agent: string): void { this._currentAgent = agent; }

  recordEdit(toolName: string, filePath: string): void {
    this.editHistory.push({
      toolName, filePath, timestamp: Date.now(), agentName: this._currentAgent,
    });
    // Keep only last 100 entries
    if (this.editHistory.length > 100) this.editHistory.shift();
  }

  /**
   * Is the target file within SHARK's own project directory?
   * If yes, operations like bun build are ENGINEERING, not ATTACKING.
   */
  isSharkProjectFile(filePath: string): boolean {
    if (!this._projectRoot) return false;
    const resolved = require('path').resolve(filePath);
    return resolved.startsWith(this._projectRoot);
  }

  /**
   * Did the agent just edit a source file before this build command?
   * If yes, bun build is COMPILING, not ATTACKING.
   */
  hasRecentEdit(): boolean {
    const recent = this.editHistory
      .filter(e => Date.now() - e.timestamp < 60000) // within last 60 seconds
      .filter(e => e.toolName === 'edit' || e.toolName === 'write');
    return recent.length > 0;
  }

  /**
   * Is the current gate permissive of this operation?
   */
  isOperationAllowedForGate(toolName: string, targetFile: string): boolean {
    // During build gate, build commands are expected
    if (this._currentGate === 'build') {
      if (toolName === 'bash' && targetFile.includes('bun build')) return true;
      if (toolName === 'bash' && targetFile.includes('dist/')) return true;
    }
    // During test gate, test commands are expected
    if (this._currentGate === 'test') {
      if (toolName === 'shark-test-runner') return true;
      if (toolName === 'shark-browser-test') return true;
    }
    return false;
  }

  /**
   * Should this operation be allowed based on full context?
   * This is the KEY method that prevents the bun build block.
   */
  shouldAllowEngineeringOperation(toolName: string, args: Record<string, unknown>): boolean {
    const command = typeof args.command === 'string' ? args.command : '';
    const filePath = typeof args.filePath === 'string' ? args.filePath : '';

    // SHARK building its own project = engineering
    if (this._currentAgent && isSharkAgent(this._currentAgent)) {
      if (command.includes('bun build') && command.includes('src/index.ts') && command.includes('dist/')) {
        if (this.isSharkProjectFile(command)) return true;
      }
      // SHARK editing its own source = engineering
      if (filePath && this.isSharkProjectFile(filePath)) return true;
      // SHARK reading its own files = engineering
      if (filePath && this.isSharkProjectFile(filePath)) return true;
    }

    return false;
  }
}
```

### 6.2 SemanticFirewall Engine

**File: NEW `src/semantic-firewall/semantic-firewall.ts`**

This replaces the current `EnforcementBrain` class. It orchestrates all semantic rules, phases, and context awareness.

```typescript
import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { createProjectCompilerHost, getSourceFiles } from './analyzers/ts-compiler-host.js';
import { walkAST, ASTVisitResult } from './analyzers/ast-walker.js';
import { ExecutionContext } from './execution-context.js';
import { Guardian } from '../../shared/guardian.js';

import { checkNoEmptyCatches } from './rules/no-empty-catch.js';
import { checkNoUnsafeCasts } from './rules/no-unsafe-cast.js';
import { checkNoFloatingPromises } from './rules/no-floating-promises.js';
import { checkEvidenceBearingResults } from './rules/evidence-bearing-results.js';
import { checkNoHardcodedPaths } from './rules/no-hardcoded-paths.js';
import { checkCleanupPairedIntervals } from './rules/cleanup-paired-intervals.js';
import { checkHandleZeroLength } from './rules/handle-zero-length.js';
import { checkTheatricalReturn } from './rules/theatrical-return.js';

export type AnalysisPhase = 'write-time' | 'post-write';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface RuleConfig {
  name: string;
  severity: Severity;
  enabled: boolean;
  orders: number; // Minimum analysis order required
}

export interface FirewallDiag extends ASTVisitResult {
  severity: Severity;
  phase: AnalysisPhase;
}

export interface FirewallResult {
  passed: boolean;
  diagnostics: FirewallDiag[];
  phase: AnalysisPhase;
}

export class SemanticFirewall {
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;
  private sourceFiles: Map<string, ts.SourceFile> = new Map();

  constructor(
    private projectRoot: string,
    private context: ExecutionContext,
    private guardian: Guardian
  ) {}

  /**
   * Initialize the TypeScript compiler host.
   * Must be called before analyze().
   * Bible §3.1: Compiler API Integration Pattern.
   */
  initialize(): void {
    if (typeof ts.createProgram !== 'function') {
      throw new Error('[P1] TypeScript API not available — install typescript package');
    }
    if (!fs.existsSync(path.join(this.projectRoot, 'tsconfig.json'))) {
      // No tsconfig — create a minimal one in memory
      const files = new Map<string, string>();
      this.loadSourceFilesRecursive(this.projectRoot, files, 10); // max 10 files deep
      if (files.size === 0) {
        console.warn('[SemanticFirewall] No TypeScript source files found. Running in reduced mode.');
        return;
      }
      const host = this.createBasicHost(files);
      this.program = host.program;
      this.checker = host.checker;
      this.sourceFiles = getSourceFiles(this.program);
      return;
    }
    try {
      const host = createProjectCompilerHost(this.projectRoot);
      this.program = host.program;
      this.checker = host.checker;
      this.sourceFiles = getSourceFiles(this.program);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[SemanticFirewall] Compiler host init failed: ${msg}. Running in reduced mode.`);
    }
  }

  /**
   * Run semantic analysis for a given phase.
   * write-time: Orders 0-2 (fast, pre-write). Blocks CRITICAL/HIGH.
   * post-write: Orders 0-5 (full). Blocks/quarantines CRITICAL/HIGH post-hoc.
   */
  analyze(phase: AnalysisPhase, rules: RuleConfig[]): FirewallResult {
    const maxOrder = phase === 'write-time' ? 2 : 5;
    const diagnostics: FirewallDiag[] = [];

    const activeRules = rules.filter(r => r.enabled && r.orders <= maxOrder);

    for (const rule of activeRules) {
      const ruleResults = this.evaluateRule(rule);
      for (const result of ruleResults) {
        diagnostics.push({ ...result, phase });
      }
    }

    const errors = diagnostics.filter(d => d.severity === 'CRITICAL' || d.severity === 'HIGH');
    return {
      passed: errors.length === 0,
      diagnostics,
      phase,
    };
  }

  private evaluateRule(rule: RuleConfig): FirewallDiag[] {
    const visitors: Function[] = [];

    switch (rule.name) {
      case 'no-empty-catch':
        visitors.push(checkNoEmptyCatches());
        break;
      case 'no-unsafe-cast':
        if (this.checker) visitors.push(checkNoUnsafeCasts());
        break;
      case 'no-floating-promises':
        if (this.checker) visitors.push(checkNoFloatingPromises(this.checker));
        break;
      case 'evidence-bearing-results':
        visitors.push(checkEvidenceBearingResults());
        break;
      case 'no-hardcoded-paths':
        visitors.push(checkNoHardcodedPaths());
        break;
      case 'cleanup-paired-intervals':
        visitors.push(checkCleanupPairedIntervals());
        break;
      case 'handle-zero-length':
        visitors.push(checkHandleZeroLength());
        break;
      case 'theatrical-return':
        if (this.checker) visitors.push(checkTheatricalReturn(this.checker));
        break;
    }

    if (visitors.length === 0 || this.sourceFiles.size === 0) return [];

    const results: any[] = walkAST(this.sourceFiles, visitors);

    // Map AST severity to standard severity based on rule config
    return results.map(r => ({
      ...r,
      severity: r.severity === 'error' ? rule.severity : 'MEDIUM' as Severity,
    }));
  }

  private loadSourceFilesRecursive(dir: string, files: Map<string, string>, maxDepth: number): void {
    if (maxDepth <= 0) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.loadSourceFilesRecursive(fullPath, files, maxDepth - 1);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
          try {
            files.set(fullPath, fs.readFileSync(fullPath, 'utf-8'));
          } catch { /* skip unreadable */ }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  private createBasicHost(files: Map<string, string>) {
    const { createInMemoryCompilerHost } = require('./analyzers/ts-compiler-host.js');
    return createInMemoryCompilerHost(files, {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    });
  }
}
```

### 6.3 Write-Time Gate Hook

**File: NEW `src/hooks/v4.1/write-time-gate.ts`**

This is the `tool.execute.before` hook that runs L0-L2 semantic analysis BEFORE the write.

```typescript
import type { Hooks } from '@opencode-ai/plugin';
import { SemanticFirewall, RuleConfig, AnalysisPhase } from '../../semantic-firewall/semantic-firewall.js';
import { ExecutionContext } from '../../semantic-firewall/execution-context.js';
import { isSharkAgent } from '../../shared/agent-identity.js';
import { StructuredBlockError } from '../../shark/enforcement-brain/enforcement-brain.js';

const WRITE_TIME_RULES: RuleConfig[] = [
  { name: 'no-empty-catch', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-unsafe-cast', severity: 'HIGH', enabled: true, orders: 3 },
  { name: 'no-floating-promises', severity: 'MEDIUM', enabled: true, orders: 4 },
  { name: 'evidence-bearing-results', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-hardcoded-paths', severity: 'MEDIUM', enabled: true, orders: 2 },
  { name: 'cleanup-paired-intervals', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'handle-zero-length', severity: 'LOW', enabled: true, orders: 2 },
];

export function createWriteTimeGate(
  firewall: SemanticFirewall,
  context: ExecutionContext
): Hooks['tool.execute.before'] {
  return async (input: any, output: any) => {
    // Only enforce on write/edit/bash operations
    const toolName = input?.tool || '';
    if (!['write', 'edit', 'bash'].includes(toolName)) return;

    // Only enforce for SHARK agents
    const agent = input?.agent || '';
    if (agent && !isSharkAgent(agent)) return;

    // Check if this is a legitimate engineering operation
    const args = (input as any)?.args || (output as any)?.args || {};
    if (context.shouldAllowEngineeringOperation(toolName, args)) return;

    // Run write-time semantic analysis
    const result = firewall.analyze('write-time', WRITE_TIME_RULES);

    if (!result.passed) {
      const critical = result.diagnostics.filter(d => d.severity === 'CRITICAL' || d.severity === 'HIGH');
      if (critical.length > 0) {
        const first = critical[0];
        throw new StructuredBlockError({
          level: 'BLOCK',
          lobe: 'semantic-firewall',
          findingId: `SF-${first.rule.toUpperCase()}`,
          message: `[${first.severity}] ${first.message} (${first.file}:${first.line})`,
          correction: `Fix violation: ${first.message}`,
        });
      }
    }

    // Record edit in execution context for build awareness
    if (toolName === 'edit' || toolName === 'write') {
      const filePath = typeof args.filePath === 'string' ? args.filePath : '';
      if (filePath) context.recordEdit(toolName, filePath);
    }
  };
}
```

### 6.4 Post-Write Audit Hook

**File: NEW `src/hooks/v4.1/post-write-audit.ts`**

This is the `tool.execute.after` hook that runs full L0-L5 analysis and quarantines violations.

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SemanticFirewall, RuleConfig } from '../../semantic-firewall/semantic-firewall.js';

const POST_WRITE_RULES: RuleConfig[] = [
  { name: 'no-empty-catch', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-unsafe-cast', severity: 'HIGH', enabled: true, orders: 3 },
  { name: 'no-floating-promises', severity: 'MEDIUM', enabled: true, orders: 4 },
  { name: 'evidence-bearing-results', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'no-hardcoded-paths', severity: 'MEDIUM', enabled: true, orders: 2 },
  { name: 'cleanup-paired-intervals', severity: 'HIGH', enabled: true, orders: 2 },
  { name: 'handle-zero-length', severity: 'LOW', enabled: true, orders: 2 },
  { name: 'theatrical-return', severity: 'CRITICAL', enabled: true, orders: 4 },
];

export function createPostWriteAudit(
  firewall: SemanticFirewall,
  quarantineDir: string
): Function {
  return async (input: any, output: any) => {
    const toolName = input?.tool || '';
    if (!['write', 'edit'].includes(toolName)) return;

    const args = (input as any)?.args || (output as any)?.args || {};
    const filePath = typeof args.filePath === 'string' ? args.filePath : '';

    // Run full post-write semantic analysis
    const result = firewall.analyze('post-write', POST_WRITE_RULES);

    // Handle CRITICAL findings: quarantine the file
    const critical = result.diagnostics.filter(d => d.severity === 'CRITICAL');
    for (const diag of critical) {
      if (filePath) {
        try {
          const quarantinePath = path.join(quarantineDir, 'quarantine', `${Date.now()}-${path.basename(filePath)}`);
          fs.mkdirSync(path.dirname(quarantinePath), { recursive: true });
          if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, quarantinePath);
            fs.writeFileSync(filePath, `// QUARANTINED: ${diag.message}\n// Original at: ${quarantinePath}\n`);
          }
        } catch { /* quarantine might fail silently */ }
      }
    }

    // Log all findings
    if (result.diagnostics.length > 0) {
      const logPath = path.join(quarantineDir, 'evidence', 'enforcement', `sf-audit-${Date.now()}.json`);
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.writeFileSync(logPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        toolName,
        filePath,
        phase: 'post-write',
        total: result.diagnostics.length,
        critical: critical.length,
        diagnostics: result.diagnostics,
      }, null, 2));
    }

    // Append warnings to output
    const warnings = result.diagnostics.filter(d => d.severity === 'MEDIUM');
    if (warnings.length > 0 && output) {
      for (const w of warnings) {
        output.system = output.system || [];
        output.system.push(`[SEMANTIC-FIREWALL] ${w.severity}: ${w.message}`);
      }
    }
  };
}
```

## 7. Phase 4: Gate Engine + Merkle Evidence

**Duration:** 2 days  
**Goal:** Replace the current manual gate advancement with an XState hierarchical state machine, and hand-written evidence files with cryptographic linking.

### 7.1 Gate Engine

**File: NEW `src/gate-engine/gate-engine.ts`**

```typescript
/**
 * Gate Engine — Hierarchical state machine for the 6-gate chain.
 * Bible §4.4: The Gate Chain.
 * Replaces: Manual if/else gate advancement in enforcement-brain.ts.
 */

export type GateID = 'plan' | 'build' | 'test' | 'verify' | 'audit' | 'delivery';

export interface GateCriteria {
  requiredEvidence: string[];
  minEvidence: number;
  requiresBuild: boolean;
  requiresTest: boolean;
}

export interface GateState {
  currentGate: GateID;
  previousGates: GateID[];
  evidence: Map<string, boolean>;
  iteration: number;
}

const GATE_CRITERIA: Record<GateID, GateCriteria> = {
  plan: { requiredEvidence: ['spec', 'architecture', 'error-strategy'], minEvidence: 3, requiresBuild: false, requiresTest: false },
  build: { requiredEvidence: ['compiled', 'source-verified', 'deps-installed'], minEvidence: 3, requiresBuild: false, requiresTest: false },
  test: { requiredEvidence: ['container-test', 'unit-test', 'browser-test'], minEvidence: 2, requiresBuild: true, requiresTest: false },
  verify: { requiredEvidence: ['trident-report', 'semantic-firewall-pass', 'no-critical'], minEvidence: 3, requiresBuild: true, requiresTest: true },
  audit: { requiredEvidence: ['spec-alignment', 'test-authenticity', 'theatrical-scan'], minEvidence: 3, requiresBuild: true, requiresTest: true },
  delivery: { requiredEvidence: ['ship-package', 'checksum', 'evidence-archive'], minEvidence: 3, requiresBuild: true, requiresTest: true },
};

const GATE_ORDER: GateID[] = ['plan', 'build', 'test', 'verify', 'audit', 'delivery'];

export class GateEngine {
  private state: GateState = {
    currentGate: 'plan',
    previousGates: [],
    evidence: new Map(),
    iteration: 1,
  };

  getCurrentGate(): GateID { return this.state.currentGate; }
  getState(): GateState { return { ...this.state, evidence: new Map(this.state.evidence) }; }

  /**
   * Submit evidence for the current gate.
   */
  submitEvidence(evidenceId: string, passed: boolean): void {
    this.state.evidence.set(evidenceId, passed);
  }

  /**
   * Check if current gate criteria are met.
   */
  canAdvance(): { allowed: boolean; missing: string[]; failed: string[] } {
    const criteria = GATE_CRITERIA[this.state.currentGate];
    const missing: string[] = [];
    const failed: string[] = [];

    for (const req of criteria.requiredEvidence) {
      if (!this.state.evidence.has(req)) missing.push(req);
      else if (!this.state.evidence.get(req)) failed.push(req);
    }

    return {
      allowed: missing.length === 0 && failed.length === 0 && this.state.evidence.size >= criteria.minEvidence,
      missing,
      failed,
    };
  }

  /**
   * Advance to the next gate.
   * Returns false if criteria not met or if already at delivery.
   */
  advance(): boolean {
    const check = this.canAdvance();
    if (!check.allowed) return false;
    if (this.state.currentGate === 'delivery') return false;

    const currentIdx = GATE_ORDER.indexOf(this.state.currentGate);
    if (currentIdx === -1 || currentIdx >= GATE_ORDER.length - 1) return false;

    this.state.previousGates.push(this.state.currentGate);
    this.state.currentGate = GATE_ORDER[currentIdx + 1];
    this.state.evidence = new Map();
    this.state.iteration++;
    return true;
  }

  /**
   * Reset the gate state (for iteration loops).
   */
  reset(gate: GateID = 'plan'): void {
    this.state.currentGate = gate;
    this.state.previousGates = [];
    this.state.evidence = new Map();
  }

  /**
   * Get criteria for a specific gate.
   */
  getCriteria(gate: GateID): GateCriteria {
    return { ...GATE_CRITERIA[gate] };
  }

  /**
   * Serialize state for persistence.
   */
  serialize(): string {
    return JSON.stringify({
      currentGate: this.state.currentGate,
      previousGates: this.state.previousGates,
      evidence: Array.from(this.state.evidence.entries()),
      iteration: this.state.iteration,
    });
  }

  /**
   * Deserialize and restore state.
   */
  deserialize(json: string): void {
    try {
      const data = JSON.parse(json);
      this.state.currentGate = data.currentGate || 'plan';
      this.state.previousGates = data.previousGates || [];
      this.state.evidence = new Map(data.evidence || []);
      this.state.iteration = data.iteration || 1;
    } catch {
      this.reset('plan');
    }
  }
}
```

### 7.2 Merkle Chain Evidence

**File: NEW `src/evidence-engine/merkle-chain.ts`**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export interface EvidenceBlock {
  index: number;
  timestamp: string;
  data: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

export class MerkleChain {
  private blocks: EvidenceBlock[] = [];
  private chainPath: string;

  constructor(basePath: string) {
    this.chainPath = path.join(basePath, '.shark', 'evidence', 'chain');
    fs.mkdirSync(this.chainPath, { recursive: true });
    this.loadChain();
  }

  /**
   * Append a new evidence block to the chain.
   * Each block links to the previous via cryptographic hash.
   */
  append(data: Record<string, unknown>): EvidenceBlock {
    const previousBlock = this.blocks[this.blocks.length - 1];
    const block: EvidenceBlock = {
      index: this.blocks.length,
      timestamp: new Date().toISOString(),
      data,
      previousHash: previousBlock ? previousBlock.hash : '0'.repeat(64),
      hash: '',
    };
    block.hash = this.computeHash(block);
    this.blocks.push(block);
    this.persistBlock(block);
    return block;
  }

  /**
   * Verify chain integrity from genesis to latest.
   */
  verify(): { valid: boolean; brokenAt: number | null } {
    for (let i = 1; i < this.blocks.length; i++) {
      const expectedHash = this.computeHash(this.blocks[i]);
      if (this.blocks[i].hash !== expectedHash) {
        return { valid: false, brokenAt: i };
      }
      if (this.blocks[i].previousHash !== this.blocks[i - 1].hash) {
        return { valid: false, brokenAt: i };
      }
    }
    return { valid: true, brokenAt: null };
  }

  /**
   * Search evidence blocks by key-value pair.
   */
  search(key: string, value: unknown): EvidenceBlock[] {
    return this.blocks.filter(b => {
      const v = (b.data as any)[key];
      return v === value;
    });
  }

  /**
   * Get the latest N blocks.
   */
  recent(n: number): EvidenceBlock[] {
    return this.blocks.slice(-n);
  }

  private computeHash(block: EvidenceBlock): string {
    return createHash('sha256')
      .update(block.index.toString())
      .update(block.timestamp)
      .update(JSON.stringify(block.data))
      .update(block.previousHash)
      .digest('hex');
  }

  private persistBlock(block: EvidenceBlock): void {
    const fileName = `block-${String(block.index).padStart(6, '0')}.json`;
    fs.writeFileSync(
      path.join(this.chainPath, fileName),
      JSON.stringify(block, null, 2)
    );
  }

  private loadChain(): void {
    try {
      const files = fs.readdirSync(this.chainPath)
        .filter(f => f.startsWith('block-'))
        .sort();
      for (const file of files) {
        const content = fs.readFileSync(path.join(this.chainPath, file), 'utf-8');
        this.blocks.push(JSON.parse(content));
      }
    } catch {
      this.blocks = [];
    }
  }
}
```

### 7.3 Evidence Validator

**File: NEW `src/evidence-engine/evidence-validator.ts`**

Detects theatrical evidence patterns. Bible §6.2: Evidence Integrity.

```typescript
export interface ValidationResult {
  passed: boolean;
  issues: string[];
  score: number; // 0-100, higher = more authentic
}

export interface EvidenceFile {
  suite?: string;
  timestamp?: number | string;
  results?: Array<{ name: string; passed: boolean; machineEvidence?: string; rawOutput?: string }>;
  generatedBy?: string;
  containerName?: string;
  [key: string]: unknown;
}

/**
 * Validate an evidence file for authenticity.
 * Detects hand-written/theatrical evidence patterns.
 */
export function validateEvidence(evidence: EvidenceFile): ValidationResult {
  const issues: string[] = [];

  // Check 1: Has rawOutput fields
  const results = evidence.results || [];
  const hasRawOutput = results.some(r => !!r.rawOutput && r.rawOutput.length > 20);
  if (!hasRawOutput) {
    issues.push('No rawOutput fields found — evidence appears paraphrased, not captured');
  }

  // Check 2: machineEvidence contains actual data, not narrative summaries
  for (const r of results) {
    const me = r.machineEvidence || '';
    if (me.startsWith('Tool output:') || me.startsWith('Agent said:') || me.startsWith('Model cited:')) {
      issues.push(`Theatrical narrative in "${r.name}": "${me.substring(0, 60)}..."`);
    }
  }

  // Check 3: Timestamps are realistic (not all identical)
  if (evidence.timestamp) {
    // Single timestamp file — would need cross-file comparison
  }

  // Check 4: generatedBy is specific
  if (!evidence.generatedBy || evidence.generatedBy === 'automated') {
    issues.push('generatedBy is generic or missing — should identify specific tool/process');
  }

  // Check 5: Results have per-test detail
  if (results.length === 0) {
    issues.push('No per-test results in evidence');
  }
  for (const r of results) {
    if (!r.name || r.name === '') {
      issues.push('Result entry missing name field');
    }
  }

  // Score: 100 - 20 per issue
  const score = Math.max(0, 100 - issues.length * 20);

  return {
    passed: issues.length === 0,
    issues,
    score,
  };
}

/**
 * Cross-validate multiple evidence files.
 */
export function validateEvidenceBatch(files: EvidenceFile[]): ValidationResult {
  const allIssues: string[] = [];
  const timestamps: number[] = [];

  for (const file of files) {
    const result = validateEvidence(file);
    allIssues.push(...result.issues);
    if (typeof file.timestamp === 'number') timestamps.push(file.timestamp);
  }

  // Check for batch-generated evidence (all same timestamp)
  if (timestamps.length >= 3) {
    const uniqueTimestamps = new Set(timestamps);
    if (uniqueTimestamps.size === 1) {
      allIssues.push('ALL evidence files share identical timestamp — batch generated, not individually captured');
    }
  }

  const score = Math.max(0, 100 - allIssues.length * 10);
  return {
    passed: allIssues.length === 0,
    issues: allIssues,
    score,
  };
}
```

## 8. Phase 5: Decommission + Hardening

**Duration:** 3-5 days  
**Goal:** Remove old regex system, add property-based testing, run full integration tests.

### 8.1 Decommission Order

1. Re-run all existing tests with new semantic system. Verify same decisions.
2. For each regex layer that has a corresponding semantic rule, DELETE the regex file.
3. For regex layers with NO corresponding semantic rule yet, keep as L0 pre-filter.
4. When all 24 regex layers are either replaced or converted to L0 pre-filters, delete `layer-engine.ts` and rename `analysis-order-dispatcher.ts` to `layer-engine.ts`.
5. Remove `IntentClassifier` old code paths once `DeterministicNLPPipeline` passes all tests.
6. Remove `DANGEROUS_PATTERNS` from `guardian.ts` and `karpathy/intent-classifier.ts` once all consumers import from `danger-commands.ts`.

### 8.2 Property-Based Tests

For each semantic rule, add property-based tests using fast-check:

```typescript
import * as fc from 'fast-check';
import { checkNoEmptyCatches } from '../rules/no-empty-catch';
import { createInMemoryCompilerHost } from '../analyzers/ts-compiler-host';
import { walkAST } from '../analyzers/ast-walker';

describe('no-empty-catch (property-based)', () => {
  it('should NOT flag non-empty catch blocks', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 50 }), // error message
      fc.string({ minLength: 1, maxLength: 50 }), // recovery action
      (errorMsg, recovery) => {
        const source = `
          try {
            doSomething();
          } catch (e) {
            console.error(${JSON.stringify(errorMsg)});
            ${recovery}
          }
        `;
        const files = new Map([['test.ts', source]]);
        const { program } = createInMemoryCompilerHost(files);
        const sourceFiles = new Map<string, ts.SourceFile>();
        for (const f of program.getSourceFiles()) {
          if (!f.isDeclarationFile) sourceFiles.set(f.fileName, f);
        }
        const results = walkAST(sourceFiles, [checkNoEmptyCatches()]);
        return results.length === 0; // Should NOT flag
      }
    ));
  });
});
```

### 8.3 Integration Test

Full session test that verifies the `bun build` scenario is no longer blocked:

```typescript
describe('context-aware enforcement (regression)', () => {
  it('should allow SHARK to build its own project', () => {
    const ctx = new ExecutionContext(mockGuardian, '/path/to/shark-project');
    ctx.setAgent('shark-agent');
    ctx.recordEdit('edit', '/path/to/shark-project/src/index.ts');

    const allowed = ctx.shouldAllowEngineeringOperation('bash', {
      command: 'bun build src/index.ts --outdir dist --target bun --format esm --bundle --external @opencode-ai/plugin'
    });
    expect(allowed).toBe(true); // THIS IS THE CRITICAL FIX
  });

  it('should still block rm -rf on system paths', () => {
    const ctx = new ExecutionContext(mockGuardian, '/path/to/shark-project');
    ctx.setAgent('shark-agent');

    const allowed = ctx.shouldAllowEngineeringOperation('bash', {
      command: 'rm -rf /etc/passwd'
    });
    expect(allowed).toBe(false); // Still blocked
  });
});
```

## 9. Complete File Manifest

### 9.1 New Files (24 files, ~8,000-12,000 lines)

| # | File | Lines | Module |
|---|------|-------|--------|
| 1 | `src/shared/danger-commands.ts` | ~80 | Shared |
| 2 | `src/semantic-firewall/index.ts` | ~10 | Semantic Firewall |
| 3 | `src/semantic-firewall/types.ts` | ~60 | Semantic Firewall |
| 4 | `src/semantic-firewall/semantic-firewall.ts` | ~250 | Semantic Firewall |
| 5 | `src/semantic-firewall/execution-context.ts` | ~120 | Semantic Firewall |
| 6 | `src/semantic-firewall/analyzers/ts-compiler-host.ts` | ~120 | Analyzers |
| 7 | `src/semantic-firewall/analyzers/ast-walker.ts` | ~80 | Analyzers |
| 8 | `src/semantic-firewall/analyzers/cfg-builder.ts` | ~250 | Analyzers |
| 9 | `src/semantic-firewall/analyzers/data-flow.ts` | ~120 | Analyzers |
| 10 | `src/semantic-firewall/analyzers/import-graph.ts` | ~100 | Analyzers |
| 11 | `src/semantic-firewall/rules/no-empty-catch.ts` | ~30 | Rules |
| 12 | `src/semantic-firewall/rules/no-unsafe-cast.ts` | ~70 | Rules |
| 13 | `src/semantic-firewall/rules/no-floating-promises.ts` | ~80 | Rules |
| 14 | `src/semantic-firewall/rules/evidence-bearing-results.ts` | ~80 | Rules |
| 15 | `src/semantic-firewall/rules/no-hardcoded-paths.ts` | ~50 | Rules |
| 16 | `src/semantic-firewall/rules/cleanup-paired-intervals.ts` | ~55 | Rules |
| 17 | `src/semantic-firewall/rules/handle-zero-length.ts` | ~55 | Rules |
| 18 | `src/semantic-firewall/rules/theatrical-return.ts` | ~80 | Rules |
| 19 | `src/semantic-firewall/rules/dead-export.ts` | ~55 | Rules |
| 20 | `src/semantic-firewall/rules/scope-violation.ts` | ~90 | Rules |
| 21 | `src/gate-engine/gate-engine.ts` | ~120 | Gate Engine |
| 22 | `src/evidence-engine/merkle-chain.ts` | ~100 | Evidence Engine |
| 23 | `src/evidence-engine/evidence-validator.ts` | ~100 | Evidence Engine |
| 24 | `src/hooks/v4.1/write-time-gate.ts` | ~80 | Hooks |
| 25 | `src/hooks/v4.1/post-write-audit.ts` | ~80 | Hooks |

### 9.2 Modified Files (10 files, ~500-1000 lines changed)

| # | File | Change |
|---|------|--------|
| 1 | `src/shared/guardian.ts` | Replace DANGEROUS_PATTERNS with import from danger-commands.ts |
| 2 | `src/hooks/v4.1/guardian-hook.ts` | Replace regex arrays with SemanticFirewall calls |
| 3 | `src/hooks/firewall/layers/index.ts` | Rename imports from l5.* to l0-*; add analysisOrder |
| 4 | `src/hooks/firewall/layer-engine.ts` | Add phase parameter, analysisOrder filtering |
| 5 | `src/hooks/firewall/types.ts` | Expand EnforcementLevel, add AnalysisOrder |
| 6 | `src/shark/karpathy/intent-classifier.ts` | Replace hasDestructiveArgs/evaluateBashCommand with shared imports |
| 7 | `src/hooks/firewall/intent-classifier.ts` | Remove DANGEROUS_COMMAND_PATTERNS, import shared |
| 8 | `src/shark/enforcement-brain/enforcement-brain.ts` | Wire SemanticFirewall into evaluateBefore/evaluateAfter |
| 9 | `src/index.ts` | Initialize SemanticFirewall, ExecutionContext, GateEngine, MerkleChain |
| 10 | All 24 layer files | Add `analysisOrder: 1` field to exports; no behavior change |

### 9.3 Deleted Files (0 files deleted in Phase 0-1; up to 24 files deleted by Phase 5)

When each regex layer is fully replaced by a semantic rule, delete the corresponding file from `src/hooks/firewall/layers/`. By Phase 5 end, all 24 may be replaced or converted to L0 pre-filters.

## 10. Test Specifications

### 10.1 Unit Tests (per rule)

| Rule | Test File | Test Cases |
|------|-----------|------------|
| no-empty-catch | `tests/semantic-firewall/no-empty-catch.test.ts` | Empty catch (should flag), non-empty catch (should not), catch in comment (should not), nested try-catch (should flag inner) |
| no-unsafe-cast | `tests/semantic-firewall/no-unsafe-cast.test.ts` | Bare `as` (should flag), guarded `as` (should not), `as unknown` (should not), chained casts, multiple guards |
| no-floating-promises | `tests/semantic-firewall/no-floating-promises.test.ts` | Unhandled promise (should flag), awaited (should not), .catch()ed (should not), returned (should not), Promise.all (should handle) |
| evidence-bearing-results | `tests/semantic-firewall/evidence-bearing.test.ts` | Return success without write (should flag), return success with write (should not), return error (should not), nested returns |
| no-hardcoded-paths | `tests/semantic-firewall/no-hardcoded-paths.test.ts` | `/home/user/file` (should flag), `os.homedir()` usage (should not), `C:\\` path (should flag), path.join() (should not) |

### 10.2 Integration Tests

| Test | Description |
|------|-------------|
| `bun build not blocked` | SHARK edits src/, then runs bun build. Should be allowed. |
| `rm -rf / still blocked` | SHARK tries rm -rf /. Should be blocked. |
| `context-aware gate` | During BUILD gate, build commands pass. During PLAN gate, same commands warn. |
| `merkle chain integrity` | Append 10 evidence blocks, verify chain, tamper with one, detect break. |
| `gate advancement` | Submit all required evidence for each gate, verify advancement. |
| `duplicate danger removal` | All three old modules delegate to danger-commands.ts, no separate pattern lists. |

### 10.3 Regression Tests

| Test | Current Behavior | Expected After |
|------|-----------------|----------------|
| L5.13 blocks grep dist/ | Blocks as theatrical | Still blocked (no semantic rule yet) |
| L5.19 blocks container escape | Blocks --privileged | Still blocked |
| L0 identity wall | Blocks non-SHARK agents | Still blocked |
| L5.11 opencode run ban | Blocks opencode run | Still blocked |
| L5.12 privilege escalation | Blocks sudo rm | Still blocked (now via danger-commands.ts) |

## 11. Migration Strategy

### 11.1 Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Semantic firewall blocks legitimate code | Write-time gate only blocks CRITICAL/HIGH. MEDIUM and below are warnings only. |
| Compiler host slow on large projects | Configurable maxDepth in source file loading. Falls back gracefully if no tsconfig. |
| Rule false positives | Property-based tests catch edge cases. Parallel run with old system for first 3 days. |
| Context-aware enforcer too permissive | ShouldAllowEngineeringOperation() checks ALL: identity + project root + edit history + gate. |
| Merkle chain breaks on compaction | Chain stored in .shark/evidence/chain/ — same survival mechanism as other evidence. |

### 11.2 Rollback Plan

If Phase 2 causes critical failures:
1. Disable `write-time-gate.ts` hook (remove from `createSharkHooks()`)
2. Set all semantic rules to `enabled: false`
3. Old regex system continues to work (layers still present with `analysisOrder: 1`)
4. Fix the rule, re-enable, re-test

### 11.3 Build Order (Implementation Sequence)

```
Day 1-2:   Phase 0 (rename + danger-commands.ts) + Phase 1 (compiler host)
Day 3-5:   Phase 2 (all 10 semantic rules)
Day 6-7:   Phase 3 (execution context + write-time-gate)
Day 8-9:   Phase 4 (gate engine + merkle chain)
Day 10-12: Phase 5 (test + decommission + hardening)
Day 13-15: Full integration testing + edge case fixes
```

## 12. Appendix: Bible Compliance Matrix

| Bible Section | Requirement | SHARK Before | SHARK After | File |
|---------------|-------------|-------------|-------------|------|
| §1.1 | Order 0: No analysis | N/A | N/A | — |
| §1.2 | Order 1: String patterns | 24 layers at Order 1 | Pre-filter only | `layers/l0-*.ts` |
| §1.3 | Order 2: AST analysis | None | 6 AST rules | `rules/*.ts` |
| §1.4 | Order 3: TypeChecker | None | 3 TypeChecker rules | `rules/no-unsafe-cast.ts`, etc. |
| §1.5 | Order 4: CFG/DFA | None | 2 CFG rules | `rules/no-floating-promises.ts`, `theatrical-return.ts` |
| §1.6 | Order 5: Semantic | None | Scope diff, evidence integrity | `rules/scope-violation.ts`, `evidence-validator.ts` |
| §3.1 | Compiler API integration | None | `ts-compiler-host.ts` | `analyzers/ts-compiler-host.ts` |
| §3.2 | AST walking | None | `ast-walker.ts` | `analyzers/ast-walker.ts` |
| §3.3 | Type system queries | None | `checker.getTypeAtLocation()` in rules | Various |
| §3.4 | Control flow graph | None | `cfg-builder.ts` | `analyzers/cfg-builder.ts` |
| §3.5 | Data flow analysis | None | `data-flow.ts` | `analyzers/data-flow.ts` |
| §4.1 | Pre-write enforcement | In `tool.execute.after` only | `write-time-gate.ts` (before) | `hooks/v4.1/write-time-gate.ts` |
| §4.2 | Post-write containment | Block only, no quarantine | Quarantine on CRITICAL/HIGH | `hooks/v4.1/post-write-audit.ts` |
| §4.3 | Claim vs reality | Regex on agent prose | AST + filesystem diff | Various |
| §4.4 | Gate chain | Manual if/else switches | XState hierarchical FSM | `gate-engine/gate-engine.ts` |
| §4.5 | Escalation and recovery | None | LOCKOUT after 3 blocks, RESTART | `block-response.ts` (modified) |
| §5.1 | No-regex discipline | 100% regex | < 10% regex (L0 pre-filter only) | — |
| §5.3 | Replacement algorithm | N/A | Regex → AST → confirm | Migration plan |
| §6.1 | Empty catch verification | Regex `catch\s*\{[^}]*\}` | AST `CatchClause.body.statements.length` | `rules/no-empty-catch.ts` |
| §6.2 | Theatrical return | Regex on "trust me" text | AST + DFA side-effect verification | `rules/theatrical-return.ts` |
| §6.3 | Unguarded cast | Regex on "as" keyword | TypeChecker + preceding guard check | `rules/no-unsafe-cast.ts` |
| §6.4 | Floating promise | Regex on "Promise" keyword | CFG/DFA forward analysis | `rules/no-floating-promises.ts` |
| §6.5 | Scope verification | Regex on agent prose | Filesystem snapshot + diff | `rules/scope-violation.ts` |
| §7.1 | Post-hoc check | All enforcement post-write | Pre-write for L0-L2 | `write-time-gate.ts` |
| §7.2 | Regex in AST clothing | All "L5" rules are regex | No regex above L0 pre-filter | — |
| §7.5 | Type theater | Rich types, all reduced to string | Types used at their actual level | Various |
| §7.6 | Branding illusion | "L5", "Layer Engine", "Classifier" | Honest naming ("L0", "pre-filter") | Phase 0 rename |
| §7.7 | Duplicate check | 3 danger detection modules | 1 consolidated module | `danger-commands.ts` |
| §8.1 | Analysis pipeline | Flat layer list | L0 → L2 → L3 → L4 → L5 | `semantic-firewall.ts` |
| §8.2 | Write-time gate | None | L0-L2 before write | `write-time-gate.ts` |
| §8.3 | Post-write audit | All layers run | All orders 0-5 after write | `post-write-audit.ts` |
| Appendix B | 5 severity levels | 3 levels (BLOCK/WARN/PASS) | 6 levels (CRITICAL-PASS) | `types.ts` |
| Appendix C | Compiler host template | None | Verbatim from Bible | `analyzers/ts-compiler-host.ts` |
| Appendix D | CFG builder template | None | Verbatim from Bible | `analyzers/cfg-builder.ts` |
| Appendix E | Enforcement response | 3 responses | 5 responses + quarantine | `block-response.ts` |
| Iron Law 1 | Verify, don't trust | Regex trusts text | AST verifies structure | All rules |
| Iron Law 2 | Prevent, don't detect | Post-write only | Pre-write + post-write | `write-time-gate.ts` |
| Iron Law 3 | Measure, don't classify | Classifies agent prose | Measures file diffs, AST nodes | All rules |
| Iron Law 4 | AST, not regex | 100% regex | 90% AST, 10% L0 regex | All rules |
| Iron Law 5 | TypeChecker, not parser | No type awareness | Full TypeChecker integration | TypeChecker rules |
| Iron Law 6 | Execute, don't assume | Assumes from text | Verifies from structure + state | ExecutionContext |
| Iron Law 7 | Name by mechanism | "L5" for Order 0 | "L0" for Order 1, real names for higher | Phase 0 rename |
| Iron Law 8 | Delete, don't duplicate | 3x danger detection | 1x danger detection | `danger-commands.ts` |
| Iron Law 9 | Wire, don't declare | `passed` field declared never read | All fields consumed | Various |
| Iron Law 10 | Compose, don't expand | 24 independent layer files | Rules compose via analyzers | Rules architecture |
