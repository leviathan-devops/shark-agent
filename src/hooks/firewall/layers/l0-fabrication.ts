import type { LayerRule } from '../types.js';
import { OperationType } from '../types.js';

export const L0_FABRICATION: LayerRule = {
  layer: 'L5.16',
  analysisOrder: 1,
  description: 'Fabrication Detection — blocks claims about output, results, or verification without mechanical evidence',
  applicableTo: [OperationType.READ, OperationType.WRITE, OperationType.EXECUTE, OperationType.TEST],
  patterns: [
    {
      intent: OperationType.EXECUTE,
      pattern: /\b(output(s|ed)\s+(the\s+)?(result|value|data|file|count|number|status))\b/i,
      field: 'args.description',
      description: 'Fabricated output claim without evidence',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\b(output(s|ed)\s+(the\s+)?(result|value|data|file|count|number|status))\b/i,
      field: 'args.notes',
      description: 'Fabricated output claim in notes without evidence',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\bshows?\s+(the\s+)?(user|output|result|count|number)/i,
      field: 'args.description',
      description: 'Claim about what is shown without evidence',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\bshows?\s+(the\s+)?(user|output|result|count|number)/i,
      field: 'args.notes',
      description: 'Claim about what is shown in notes without evidence',
    },
    {
      intent: OperationType.WRITE,
      pattern: /\b\d+\s*(files?|lines?|functions?|classes?)\b/i,
      field: 'args.description',
      description: 'Dimensional claim without mechanical count',
    },
    {
      intent: OperationType.WRITE,
      pattern: /\b\d+\s*(files?|lines?|functions?|classes?)\b/i,
      field: 'args.notes',
      description: 'Dimensional claim in notes without mechanical count',
    },
    {
      intent: OperationType.TEST,
      pattern: /\btests?\s*(pass|passing|passed|green|successful)\b/i,
      field: 'args.description',
      description: 'Claim tests pass without evidence',
    },
    {
      intent: OperationType.TEST,
      pattern: /\btests?\s*(pass|passing|passed|green|successful)\b/i,
      field: 'args.notes',
      description: 'Claim tests pass in notes without evidence',
    },
    {
      intent: OperationType.TEST,
      pattern: /\b(all\s*good|no\s*errors?|looks?\s*fine|works?\s*fine)\b/i,
      field: 'args.description',
      description: 'Claim of success without verification',
    },
    {
      intent: OperationType.TEST,
      pattern: /\b(all\s*good|no\s*errors?|looks?\s*fine|works?\s*fine)\b/i,
      field: 'args.notes',
      description: 'Claim of success in notes without verification',
    },
    {
      intent: OperationType.TEST,
      pattern: /\b(verified?|validated?|confirmed?)\b/i,
      field: 'args.description',
      description: 'Claim of verification without evidence',
    },
    {
      intent: OperationType.TEST,
      pattern: /\b(verified?|validated?|confirmed?)\b/i,
      field: 'args.notes',
      description: 'Claim of verification in notes without evidence',
    },
    {
      intent: OperationType.WRITE,
      pattern: /\b(i|my)\s+(have\s+)?verified|validated|confirmed\b/i,
      field: 'args.description',
      description: 'Self-verification claim — personal assessment is not mechanical proof',
    },
    {
      intent: OperationType.WRITE,
      pattern: /\b(i|my)\s+(have\s+)?verified|validated|confirmed\b/i,
      field: 'args.notes',
      description: 'Self-verification claim in notes — personal assessment is not mechanical proof',
    },
    {
      intent: OperationType.READ,
      pattern: /\b(in\s+my|my)\s+(assessment|analysis|opinion|judgment)\b/i,
      field: 'args.description',
      description: 'Subjective assessment presented as evidence',
    },
    {
      intent: OperationType.READ,
      pattern: /\b(in\s+my|my)\s+(assessment|analysis|opinion|judgment)\b/i,
      field: 'args.notes',
      description: 'Subjective assessment in notes presented as evidence',
    },
  ],
  requireEvidence: '.shark/evidence/delivery/ContainerTestResult.json',
  correction: 'Show the actual output. Run the command. Prove it mechanically. Personal claims are not evidence.',
  enabled: true,
};
