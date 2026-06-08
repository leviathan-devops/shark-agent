import type { LayerRule } from '../types.js';
import { OperationType } from '../types.js';

export const L5_15_ASSUMPTIONS: LayerRule = {
  layer: 'L5.15',
  description: 'Assumption Detection — blocks "probably works" claims and uncertainty language unless mechanically proven',
  applicableTo: [OperationType.READ, OperationType.WRITE, OperationType.EXECUTE, OperationType.TEST],
  patterns: [
    {
      intent: OperationType.EXECUTE,
      pattern: /\b(probably|might be|should work|might work|likely|could be)\b/i,
      field: 'args.description',
      description: 'Uncertain language — "probably works" requires mechanical proof',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\b(probably|might be|should work|might work|likely|could be)\b/i,
      field: 'args.notes',
      description: 'Uncertain language in notes — "probably works" requires mechanical proof',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\bshould(?:'s)?\s*(be fine|work|pass|succeed)/i,
      field: 'args.description',
      description: 'Assumption of success without evidence',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\bshould(?:'s)?\s*(be fine|work|pass|succeed)/i,
      field: 'args.notes',
      description: 'Assumption of success in notes without evidence',
    },
    {
      intent: OperationType.WRITE,
      pattern: /\bhope\s*(it|this)\s*(works|helps|passes)/i,
      field: 'args.description',
      description: 'Hope-based claim without evidence',
    },
    {
      intent: OperationType.WRITE,
      pattern: /\bhope\s*(it|this)\s*(works|helps|passes)/i,
      field: 'args.notes',
      description: 'Hope-based claim in notes without evidence',
    },
    {
      intent: OperationType.READ,
      pattern: /\b(assume|assuming|presumably)\b/i,
      field: 'args.description',
      description: 'Assumption-based reasoning without verification',
    },
    {
      intent: OperationType.READ,
      pattern: /\b(assume|assuming|presumably)\b/i,
      field: 'args.notes',
      description: 'Assumption-based reasoning in notes without verification',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\bit['']s\s+(probably|likely|presumably)\b/i,
      field: 'args.description',
      description: 'Uncertainty claim — "it probably" requires mechanical proof',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\bit['']s\s+(probably|likely|presumably)\b/i,
      field: 'args.notes',
      description: 'Uncertainty claim in notes — requires mechanical proof',
    },
    {
      intent: OperationType.TEST,
      pattern: /\b(guess|guessing|speculate|speculating)\b/i,
      field: 'args.description',
      description: 'Speculation instead of mechanical verification',
    },
    {
      intent: OperationType.TEST,
      pattern: /\b(guess|guessing|speculate|speculating)\b/i,
      field: 'args.notes',
      description: 'Speculation in notes instead of mechanical verification',
    },
  ],
  requireEvidence: '.shark/evidence/delivery/ContainerTestResult.json',
  correction: 'Verify mechanically. Do not assume. Run tests. Show output that proves it works.',
  enabled: true,
};
