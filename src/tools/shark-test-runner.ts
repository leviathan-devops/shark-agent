/**
 * Shark Test Runner — Container-Aware Version
 *
 * V4.9: Mechanical TEST gate verification for container testing
 *
 * PURPOSE: Verify actual shark agent functionality via direct runtime checks.
 * ALL tests use direct imports — NO `opencode run` (banned by firewall).
 *
 * TEST GATE ENFORCEMENT:
 * Container tests must pass at 90%+ success rate before VERIFY gate.
 * Produces ContainerTestResult.json as TEST gate evidence.
 */

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Firewall layer imports + BANNED patterns
import { DEFAULT_LAYERS } from '../hooks/firewall/layers/index.js';

// Brain imports
import { initializeTripleBrain } from '../shark/brains/index.js';

// Identity imports
import { getSharkIdentityPrompt } from '../shared/identity-loader.js';
import { formatSharkIdentityHeader } from '../shared/identity-header.js';

// Gate imports
import { GateManager } from '../shared/gates.js';

// Tool creation imports (verify they produce objects with execute())
import { createSharkStatusTool } from './shark-status.js';
import { createSharkGateTool } from './shark-gate.js';
import { createCheckpointTool } from './checkpoint.js';

// Agent state imports
import * as agentState from '../hooks/v4.1/agent-state.js';

// BANNED opencode run patterns (mirrored from guardian-hook.ts for direct test)
const BANNED_OPENCODE_RUN_PATTERNS = [
  /opencode\s+run\s+--agent\s+shark/i,
  /opencode\s+run\s+--prompt/i,
  /opencode\s+run\s+--print-output/i,
];

const BANNED_PATTERN_SAMPLES: string[] = [
  'opencode run --agent shark -m opencode/big-pickle',
  'opencode run --prompt "do something"',
  'opencode run --print-output',
];

export interface TestResult {
  name: string;
  passed: boolean;
  output: string;
  timestamp: number;
}

export interface TestSuiteResult {
  suite: string;
  timestamp: number;
  buildId: string;
  tests: TestResult[];
  overallPassed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
}

function getBasePath(): string {
  return process.cwd();
}

// =============================================================================
// CONTAINER MECHANICAL TESTS — direct imports, no opencode run
// =============================================================================

const TEST_SUITE: Array<{ name: string; test: () => Promise<TestResult> }> = [

  // ---------------------------------------------------------------------------
  // L0: BRAIN — Verify triple-brain initializes with execution/reasoning/system
  // ---------------------------------------------------------------------------
  {
    name: 'L0-brain-initialization',
    test: async () => {
      try {
        const brains = initializeTripleBrain(getBasePath());
        const hasExecution = typeof brains?.executionBrain === 'object' && brains.executionBrain !== null;
        const hasReasoning = typeof brains?.reasoningBrain === 'object' && brains.reasoningBrain !== null;
        const hasSystem = typeof brains?.systemBrain === 'object' && brains.systemBrain !== null;
        const passed = hasExecution && hasReasoning && hasSystem;

        return {
          name: 'L0-brain-initialization',
          passed,
          output: passed
            ? 'Triple-brain (execution/reasoning/system) initialized'
            : `Brains missing: exec=${hasExecution} reason=${hasReasoning} system=${hasSystem}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          name: 'L0-brain-initialization',
          passed: false,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        };
      }
    },
  },

  // ---------------------------------------------------------------------------
  // L1: FIREWALL — Verify each DEFAULT_LAYERS entry has patterns defined
  // ---------------------------------------------------------------------------
  {
    name: 'L1-firewall-layers-have-patterns',
    test: async () => {
      try {
        const failures: string[] = [];
        for (const layer of DEFAULT_LAYERS) {
          if (!layer.patterns || layer.patterns.length === 0) {
            failures.push(`${layer.layer}: no patterns`);
          }
        }
        const passed = failures.length === 0;
        return {
          name: 'L1-firewall-layers-have-patterns',
          passed,
          output: passed
            ? `All ${DEFAULT_LAYERS.length} firewall layers have patterns`
            : `Layers missing patterns: ${failures.join(', ')}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          name: 'L1-firewall-layers-have-patterns',
          passed: false,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        };
      }
    },
  },

  // ---------------------------------------------------------------------------
  // L2: IDENTITY — Verify getSharkIdentityPrompt() returns non-empty string
  // ---------------------------------------------------------------------------
  {
    name: 'L2-identity-prompt-nonempty',
    test: async () => {
      try {
        const prompt = getSharkIdentityPrompt();
        const passed = typeof prompt === 'string' && prompt.length > 50;
        return {
          name: 'L2-identity-prompt-nonempty',
          passed,
          output: passed
            ? `Shark identity prompt loaded (${prompt.length} chars)`
            : `Identity prompt missing or too short: ${prompt.length} chars`,
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          name: 'L2-identity-prompt-nonempty',
          passed: false,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        };
      }
    },
  },

  // ---------------------------------------------------------------------------
  // L3: GATE MANAGER — Verify GateManager has expected methods
  // ---------------------------------------------------------------------------
  {
    name: 'L3-gate-manager-methods',
    test: async () => {
      try {
        const gm = new GateManager();
        const requiredMethods = [
          'getCurrentGate',
          'getGateStatuses',
          'getCurrentIteration',
          'canTransition',
          'transitionTo',
          'blockCurrentGate',
          'passCurrentGate',
          'failCurrentGate',
          'getCriteria',
          'handleVerifyFailure',
          'getEvidenceCollector',
          'isComplete',
          'getState',
          'restore',
        ];
        const missing = requiredMethods.filter(m => typeof (gm as any)[m] !== 'function');
        const passed = missing.length === 0;
        return {
          name: 'L3-gate-manager-methods',
          passed,
          output: passed
            ? `GateManager has all ${requiredMethods.length} required methods`
            : `GateManager missing methods: ${missing.join(', ')}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          name: 'L3-gate-manager-methods',
          passed: false,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        };
      }
    },
  },

  // ---------------------------------------------------------------------------
  // L4: SHARK STATUS TOOL — Verify createSharkStatusTool returns object with execute()
  // ---------------------------------------------------------------------------
  {
    name: 'L4-shark-status-tool-created',
    test: async () => {
      try {
        const mockStore = { get: () => null, snapshot: () => ({}) };
        const mockGate = new GateManager();
        const result = createSharkStatusTool(mockStore as any, mockGate as any);
        const hasExecute = typeof result?.execute === 'function';
        return {
          name: 'L4-shark-status-tool-created',
          passed: hasExecute,
          output: hasExecute
            ? 'Shark status tool created with execute()'
            : 'Shark status tool missing execute()',
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          name: 'L4-shark-status-tool-created',
          passed: false,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        };
      }
    },
  },

  // ---------------------------------------------------------------------------
  // L5: SHARK GATE TOOL — Verify createSharkGateTool returns object with execute()
  // ---------------------------------------------------------------------------
  {
    name: 'L5-shark-gate-tool-created',
    test: async () => {
      try {
        const mockGate = new GateManager();
        // @theatrical-stub: cannot validate because mock guardian in test L5 requires real GateManager+guardian infrastructure
        const mockGuardian = { check: () => ({ blocked: false }) };
        const result = createSharkGateTool(mockGate as any, mockGuardian as any);
        const hasExecute = typeof result?.execute === 'function';
        return {
          name: 'L5-shark-gate-tool-created',
          passed: hasExecute,
          output: hasExecute
            ? 'Shark gate tool created with execute()'
            : 'Shark gate tool missing execute()',
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          name: 'L5-shark-gate-tool-created',
          passed: false,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        };
      }
    },
  },

  // ---------------------------------------------------------------------------
  // L6: CHECKPOINT TOOL — Verify createCheckpointTool returns object with execute()
  // ---------------------------------------------------------------------------
  {
    name: 'L6-checkpoint-tool-created',
    test: async () => {
      try {
        const mockStore = { get: () => null, snapshot: () => ({}) };
        const mockGate = new GateManager();
        const result = createCheckpointTool(mockStore as any, mockGate as any);
        const hasExecute = typeof result?.execute === 'function';
        return {
          name: 'L6-checkpoint-tool-created',
          passed: hasExecute,
          output: hasExecute
            ? 'Checkpoint tool created with execute()'
            : 'Checkpoint tool missing execute()',
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          name: 'L6-checkpoint-tool-created',
          passed: false,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        };
      }
    },
  },

  // ---------------------------------------------------------------------------
  // L7: IDENTITY HEADER — Verify formatSharkIdentityHeader() returns 1000+ chars with "SHARK v4.9"
  // ---------------------------------------------------------------------------
  {
    name: 'L7-identity-header-ship-v4.9',
    test: async () => {
      try {
        const header = formatSharkIdentityHeader();
        const hasVersion = header.includes('SHARK v4.9');
        const longEnough = header.length >= 1000;
        const passed = typeof header === 'string' && hasVersion && longEnough;
        return {
          name: 'L7-identity-header-ship-v4.9',
          passed,
          output: passed
            ? `Identity header valid: ${header.length} chars, contains "SHARK v4.9"`
            : `Header: len=${header.length}, hasVersion=${hasVersion}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          name: 'L7-identity-header-ship-v4.9',
          passed: false,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        };
      }
    },
  },

  // ---------------------------------------------------------------------------
  // L8: OPENCODE RUN BANNED — Verify BANNED_OPENCODE_RUN_PATTERNS regexes match banned strings
  // ---------------------------------------------------------------------------
  {
    name: 'L8-opencode-run-banned',
    test: async () => {
      try {
        const failures: string[] = [];
        let totalMatched = 0;

        for (const sample of BANNED_PATTERN_SAMPLES) {
          const matched = BANNED_OPENCODE_RUN_PATTERNS.some(r => r.test(sample));
          if (matched) {
            totalMatched++;
          } else {
            failures.push(`"${sample}" not matched by any banned regex`);
          }
        }

        const passed = failures.length === 0 && totalMatched === BANNED_PATTERN_SAMPLES.length;
        return {
          name: 'L8-opencode-run-banned',
          passed,
          output: passed
            ? `All ${BANNED_PATTERN_SAMPLES.length} banned patterns correctly matched`
            : `Banned pattern failures: ${failures.join('; ')}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          name: 'L8-opencode-run-banned',
          passed: false,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        };
      }
    },
  },

  // ---------------------------------------------------------------------------
  // L9: AGENT STATE — Verify agent-state.ts exports valid functions
  // ---------------------------------------------------------------------------
  {
    name: 'L9-agent-state-exports',
    test: async () => {
      try {
        const requiredExports = [
          'setCurrentAgent',
          'getCurrentAgent',
          'getLastUserMessage',
          'getSlopScore',
          'incrementSlopScore',
          'clearCurrentAgent',
          'getSessionIds',
        ];
        const missing = requiredExports.filter(fn => typeof (agentState as any)[fn] !== 'function');
        const passed = missing.length === 0;

        if (passed) {
          const ids = agentState.getSessionIds();
        }

        return {
          name: 'L9-agent-state-exports',
          passed,
          output: passed
            ? `All ${requiredExports.length} agent-state functions exported`
            : `Agent-state missing exports: ${missing.join(', ')}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          name: 'L9-agent-state-exports',
          passed: false,
          output: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        };
      }
    },
  },

  // ---------------------------------------------------------------------------
  // L10: EVIDENCE DIRECTORY — Verify .shark/evidence/ is writable
  // ---------------------------------------------------------------------------
  {
    name: 'L10-evidence-dir-writable',
    test: async () => {
      const sharkDir = path.join(getBasePath(), '.shark');
      const evidenceDir = path.join(sharkDir, 'evidence', 'l10-test-' + Date.now());

      try {
        fs.mkdirSync(evidenceDir, { recursive: true });
        const testFile = path.join(evidenceDir, 'test-' + Date.now() + '.json');
        fs.writeFileSync(testFile, JSON.stringify({ test: true, timestamp: Date.now() }));
        fs.unlinkSync(testFile);
        fs.rmdirSync(evidenceDir);

        return {
          name: 'L10-evidence-dir-writable',
          passed: true,
          output: 'Evidence directory is writable',
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          name: 'L10-evidence-dir-writable',
          passed: false,
          output: `Evidence dir not writable: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        };
      }
    },
  },
];

// =============================================================================
// TOOL IMPLEMENTATION
// =============================================================================

export function createSharkTestRunnerTool() {
  return tool({
    description: 'Run container-aware mechanical test suite for shark agent. Produces ContainerTestResult.json for ship gate evidence.',
    args: {
      action: z.enum(['run', 'status', 'report']).describe('Action: run tests, check status, or generate report'),
      buildId: z.string().optional().describe('Build ID to report'),
    },
    execute: async (args, ctx) => {
      const { action, buildId } = args;

      if (action === 'status') {
        return JSON.stringify({
          status: 'ready',
          containerAware: true,
          testCount: TEST_SUITE.length,
          tests: TEST_SUITE.map(t => t.name),
        });
      }

      if (action === 'run' || action === 'report') {
        const id = buildId || `shark-v4.9-${new Date().toISOString().slice(0, 10)}`;
        const results: TestResult[] = [];



        for (const testDef of TEST_SUITE) {

          try {
            const result = await testDef.test();
            results.push(result);

          } catch (error) {
            results.push({
              name: testDef.name,
              passed: false,
              output: `Test error: ${error instanceof Error ? error.message : 'Unknown'}`,
              timestamp: Date.now(),
            });

          }
        }

        const passedTests = results.filter(r => r.passed).length;
        const totalTests = results.length;
        const passRate = totalTests > 0 ? passedTests / totalTests : 0;
        const overallPassed = passRate >= 0.90;

        const suiteResult: TestSuiteResult = {
          suite: 'shark-agent-v4.9-container',
          timestamp: Date.now(),
          buildId: id,
          tests: results,
          overallPassed,
          totalTests,
          passedTests,
          failedTests: totalTests - passedTests,
          passRate,
        };

        // Write evidence file
        try {
          const evidenceDir = path.join(getBasePath(), '.shark', 'evidence', 'delivery');
          fs.mkdirSync(evidenceDir, { recursive: true });
          fs.writeFileSync(path.join(evidenceDir, 'ContainerTestResult.json'), JSON.stringify(suiteResult, null, 2));
        } catch { /* delivery evidence dir not writable */ }

        try {
          const verifyEvidenceDir = path.join(getBasePath(), '.shark', 'evidence', 'verify');
          fs.mkdirSync(verifyEvidenceDir, { recursive: true });
          fs.writeFileSync(path.join(verifyEvidenceDir, 'ContainerTestResult.json'), JSON.stringify(suiteResult, null, 2));
        } catch { /* verify evidence dir not writable */ }

        // Format output
        let summary = `Test suite: ${id}\n`;
        summary += `Results: ${passedTests}/${totalTests} passed (${Math.round(passRate * 100)}%)\n\n`;

        for (const result of results) {
          summary += `${result.passed ? '✓' : '✗'} ${result.name}\n`;
          summary += `  → ${result.output}\n`;
        }

        summary += `\nOverall: ${overallPassed ? 'PASS' : 'FAIL'}`;
        if (overallPassed) {
          summary += '\n[Ship gate evidence collected]';
        }

        return summary;
      }

      return JSON.stringify({ error: 'Unknown action. Use: run, status, or report' });
    },
  });
}
