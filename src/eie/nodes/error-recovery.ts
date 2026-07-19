/**
 * src/eie/nodes/error-recovery.ts — 80 Error Recovery Nodes
 *
 * Common TypeScript/build errors with fix patterns. Each node maps
 * an error code or pattern to its cause, detection method, and
 * remediation code template.
 *
 * Source: TypeScript compiler errors + build failures + runtime errors
 */

import type { KnowledgeNode, Severity, AuditLayer } from '../types';

// Helper for concise node creation
type ER = KnowledgeNode;

function erNode(
  id: string, tsCode: string | null, rule: string, fix: string, bullet: string, links: string[],
  severityOverride?: Severity, layerOverride?: AuditLayer,
): ER {
  return {
    id, source: 'ts-deep', sourceFile: 'TypeScript Error Catalog',
    category: 'error-recovery',
    rule,
    detectionMethod: `Compiler error ${tsCode ?? 'RUNTIME'}: ${rule.split('\n')[0]}`,
    fixTemplate: fix,
    conditions: tsCode
      ? [{ field: 'errorPattern', op: 'matches', value: tsCode }]
      : [{ field: 'errorPattern', op: 'matches', value: 'runtime' }],
    bulletTemplate: bullet,
    warheadTemplate: `# Error ${tsCode ?? 'RUNTIME'}\n${rule}\n## Fix\n${fix}`,
    evidenceSpec: { id: 'error-fixed', verify: 'exec-tsc', minQuality: 0.90 },
    severity: severityOverride ?? (tsCode ? 'warn' : 'block'),
    layer: layerOverride ?? (tsCode ? 1 : 4),
    links,
    selfVerified: true,
  };
}

// ══ TS2xxx: TYPE ERRORS (20 nodes) ═════════════════════════════

export const ERR_TS2322: ER = erNode('ERR-TS2322', 'TS2322',
  'TS2322 TYPE MISMATCH: Type X is not assignable to type Y.\nCause: Variable assigned a value of incompatible type.',
  'Fix the type: either change the assignment, add a type guard, or fix the declared type.\n// BEFORE: const x: string = 42;\n// AFTER: const x: number = 42; OR const x: string = String(42);',
  'TS2322: Type mismatch. Fix assignment or add type guard.',
  ['P2-TYPE-CERTAINTY', 'TS-CHECKER-ASSIGNABLE'],
);

export const ERR_TS2304: ER = erNode('ERR-TS2304', 'TS2304',
  'TS2304 CANNOT FIND NAME: Name X is not defined.\nCause: Missing import, typo, or used before declaration.',
  'Add import or fix the name:\n// BEFORE: processData(data); // processData not imported\n// AFTER: import { processData } from "./utils.js"; processData(data);',
  'TS2304: Cannot find name. Add import or fix typo.',
  ['P1-DEFENSIVE-IMPORT'],
);

export const ERR_TS2339: ER = erNode('ERR-TS2339', 'TS2339',
  'TS2339 PROPERTY DOES NOT EXIST: Property X does not exist on type Y.\nCause: Accessing non-existent property, wrong type, or missing interface.',
  'Fix the type or add the property:\n// BEFORE: obj.nonExistentProp\n// AFTER: (obj as CorrectType).prop OR update interface to include prop',
  'TS2339: Property does not exist. Fix type or add to interface.',
  ['P2-TYPE-CERTAINTY', 'FM-19-NULL-DEREF'],
);

export const ERR_TS2559: ER = erNode('ERR-TS2559', 'TS2559',
  'TS2559 NO OVERLOAD MATCHES: No overload matches this call.\nCause: Wrong number of arguments or wrong argument types.',
  'Check the function signature. Pass correct arguments:\n// Read the error message for expected vs actual types.',
  'TS2559: No overload matches. Check argument types and count.',
  [],
);

export const ERR_TS2307: ER = erNode('ERR-TS2307', 'TS2307',
  'TS2307 CANNOT FIND MODULE: Cannot find module X or its type declarations.\nCause: Missing dependency, wrong import path, or missing .d.ts file.',
  'Install package or fix path:\n// npm install <package> OR fix import path\nimport { x } from "./correct-path.js"; // note .js extension for ESM',
  'TS2307: Cannot find module. Install package or fix import path.',
  ['P1-DEFENSIVE-IMPORT', 'P6-DEPENDENCY-CHECK'],
);

export const ERR_TS2345: ER = erNode('ERR-TS2345', 'TS2345',
  'TS2345 ARGUMENT TYPE MISMATCH: Argument of type X is not assignable to parameter of type Y.\nCause: Passing wrong type to function parameter.',
  'Fix the argument type or add a guard:\n// BEFORE: fn(wrongType);\n// AFTER: fn(correctType); OR fn(transform(wrongType));',
  'TS2345: Argument type mismatch. Fix argument or add transform.',
  ['P2-TYPE-CERTAINTY'],
);

export const ERR_TS2531: ER = erNode('ERR-TS2531', 'TS2531',
  'TS2531 OBJECT POSSIBLY NULL: Object is possibly null.\nCause: Variable typed as T | null accessed without null check.',
  'Add null check or optional chaining:\n// BEFORE: obj.property\n// AFTER: obj?.property OR if (obj !== null) obj.property',
  'TS2531: Object possibly null. Use ?. or add null check.',
  ['FM-19-NULL-DEREF'],
);

export const ERR_TS2532: ER = erNode('ERR-TS2532', 'TS2532',
  'TS2532 OBJECT POSSIBLY UNDEFINED: Object is possibly undefined.\nCause: Variable typed as T | undefined accessed without check.',
  'Add undefined check or optional chaining:\n// BEFORE: obj.property\n// AFTER: obj?.property OR if (obj) obj.property',
  'TS2532: Object possibly undefined. Use ?. or add check.',
  ['FM-19-NULL-DEREF'],
);

export const ERR_TS2588: ER = erNode('ERR-TS2588', 'TS2588',
  'TS2588 CANNOT ASSIGN: Type X is not assignable to type Y because...\nCause: Complex type incompatibility (union, intersection, conditional types).',
  'Read the full error. Simplify the type or add intermediate typing:\n// const intermediate: ExpectedType = transform(value);',
  'TS2588: Type assignment error. Read full message, simplify types.',
  ['TS-CHECKER-ASSIGNABLE'],
);

export const ERR_TS2769: ER = erNode('ERR-TS2769', 'TS2769',
  'TS2769 NO OVERLOAD MATCHES: No overload matches this call (with detailed expected types).\nCause: Arguments don\'t match any function overload.',
  'Check all overloads. Pass arguments matching one specific overload signature.',
  'TS2769: No overload matches. Check overloads and match one.',
  ['ERR-TS2559'],
);

export const ERR_TS18046: ER = erNode('ERR-TS18046', 'TS18046',
  'TS18046 X IS OF TYPE: Variable is of type unknown or any.\nCause: Using a variable typed as unknown/any without narrowing.',
  'Add type narrowing:\n// BEFORE: function fn(x: unknown) { return x.length; }\n// AFTER: function fn(x: unknown) { if (typeof x === "string") return x.length; throw new TypeError(); }',
  'TS18046: Variable is unknown type. Add type narrowing.',
  ['P2-TYPE-CERTAINTY', 'TS-SF-NO-ANY'],
);

export const ERR_TS18048: ER = erNode('ERR-TS18048', 'TS18048',
  'TS18048 POSSIBLY UNDEFINED CHAIN: X is possibly undefined in a chain.\nCause: Optional chaining reveals a possibly-undefined intermediate.',
  'Add null check or use ?? for default:\n// BEFORE: obj?.prop.subProp\n// AFTER: obj?.prop?.subProp ?? defaultValue',
  'TS18048: Possibly undefined in chain. Add ?. or default.',
  ['FM-19-NULL-DEREF'],
);

export const ERR_TS2349: ER = erNode('ERR-TS2349', 'TS2349',
  'TS2349 NOT A FUNCTION: X is not a function (or has no call signatures).\nCause: Calling a non-function value or importing wrong export.',
  'Verify the value is callable:\n// BEFORE: data.process() // data.process is not a function\n// AFTER: Check typeof data.process === "function" before calling',
  'TS2349: Not a function. Verify export exists and is callable.',
  ['P1-DEFENSIVE-IMPORT', 'FM-01-LOAD-TIME-CRASH'],
);

export const ERR_TS2351: ER = erNode('ERR-TS2351', 'TS2351',
  'TS2351 NOT A CONSTRUCTOR: Cannot use new with expression of type X.\nCause: Using new on a non-class or non-constructor.',
  'Verify the value is constructable:\n// BEFORE: const x = new someValue();\n// AFTER: Verify typeof someValue === "function" and it\'s a class',
  'TS2351: Not a constructor. Verify it\'s a class.',
  [],
);

export const ERR_TS2454: ER = erNode('ERR-TS2454', 'TS2454',
  'TS2454 NOT ALL CODE PATHS RETURN: Function lacks return at end.\nCause: Function declared with return type but has a code path without return.',
  'Add return to all paths:\n// BEFORE: function fn(): string { if (x) return "a"; }\n// AFTER: function fn(): string { if (x) return "a"; return "b"; }',
  'TS2454: Not all paths return. Add return to every path.',
  ['P10-OUTPUT-CONTRACT', 'IL02-CONTRACT-HONORED'],
);

export const ERR_TS2324: ER = erNode('ERR-TS2324', 'TS2324',
  'TS2324 TYPE NOT ASSIGNABLE: Type X is not assignable to type Y (empty type).\nCause: Assigning to never or empty type.',
  'Fix the type definition or assignment target.',
  'TS2324: Type not assignable. Fix type definition.',
  [],
);

export const ERR_TS2314: ER = erNode('ERR-TS2314', 'TS2314',
  'TS2314 GENERIC TYPE ARGUMENTS: Generic type X requires Y type arguments.\nCause: Using generic type without type arguments.',
  'Add type arguments:\n// BEFORE: const x: Map = new Map();\n// AFTER: const x: Map<string, number> = new Map();',
  'TS2314: Missing type arguments. Add generic parameters.',
  ['TS-GENERIC-CONSTRAINTS'],
);

export const ERR_TS2416: ER = erNode('ERR-TS2416', 'TS2416',
  'TS2416 INTERFACE INCORRECTLY IMPLEMENTS: Type X does not correctly implement interface Y.\nCause: Missing properties or methods from interface.',
  'Implement all interface members:\n// Add all missing properties and methods from the interface.',
  'TS2416: Interface not correctly implemented. Add missing members.',
  ['IL02-CONTRACT-HONORED'],
);

export const ERR_TS2554: ER = erNode('ERR-TS2554', 'TS2554',
  'TS2554 WRONG NUMBER OF ARGUMENTS: Expected X arguments but got Y.\nCause: Calling function with wrong argument count.',
  'Fix argument count:\n// Read error for expected vs actual count.',
  'TS2554: Wrong argument count. Check function signature.',
  [],
);

export const ERR_TS2533: ER = erNode('ERR-TS2533', 'TS2533',
  'TS2533 POSSIBLY NULL/UNDEFINED: Object is possibly null or undefined.\nCause: Accessing member on nullable object.',
  'Add null/undefined check:\n// if (obj !== null && obj !== undefined) obj.method();',
  'TS2533: Object possibly null/undefined. Add check.',
  ['FM-19-NULL-DEREF'],
);

// ══ BUILD FAILURES (10 nodes) ══════════════════════════════════

export const ERR_BUILD_MISSING_MODULE: ER = erNode('ERR-BUILD-MISSING-MODULE', null,
  'BUILD FAILURE — MISSING MODULE: Cannot resolve module X.\nCause: Module not installed or wrong path.',
  'bun install <package> OR fix import path. Verify package exists in node_modules.',
  'BUILD: Cannot resolve module. Install package or fix path.',
  ['ERR-TS2307', 'P1-DEFENSIVE-IMPORT'],
);

export const ERR_BUILD_CIRCULAR_DEP: ER = erNode('ERR-BUILD-CIRCULAR-DEP', null,
  'BUILD FAILURE — CIRCULAR DEPENDENCY: Module A imports B which imports A.\nCause: Circular import chain.',
  'Break the cycle by extracting shared code into a separate module. Use lazy imports or interfaces.',
  'BUILD: Circular dependency detected. Break the cycle.',
  ['SEC-SUPPLY-CYCLES'],
);

export const ERR_BUILD_SYNTAX_ERROR: ER = erNode('ERR-BUILD-SYNTAX-ERROR', null,
  'BUILD FAILURE — SYNTAX ERROR: Unexpected token, missing bracket, etc.\nCause: Malformed code.',
  'Fix the syntax error at the reported line and column.',
  'BUILD: Syntax error at {line}:{col}. Fix syntax.',
  [],
);

export const ERR_BUILD_EXPORT_MISSING: ER = erNode('ERR-BUILD-EXPORT-MISSING', null,
  'BUILD FAILURE — EXPORT MISSING: Module does not export X.\nCause: Named import doesn\'t match any export.',
  'Fix the import name or add the export:\n// Check the source module for correct export name.',
  'BUILD: Export not found. Fix import name or add export.',
  ['P1-DEFENSIVE-IMPORT', 'ERR-TS2304'],
);

export const ERR_BUILD_TYPE_ERROR: ER = erNode('ERR-BUILD-TYPE-ERROR', null,
  'BUILD FAILURE — TYPE ERROR: TypeScript type checking failed.\nCause: Type mismatch in source code.',
  'Run tsc --noEmit to see all errors. Fix each one. Then rebuild.',
  'BUILD: Type error. Run tsc --noEmit and fix all errors.',
  ['ERR-TS2322', 'GK-VERIFY-TSC'],
);

export const ERR_BUILD_DUPLICATE_DECL: ER = erNode('ERR-BUILD-DUPLICATE-DECL', null,
  'BUILD FAILURE — DUPLICATE DECLARATION: Identifier X already declared.\nCause: Two declarations with the same name in the same scope.',
  'Rename one of the declarations or merge them.',
  'BUILD: Duplicate declaration. Rename or merge.',
  [],
);

export const ERR_BUILD_IMPORT_TYPE: ER = erNode('ERR-BUILD-IMPORT-TYPE', null,
  'BUILD FAILURE — IMPORT TYPE: Cannot import type X as value or vice versa.\nCause: Mixing type-only imports with value imports.',
  'Use import type for type-only imports:\n// import type { MyType } from "./types.js";',
  'BUILD: Import type mismatch. Use import type for types.',
  [],
);

export const ERR_BUILD_NO_ENTRY: ER = erNode('ERR-BUILD-NO-ENTRY', null,
  'BUILD FAILURE — NO ENTRY POINT: Entry file does not exist.\nCause: Wrong entry path or file not created.',
  'Verify entry file exists. Create it if needed.\n// Check: fs.existsSync("src/index.ts")',
  'BUILD: Entry file missing. Verify path and create file.',
  ['IL09-WIRE-DONT-DECLARE'],
);

export const ERR_BUILD_CONFIG: ER = erNode('ERR-BUILD-CONFIG', null,
  'BUILD FAILURE — CONFIG ERROR: tsconfig.json or build config is invalid.\nCause: Malformed JSON, invalid compiler options.',
  'Validate tsconfig.json syntax. Check compiler options against schema.',
  'BUILD: Config error. Validate tsconfig.json.',
  ['P8-CONFIG-VALIDATION'],
);

export const ERR_BUILD_PERMISSION: ER = erNode('ERR-BUILD-PERMISSION', null,
  'BUILD FAILURE — PERMISSION DENIED: Cannot write to output directory.\nCause: Insufficient filesystem permissions.',
  'Check directory permissions. chmod or run with correct user.',
  'BUILD: Permission denied. Fix directory permissions.',
  [],
);

// ══ RUNTIME ERRORS (10 nodes) ══════════════════════════════════

export const ERR_RT_UNDEFINED_FN: ER = erNode('ERR-RT-UNDEFINED-FN', null,
  'RUNTIME ERROR — UNDEFINED IS NOT A FUNCTION: Calling a value that is undefined.\nCause: Missing export, wrong import, or property access on undefined.',
  'Add typeof check before calling:\n// if (typeof fn !== "function") throw new Error("missing"); fn();',
  'RT: undefined is not a function. Add typeof guard.',
  ['P1-DEFENSIVE-IMPORT', 'FM-01-LOAD-TIME-CRASH'],
);

export const ERR_RT_CANNOT_READ: ER = erNode('ERR-RT-CANNOT-READ', null,
  'RUNTIME ERROR — CANNOT READ PROPERTY: Accessing property on null/undefined.\nCause: Null dereference without optional chaining.',
  'Use optional chaining or null check:\n// obj?.prop OR if (obj !== null) obj.prop',
  'RT: Cannot read property. Use ?. or null check.',
  ['FM-19-NULL-DEREF'],
);

export const ERR_RT_MAX_CALL_STACK: ER = erNode('ERR-RT-MAX-CALL-STACK', null,
  'RUNTIME ERROR — MAXIMUM CALL STACK: Infinite recursion detected.\nCause: Recursive function without base case or mutual recursion.',
  'Add base case. Add max depth safety:\n// function rec(n, depth = 0) { if (depth > 1000) throw new Error("max depth"); ... }',
  'RT: Maximum call stack exceeded. Add base case to recursion.',
  ['FM-17-INFINITE-LOOP'],
);

export const ERR_RT_HEAP_OOM: ER = erNode('ERR-RT-HEAP-OOM', null,
  'RUNTIME ERROR — HEAP OUT OF MEMORY: JavaScript heap out of memory.\nCause: Memory leak, unbounded array growth, or processing too much data.',
  'Fix memory leak. Use streaming instead of buffering. Increase --max-old-space-size if legitimate.',
  'RT: Heap OOM. Fix memory leak or use streaming.',
  ['FM-18-ZOMBIE-TIMER', 'CONC-RESOURCE-BUDGET'],
);

export const ERR_RT_UNHANDLED_REJECTION: ER = erNode('ERR-RT-UNHANDLED-REJECTION', null,
  'RUNTIME ERROR — UNHANDLED PROMISE REJECTION: Promise rejected with no handler.\nCause: Floating promise without .catch().',
  'Add error handler:\n// try { await fn(); } catch (e) { logger.error(e); }',
  'RT: Unhandled rejection. Add try/catch or .catch().',
  ['P9-ASYNC-DISCIPLINE', 'FM-05-UNHANDLED-REJECTION'],
);

export const ERR_RT_ENOENT: ER = erNode('ERR-RT-ENOENT', null,
  'RUNTIME ERROR — ENOENT: No such file or directory.\nCause: File doesn\'t exist at the path, or hardcoded path is wrong.',
  'Verify path exists. Use dynamic path resolution:\n// path.join(__dirname, "file.json")',
  'RT: ENOENT. File not found. Verify path exists.',
  ['P7-PATH-RESOLUTION', 'FM-07-ENV-DEPENDENCY'],
);

export const ERR_RT_EACCES: ER = erNode('ERR-RT-EACCES', null,
  'RUNTIME ERROR — EACCES: Permission denied.\nCause: Insufficient permissions for file/directory operation.',
  'Check permissions. Run with correct user. Fix ownership.',
  'RT: EACCES. Permission denied. Fix permissions.',
  [],
);

export const ERR_RT_EADDRINUSE: ER = erNode('ERR-RT-EADDRINUSE', null,
  'RUNTIME ERROR — EADDRINUSE: Address already in use.\nCause: Port already occupied by another process.',
  'Use different port or kill existing process:\n// const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;',
  'RT: EADDRINUSE. Port in use. Use different port.',
  ['P8-CONFIG-VALIDATION'],
);

export const ERR_RT_INVALID_JSON: ER = erNode('ERR-RT-INVALID-JSON', null,
  'RUNTIME ERROR — INVALID JSON: Unexpected token in JSON.\nCause: Parsing invalid JSON string.',
  'Validate before parsing:\n// try { JSON.parse(str); } catch (e) { throw new Error("invalid JSON: " + e.message); }',
  'RT: Invalid JSON. Validate before parsing.',
  ['P3-ERROR-COMPLETENESS'],
);

export const ERR_RT_TIMEOUT: ER = erNode('ERR-RT-TIMEOUT', null,
  'RUNTIME ERROR — OPERATION TIMED OUT: Operation exceeded time limit.\nCause: Hanging operation, infinite loop, or slow network.',
  'Add timeout with AbortController:\n// const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 5000); await fetch(url, { signal: ctrl.signal });',
  'RT: Operation timeout. Add timeout with AbortController.',
  ['FM-17-INFINITE-LOOP', 'CONC-PROCESS-EXEC'],
);

// ══ ADDITIONAL TYPE ERRORS (10 nodes) ══════════════════════════

export const ERR_TS1361: ER = erNode('ERR-TS1361', 'TS1361',
  'TS1361 ASYNC CONSTRUCTOR: Cannot use async in constructor.\nCause: Constructors cannot be async.',
  'Use async factory pattern:\n// static async create(): Promise<T> { const obj = new T(); await obj.init(); return obj; }',
  'TS1361: Async constructor. Use async factory pattern.',
  ['TS-SF-NO-ASYNCEXT'],
);

export const ERR_TS2740: ER = erNode('ERR-TS2740', 'TS2740',
  'TS2740 MISSING PROPERTIES: Type X is missing properties of type Y.\nCause: Object literal missing required properties.',
  'Add all required properties to the object literal.',
  'TS2740: Missing properties. Add required fields.',
  [],
);

export const ERR_TS2741: ER = erNode('ERR-TS2741', 'TS2741',
  'TS2741 MISSING PROP IN TYPE: Property X is missing in type Y but required in type Z.\nCause: Object missing a required property.',
  'Add the missing property to the object.',
  'TS2741: Missing required property. Add it.',
  [],
);

export const ERR_TS2745: ER = erNode('ERR-TS2745', 'TS2745',
  'TS2745 JSX PROPS: Type X is not assignable to type Y (IntrinsicAttributes).\nCause: Wrong JSX props.',
  'Fix component props to match the interface.',
  'TS2745: JSX props mismatch. Fix component props.',
  [],
);

export const ERR_TS2820: ER = erNode('ERR-TS2820', 'TS2820',
  'TS2820 NOOP NEVER: Type X is not assignable to type never.\nCause: Array.filter with impossible type or exhaustive switch.',
  'Fix the filter predicate or add the missing case.',
  'TS2820: Assignment to never. Fix predicate or add case.',
  [],
);

export const ERR_TS6133: ER = erNode('ERR-TS6133', 'TS6133',
  'TS6133 DECLARED BUT NEVER USED: Variable X is declared but never used.\nCause: Unused variable, import, or parameter.',
  'Remove unused declaration or use it.\n// Delete: const unused = 42; // never used',
  'TS6133: Unused declaration. Remove or use it.',
  ['IL09-WIRE-DONT-DECLARE', 'FM-12-DEAD-CODE'],
);

export const ERR_TS6133_IMPORT: ER = erNode('ERR-TS6133-IMPORT', 'TS6133',
  'TS6133 UNUSED IMPORT: Import X is declared but never used.\nCause: Imported but never referenced.',
  'Remove the unused import.',
  'TS6133: Unused import. Remove it.',
  ['IL09-WIRE-DONT-DECLARE'],
);

export const ERR_TS7016: ER = erNode('ERR-TS7016', 'TS7016',
  'TS7016 AMBIENT MODULE: Could not find declaration file for module X.\nCause: Missing .d.ts file for JS module.',
  'Add declaration file or install @types package:\n// npm install @types/module-name OR create module.d.ts',
  'TS7016: Missing declaration file. Add .d.ts or @types.',
  ['P1-DEFENSIVE-IMPORT'],
);

export const ERR_TS7053: ER = erNode('ERR-TS7053', 'TS7053',
  'TS7053 DYNAMIC KEY: Element implicitly has any type because expression of type X can\'t be used to index type Y.\nCause: Dynamic property access without proper typing.',
  'Use Record type or add index signature:\n// const map: Record<string, number> = {}; map[key] = 1;',
  'TS7053: Dynamic key access. Use Record or index signature.',
  ['TS-SF-NO-ANY'],
);

export const ERR_TS2322_NULLABLE: ER = erNode('ERR-TS2322-NULLABLE', 'TS2322',
  'TS2322 NULLABLE MISMATCH: Type X | null is not assignable to type X.\nCause: Assigning nullable to non-nullable.',
  'Add null check or use non-null assertion:\n// const val: string = nullable ?? "default";',
  'TS2322: Nullable to non-nullable. Add null check or default.',
  ['FM-19-NULL-DEREF'],
);

// ══ BUN BUILD ERRORS (4 nodes) ══════════════════════════════════

export const ERR_BUN_IMPORT_CIRCULAR: ER = erNode('ERR-BUN-IMPORT-CIRCULAR', 'BUN-CIRCULAR-DEP',
  'BUN BUILD CIRCULAR DEPENDENCY: bun detects a circular import chain between modules.\nCause: Module A imports B which imports A, creating an unresolvable cycle.',
  'Break the cycle by extracting shared logic into a separate module, or use lazy/dynamic imports.\n// Move shared code to a third module that both import, breaking the A->B->A cycle.',
  'BUN: Circular dependency in build. Extract shared module or use lazy imports.',
  ['ERR-BUILD-CIRCULAR-DEP', 'SEC-SUPPLY-CYCLES'],
  'warn', 2,
);

export const ERR_BUN_EXPORT_MISSING: ER = erNode('ERR-BUN-EXPORT-MISSING', 'BUN-EXPORT-MISSING',
  'BUN BUILD MISSING EXPORT: Module does not export the requested symbol.\nCause: Named import references an export that does not exist in the source.',
  'Add the export to the source module or fix the import name.\n// export { missingSymbol } from "./source.ts";',
  'BUN: Missing export. Add the export to source or fix import name.',
  ['ERR-BUILD-EXPORT-MISSING', 'P1-DEFENSIVE-IMPORT'],
  'warn', 2,
);

export const ERR_BUN_NPM_COMPAT: ER = erNode('ERR-BUN-NPM-COMPAT', 'BUN-NPM-COMPAT',
  'BUN NPM COMPATIBILITY: Package relies on Node-specific APIs not available in Bun runtime.\nCause: Dependency assumes a Node-only API (e.g. node:crypto internals) incompatible with Bun.',
  'Use Bun-native alternatives or polyfill the missing API. Pin a compatible package version.\n// Replace Node-only API with Bun.hash() or import from "node:crypto" explicitly.',
  'BUN: npm compat issue. Use Bun-native alternatives or pin compatible version.',
  ['P6-DEPENDENCY-CHECK'],
  'warn', 2,
);

export const ERR_BUN_ESM_CJS: ER = erNode('ERR-BUN-ESM-CJS', 'BUN-ESM-CJS-INTEROP',
  'BUN ESM/CJS INTEROP: Mixing ES module and CommonJS imports causes interop failure.\nCause: require() of an ESM module, or import of CJS default export semantics mismatch.',
  'Use ESM consistently across the project. Replace require() with import and set "type": "module".\n// import { x } from "./mod.js"; instead of const { x } = require("./mod");',
  'BUN: ESM/CJS interop error. Use ESM consistently (import, .js extensions).',
  ['ERR-BUILD-IMPORT-TYPE'],
  'warn', 2,
);

// ══ NODE.JS PLATFORM ERRORS (4 nodes) ═══════════════════════════

export const ERR_NODE_ERR_UNKNOWN: ER = erNode('ERR-NODE-ERR-UNKNOWN', 'ERR_UNKNOWN_MODULE_FORMAT',
  'NODE ERR_UNKNOWN_MODULE_FORMAT: Unknown module format for file.\nCause: Node cannot determine whether a file is ESM or CJS (missing .mjs/.cjs or type field).',
  'Specify the module format explicitly. Add "type": "module" to package.json or use .mjs/.cjs extensions.\n// package.json: { "type": "module" } OR rename index.js -> index.mjs',
  'NODE: Unknown module format. Set "type":"module" or use .mjs extension.',
  ['ERR-BUN-ESM-CJS'],
  'warn', 2,
);

export const ERR_NODE_ERR_REQUIRE_ESM: ER = erNode('ERR-NODE-ERR-REQUIRE-ESM', 'ERR_REQUIRE_ESM',
  'NODE ERR_REQUIRE_ESM: require() of ES Module is not supported.\nCause: A require() call targets an ESM-only module.',
  'Convert to a dynamic import() which works with ESM.\n// const mod = await import("./esm-mod.js");',
  'NODE: ERR_REQUIRE_ESM. Use dynamic import() instead of require().',
  ['ERR-BUN-ESM-CJS', 'P9-ASYNC-DISCIPLINE'],
  'warn', 2,
);

export const ERR_NODE_ERR_UNHANDLED: ER = erNode('ERR-NODE-ERR-UNHANDLED', 'ERR_UNHANDLED_REJECTION',
  'NODE ERR_UNHANDLED_REJECTION: A promise rejected with no attached handler.\nCause: Floating promise (no .catch / no await in try/catch) caused an unhandled rejection.',
  'Always attach a handler. Await inside try/catch or chain .catch().\n// await fn(); // inside try/catch  OR  fn().catch(handleErr);',
  'NODE: Unhandled rejection. Add .catch() or wrap await in try/catch.',
  ['ERR-RT-UNHANDLED-REJECTION', 'P9-ASYNC-DISCIPLINE', 'FM-05-UNHANDLED-REJECTION'],
  'warn', 2,
);

export const ERR_NODE_ERR_UNCLOSED: ER = erNode('ERR-NODE-ERR-UNCLOSED', 'ERR_UNCLOSED_RESOURCE',
  'NODE ERR_UNCLOSED_RESOURCE (warning): A resource was not closed before process exit.\nCause: File handle, stream, or connection left open, triggering Node resource leak warning.',
  'Close resources in a finally block or use [Symbol.asyncIterator] cleanup.\n// try { ... } finally { await handle.close(); }',
  'NODE: Unclosed resource warning. Close handles in finally block.',
  ['ERR-RUNTIME-FILE-DESCRIPTOR'],
  'warn', 2,
);

// ══ TYPESCRIPT STRICT-MODE ERRORS (5 nodes) ═════════════════════

export const ERR_TS_STRICT_NULL_CHECKS: ER = erNode('ERR-TS-STRICT-NULL-CHECKS', 'TS-STRICT-NULL-CHECKS',
  'TS STRICT NULL CHECKS: Object is possibly null/undefined under strictNullChecks.\nCause: Accessing members on a nullable type without guarding against null/undefined.',
  'Add explicit null guards or optional chaining before member access.\n// if (val !== null) val.method();  OR  val?.method();',
  'TS: strictNullChecks failure. Add null guards or use optional chaining.',
  ['ERR-TS2531', 'ERR-TS2532', 'FM-19-NULL-DEREF'],
  'warn', 1,
);

export const ERR_TS_NO_IMPLICIT_ANY: ER = erNode('ERR-TS-NO-IMPLICIT-ANY', 'TS-NO-IMPLICIT-ANY',
  'TS noImplicitAny: Parameter/variable implicitly has any type.\nCause: Missing type annotation where TS cannot infer the type.',
  'Add explicit type annotations.\n// function fn(x: number, y: string): void { ... }',
  'TS: noImplicitAny error. Add explicit type annotations.',
  ['TS-SF-NO-ANY', 'ERR-TS7053'],
  'warn', 1,
);

export const ERR_TS_STRICT_FUNCTION_TYPES: ER = erNode('ERR-TS-STRICT-FUNCTION-TYPES', 'TS-STRICT-FUNCTION-TYPES',
  'TS strictFunctionTypes: Function type is not assignable under stricter bivariant check.\nCause: Assigning a function whose parameter types are narrower than the target signature.',
  'Use correct (contravariant) function types or widen the parameter types.\n// type Handler = (e: Event) => void; // match the exact signature',
  'TS: strictFunctionTypes mismatch. Align function signatures (contravariant params).',
  ['ERR-TS2322', 'P2-TYPE-CERTAINTY'],
  'warn', 1,
);

export const ERR_TS_NO_UNSAFE_ASSIGNMENT: ER = erNode('ERR-TS-NO-UNSAFE-ASSIGNMENT', 'TS-NO-UNSAFE-ASSIGNMENT',
  'TS noUnsafeAssignment (eslint @typescript-eslint): Unsafe assignment of any value.\nCause: Assigning a value typed as any to a typed variable.',
  'Use a type assertion or fix the source to return a proper type.\n// const x: number = val as number;',
  'TS: noUnsafeAssignment. Add type assertion or fix source type.',
  ['TS-SF-NO-ANY', 'ERR-TS18046'],
  'warn', 1,
);

export const ERR_TS_EXACT_OPTIONAL: ER = erNode('ERR-TS-EXACT-OPTIONAL', 'TS-EXACT-OPTIONAL',
  'TS exactOptionalPropertyTypes: Optional property cannot accept undefined when explicitly omitted.\nCause: Passing undefined to an optional property typed as T (not T | undefined).',
  'Handle undefined explicitly or omit the property instead of passing undefined.\n// { ...obj, ...(val !== undefined ? { prop: val } : {}) }',
  'TS: exactOptionalPropertyTypes. Omit property instead of passing undefined.',
  ['ERR-TS2322-NULLABLE'],
  'warn', 1,
);

// ══ BUILD CONFIGURATION ERRORS (3 nodes) ════════════════════════

export const ERR_BUILD_SOURCEMAP: ER = erNode('ERR-BUILD-SOURCEMAP', 'BUILD-SOURCEMAP',
  'BUILD SOURCEMAP ERROR: Source map generation failed or produced invalid output.\nCause: Misconfigured sourcemap option, missing sources, or incompatible bundler target.',
  'Check the sourcemap config. Set "source-map" / "sourcemap": "linked" and verify sources exist.\n// tsconfig: { "compilerOptions": { "sourceMap": true } }',
  'BUILD: Source map error. Check sourcemap config and target.',
  ['ERR-BUILD-CONFIG', 'P8-CONFIG-VALIDATION'],
  'warn', 2,
);

export const ERR_BUILD_TARGET: ER = erNode('ERR-BUILD-TARGET', 'BUILD-TARGET-MISMATCH',
  'BUILD TARGET MISMATCH: Bundler target and tsconfig target disagree.\nCause: tsconfig targets ES2022 but bundler targets ES2015, or vice versa, causing syntax/runtime issues.',
  'Align the targets in tsconfig.json and the bundler config.\n// tsconfig "target": "ESNext" AND bundler "--target bun"',
  'BUILD: Target mismatch. Align tsconfig and bundler targets.',
  ['ERR-BUILD-CONFIG', 'P8-CONFIG-VALIDATION'],
  'warn', 2,
);

export const ERR_BUILD_EXTERNAL: ER = erNode('ERR-BUILD-EXTERNAL', 'BUILD-EXTERNAL-UNMARKED',
  'BUILD EXTERNAL UNMARKED: Dependency not marked as external gets bundled, bloating output.\nCause: A peer/runtime dependency was not listed in the bundler "external" array.',
  'Mark the dependency as external in the bundler config.\n// bun build src/index.ts --external react --external react-dom',
  'BUILD: External dep not marked. Add to bundler --external list.',
  ['ERR-BUILD-CONFIG'],
  'warn', 2,
);

// ══ RUNTIME RESOURCE/STREAM ERRORS (14 nodes) ═══════════════════

export const ERR_RUNTIME_STACK_OVERFLOW: ER = erNode('ERR-RUNTIME-STACK-OVERFLOW', 'RUNTIME-STACK-OVERFLOW',
  'RUNTIME STACK OVERFLOW: Maximum call stack size exceeded.\nCause: Deep/unbounded recursion without a base case or trampoline.',
  'Convert recursion to iteration, or use trampolining for tail-recursive logic.\n// Use a loop with an explicit stack array instead of recursive calls.',
  'RT: Stack overflow. Use iteration or trampolining instead of deep recursion.',
  ['ERR-RT-MAX-CALL-STACK', 'FM-17-INFINITE-LOOP'],
  'warn', 2,
);

export const ERR_RUNTIME_MEMORY_LEAK: ER = erNode('ERR-RUNTIME-MEMORY-LEAK', 'RUNTIME-MEMORY-LEAK',
  'RUNTIME MEMORY LEAK: Memory usage grows unbounded over time.\nCause: Retained references (closures, caches, event listeners) preventing GC.',
  'Clean up references when done. Use WeakMap/WeakSet for caches, null out large objects.\n// cache.delete(key); obj = null;',
  'RT: Memory leak detected. Clean up retained references (WeakMap, null-out).',
  ['ERR-RT-HEAP-OOM', 'CONC-RESOURCE-BUDGET'],
  'warn', 2,
);

export const ERR_RUNTIME_FILE_DESCRIPTOR: ER = erNode('ERR-RUNTIME-FILE-DESCRIPTOR', 'RUNTIME-FD-LEAK',
  'RUNTIME FILE DESCRIPTOR LEAK: Too many open file descriptors (EMFILE).\nCause: File handles/streams opened but never closed.',
  'Always close file handles. Use try/finally or async disposable resources.\n// try { const fh = await open(p); ... } finally { await fh.close(); }',
  'RT: File descriptor leak. Close all streams/handles in finally.',
  ['ERR-NODE-ERR-UNCLOSED', 'CONC-RESOURCE-BUDGET'],
  'warn', 2,
);

export const ERR_RUNTIME_EVENT_LISTENER: ER = erNode('ERR-RUNTIME-EVENT-LISTENER', 'RUNTIME-EVENT-LISTENER-LEAK',
  'RUNTIME EVENT LISTENER LEAK: Listeners added but never removed (MaxListenersExceededWarning).\nCause: addEventListener without matching removeEventListener, often in loops.',
  'Store handler references and remove them, or use AbortSignal.\n// emitter.on("x", handler); ... emitter.off("x", handler);',
  'RT: Event listener leak. Call removeEventListener or use AbortSignal.',
  ['ERR-RUNTIME-MEMORY-LEAK', 'FM-18-ZOMBIE-TIMER'],
  'warn', 2,
);

export const ERR_RUNTIME_TIMER_LEAK: ER = erNode('ERR-RUNTIME-TIMER-LEAK', 'RUNTIME-TIMER-LEAK',
  'RUNTIME TIMER LEAK: setTimeout/setInterval never cleared, keeping process alive.\nCause: Timer created without storing its handle for later clear.',
  'Store the timer handle and call clearInterval/clearTimeout when done.\n// const t = setInterval(fn, 1000); ... clearInterval(t);',
  'RT: Timer leak. Store handle and call clearInterval/clearTimeout.',
  ['ERR-RUNTIME-EVENT-LISTENER', 'FM-18-ZOMBIE-TIMER'],
  'warn', 2,
);

export const ERR_RUNTIME_ABORT_SIGNAL: ER = erNode('ERR-RUNTIME-ABORT-SIGNAL', 'RUNTIME-ABORT-UNHANDLED',
  'RUNTIME ABORTSIGNAL NOT HANDLED: AbortSignal aborted but operation ignores it.\nCause: Passing an AbortSignal but never checking signal.aborted in long operations.',
  'Check signal.aborted periodically and throw an AbortError to propagate cancellation.\n// if (signal.aborted) throw new DOMException("Aborted", "AbortError");',
  'RT: AbortSignal ignored. Check signal.aborted and propagate AbortError.',
  ['ERR-RT-TIMEOUT', 'CONC-PROCESS-EXEC'],
  'warn', 2,
);

export const ERR_RUNTIME_WORKER_EXIT: ER = erNode('ERR-RUNTIME-WORKER-EXIT', 'RUNTIME-WORKER-EXIT',
  'RUNTIME WORKER UNEXPECTED EXIT: Worker terminated unexpectedly without error handler.\nCause: Worker crashed and no "error"/"exit" listener was attached.',
  'Attach error and exit handlers to all Workers; treat non-zero exit as failure.\n// worker.on("error", handleErr); worker.on("exit", (c) => { if (c !== 0) ... });',
  'RT: Worker unexpected exit. Handle error and exit events.',
  ['P9-ASYNC-DISCIPLINE', 'CONC-PROCESS-EXEC'],
  'warn', 2,
);

export const ERR_RUNTIME_CHILD_PROCESS: ER = erNode('ERR-RUNTIME-CHILD-PROCESS', 'RUNTIME-CHILD-PROCESS',
  'RUNTIME CHILD PROCESS ERROR: spawned/child_process emitted an unhandled "error" event.\nCause: Process failed to spawn, or no error listener was attached.',
  'Always attach an error listener to spawned child processes.\n// const p = spawn(cmd, args); p.on("error", handleErr);',
  'RT: Child process error. Attach error listener to spawned process.',
  ['ERR-RUNTIME-WORKER-EXIT', 'CONC-PROCESS-EXEC'],
  'warn', 2,
);

export const ERR_RUNTIME_STREAM_ERROR: ER = erNode('ERR-RUNTIME-STREAM-ERROR', 'RUNTIME-STREAM-ERROR',
  'RUNTIME STREAM ERROR: A readable/writable stream emitted an unhandled "error" event.\nCause: Stream errored with no listener, crashing the process.',
  'Always attach an error handler to streams; pipeline() auto-propagates errors.\n// stream.on("error", handleErr);  OR  await pipeline(src, dest);',
  'RT: Stream error event. Attach error listener or use pipeline().',
  ['ERR-RUNTIME-CHILD-PROCESS'],
  'warn', 2,
);

export const ERR_RUNTIME_BUFFER_OVERFLOW: ER = erNode('ERR-RUNTIME-BUFFER-OVERFLOW', 'RUNTIME-BUFFER-OVERFLOW',
  'RUNTIME BUFFER OUT OF BOUNDS: Buffer read/write index out of range (ERR_BUFFER_OUT_OF_BOUNDS).\nCause: Reading/writing past the allocated buffer length.',
  'Validate indices against buffer.length before read/write.\n// if (offset + byteLength <= buf.length) { buf.writeUInt32BE(v, offset); }',
  'RT: Buffer out of bounds. Check index against buffer.length.',
  ['FM-19-NULL-DEREF'],
  'warn', 2,
);

export const ERR_RUNTIME_JSON_CIRCULAR: ER = erNode('ERR-RUNTIME-JSON-CIRCULAR', 'RUNTIME-JSON-CIRCULAR',
  'RUNTIME JSON CIRCULAR REFERENCE: Converting circular structure to JSON.\nCause: JSON.stringify on an object containing a cycle.',
  'Use a replacer function or a cycle-safe serializer to break loops.\n// JSON.stringify(obj, (k, v) => typeof v === "object" ? seen.get(v) ?? ... : v);',
  'RT: JSON.stringify circular. Use replacer or cycle-safe serializer.',
  ['ERR-RT-INVALID-JSON'],
  'warn', 2,
);

export const ERR_RUNTIME_PROXY_UNDEFINED: ER = erNode('ERR-RUNTIME-PROXY-UNDEFINED', 'RUNTIME-PROXY-UNDEFINED',
  'RUNTIME PROXY TRAP UNDEFINED: Proxy trap returned undefined for invariant-checked property.\nCause: A get/has trap returned undefined where the target defines a non-undefined value.',
  'Return the underlying value from the trap; do not silently return undefined.\n// return Reflect.get(target, prop, receiver);',
  'RT: Proxy returned undefined. Return target value from trap.',
  ['FM-19-NULL-DEREF'],
  'warn', 2,
);

export const ERR_RUNTIME_ASYNC_ITERATOR_CLOSE: ER = erNode('ERR-RUNTIME-ASYNC-ITERATOR-CLOSE', 'RUNTIME-ASYNC-ITERATOR-UNCLOSED',
  'RUNTIME ASYNC ITERATOR NOT CLOSED: AsyncIterator left open after early break/throw.\nCause: for-await loop broken before completion without calling iterator.return().',
  'Call the iterator return() on early exit, or use try/finally around for-await.\n// try { for await (const x of it) { if (done) break; } } finally { await it.return?.(); }',
  'RT: AsyncIterator not closed. Call return() on early exit.',
  ['ERR-NODE-ERR-UNCLOSED', 'P9-ASYNC-DISCIPLINE'],
  'warn', 2,
);

export const ERR_RUNTIME_WEB_CRYPTO: ER = erNode('ERR-RUNTIME-WEB-CRYPTO', 'RUNTIME-WEB-CRYPTO-UNAVAILABLE',
  'RUNTIME WEB CRYPTO UNAVAILABLE: crypto.subtle is undefined in the current runtime.\nCause: Running in a context without Web Crypto (insecure origin or unsupported runtime).',
  'Detect availability and fall back to node:crypto or a polyfill.\n// const subtle = globalThis.crypto?.subtle ?? (await import("node:crypto")).webcrypto.subtle;',
  'RT: Web Crypto not available. Detect crypto.subtle and fall back.',
  ['P6-DEPENDENCY-CHECK', 'FM-07-ENV-DEPENDENCY'],
  'warn', 2,
);

// EXPORTS
export const errorRecoveryNodes: KnowledgeNode[] = [
  ERR_TS2322, ERR_TS2304, ERR_TS2339, ERR_TS2559, ERR_TS2307,
  ERR_TS2345, ERR_TS2531, ERR_TS2532, ERR_TS2588, ERR_TS2769,
  ERR_TS18046, ERR_TS18048, ERR_TS2349, ERR_TS2351, ERR_TS2454,
  ERR_TS2324, ERR_TS2314, ERR_TS2416, ERR_TS2554, ERR_TS2533,
  ERR_BUILD_MISSING_MODULE, ERR_BUILD_CIRCULAR_DEP, ERR_BUILD_SYNTAX_ERROR, ERR_BUILD_EXPORT_MISSING, ERR_BUILD_TYPE_ERROR,
  ERR_BUILD_DUPLICATE_DECL, ERR_BUILD_IMPORT_TYPE, ERR_BUILD_NO_ENTRY, ERR_BUILD_CONFIG, ERR_BUILD_PERMISSION,
  ERR_RT_UNDEFINED_FN, ERR_RT_CANNOT_READ, ERR_RT_MAX_CALL_STACK, ERR_RT_HEAP_OOM, ERR_RT_UNHANDLED_REJECTION,
  ERR_RT_ENOENT, ERR_RT_EACCES, ERR_RT_EADDRINUSE, ERR_RT_INVALID_JSON, ERR_RT_TIMEOUT,
  ERR_TS1361, ERR_TS2740, ERR_TS2741, ERR_TS2745, ERR_TS2820,
  ERR_TS6133, ERR_TS6133_IMPORT, ERR_TS7016, ERR_TS7053, ERR_TS2322_NULLABLE,
  // — Bun build errors (4) —
  ERR_BUN_IMPORT_CIRCULAR, ERR_BUN_EXPORT_MISSING, ERR_BUN_NPM_COMPAT, ERR_BUN_ESM_CJS,
  // — Node.js platform errors (4) —
  ERR_NODE_ERR_UNKNOWN, ERR_NODE_ERR_REQUIRE_ESM, ERR_NODE_ERR_UNHANDLED, ERR_NODE_ERR_UNCLOSED,
  // — TypeScript strict-mode errors (5) —
  ERR_TS_STRICT_NULL_CHECKS, ERR_TS_NO_IMPLICIT_ANY, ERR_TS_STRICT_FUNCTION_TYPES,
  ERR_TS_NO_UNSAFE_ASSIGNMENT, ERR_TS_EXACT_OPTIONAL,
  // — Build configuration errors (3) —
  ERR_BUILD_SOURCEMAP, ERR_BUILD_TARGET, ERR_BUILD_EXTERNAL,
  // — Runtime resource/stream errors (14) —
  ERR_RUNTIME_STACK_OVERFLOW, ERR_RUNTIME_MEMORY_LEAK, ERR_RUNTIME_FILE_DESCRIPTOR,
  ERR_RUNTIME_EVENT_LISTENER, ERR_RUNTIME_TIMER_LEAK, ERR_RUNTIME_ABORT_SIGNAL,
  ERR_RUNTIME_WORKER_EXIT, ERR_RUNTIME_CHILD_PROCESS, ERR_RUNTIME_STREAM_ERROR,
  ERR_RUNTIME_BUFFER_OVERFLOW, ERR_RUNTIME_JSON_CIRCULAR, ERR_RUNTIME_PROXY_UNDEFINED,
  ERR_RUNTIME_ASYNC_ITERATOR_CLOSE, ERR_RUNTIME_WEB_CRYPTO,
];
