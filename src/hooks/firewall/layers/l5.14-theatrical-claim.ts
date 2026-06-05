import type { LayerRule } from '../types.js';
import { OperationType } from '../types.js';

const CHAT_OPERATIONS: OperationType[] = [
  OperationType.READ,
  OperationType.WRITE,
  OperationType.EXECUTE,
  OperationType.TEST,
];

export const L5_14_THEATRICAL_CLAIM: LayerRule = {
  layer: 'L5.14',
  description: 'Theatrical Claims — blocks faux tool runes, markdown tool headers, verification checkmarks in messages',
  applicableTo: CHAT_OPERATIONS,
  patterns: [
    {
      intent: OperationType.TEST,
      pattern: /⚙\s+\w[\w-]+/i,
      field: 'args.notes',
      description: 'Faux tool rune detected — ⚙ simulates tool execution',
    },
    {
      intent: OperationType.TEST,
      pattern: /\*\*Tool:\s+\w[\w-]+\*\*/i,
      field: 'args.notes',
      description: 'Markdown tool header — **Tool: name** is not real tool execution',
    },
    {
      intent: OperationType.TEST,
      pattern: /✅\s+\w[\w-]+:/i,
      field: 'args.notes',
      description: 'Verification checkmark — ✅ tool: simulates passed verification',
    },
    {
      intent: OperationType.TEST,
      pattern: /❌\s+\w[\w-]+:/i,
      field: 'args.notes',
      description: 'Failure checkmark — ❌ tool: simulates failed verification',
    },
    {
      intent: OperationType.TEST,
      pattern: /^```(?:json)?\s*$/i,
      field: 'args.notes',
      description: 'Code block start claiming JSON — fabricating tool output format',
    },
    {
      intent: OperationType.TEST,
      pattern: /⚙\s+\w[\w-]+/i,
      field: 'args.message',
      description: 'Faux tool rune detected in message',
    },
    {
      intent: OperationType.TEST,
      pattern: /\*\*Tool:\s+\w[\w-]+\*\*/i,
      field: 'args.message',
      description: 'Markdown tool header in message',
    },
  ],
  correction: 'Do not simulate tool execution with markdown, emoji, or faux runes. Use actual OpenCode tools.',
  enabled: true,
};
