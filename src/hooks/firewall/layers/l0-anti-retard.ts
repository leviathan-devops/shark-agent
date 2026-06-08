import type { LayerRule } from '../types.js';
import { OperationType } from '../types.js';

const EXCUSE_PATTERNS = [
  /\bit['']s?\s+(not\s+)?my\s+fault/i,
  /\bcan['']t\s+(really|actually)\s+help\s+it/i,
  /\bthat['']s\s+(just|not)\s+(how|what)\s+(it\s+)?(works?|happens)/i,
  /\bno\s+(need|one)\s+(told?|asked?)\s+me\s+to\s+(do|try)/i,
  /\bthey\s+(should have|were supposed to|needed to)/i,
  /\bnot\s+(my|me|ours?)\s+(responsibility|problem|job|department)/i,
  /\bjust\s+a\s+(coincidence|glitch|technical issue|problem)/i,
];

const DENIAL_PATTERNS = [
  /\btest\s+(failures?|issues?|problems?)\s+(are\s+)?(not|never)\s+(related|caused|due)\s+to/i,
  /\bmechanical\s+tests?\s+(don['']t|do\s+not|never)\s+(really|actually)\s+(count|matter|test)/i,
  /\bdocker\s+(doesn['']t|does\s+not|won['']t)\s+require\s+network/i,
  /\bit\s+(works?|worked)\s+(on\s+)?my\s+(machine|computer|setup|env)/i,
  /\b(skip|skipping|skip\s+container)\s+(container|test|verification)/i,
];

const LAZY_REPETITION = [
  /\b(try|trying)\s+(the\s+)?same\s+(thing|approach|strategy|method)\b/i,
  /\bmaybe\s+it\s+(will|work)s?\s+(now|this\s+time|again)\b/i,
  /\brepeating?\s+(the|my)\s+(same|previous)\b/i,
  /\bstill\s+(not|doesn['']t)\s+(working|passing|fixed)\b/i,
  /\banother\s+(attempt|try|shot)\b/i,
  /\bone\s+more\s+time\b/i,
];

const OFF_TOPIC_PATTERNS = [
  /\bAWS\w*\s+cloud\b/i,
  /\b(evil\.com|malicious\s+site|bad\s+domain)\b/i,
  /\b(unrelated|irrelevant)\s+(to\s+)?(the\s+)?(task|issue|problem)\b/i,
  /\blet['']s\s+(talk|discuss|consider)\s+(about\s+)?(something\s+)?else\b/i,
  /\bthis\s+is\s+like\s+(the\s+)?(other|previous)\s+(time|situation)\b/i,
  /\bthat['']s\s+a\s+(different|separate)\s+(issue|problem|topic)\b/i,
  /\bwhile\s+(we['']re|you['']re)\s+(at|on)\s+(it|that)\b/i,
];

const FABRICATION_PATTERNS = [
  /\b(never\s+fabricate|i\s+fabricated|made\s+up|hallucinated)\b/i,
  /\b(i\s+|we\s+)(fabricated|hallucinated|invented|made\s+up)\b/i,
  /\boutput\s+(was|is)\s+(fabricated|hallucinated|not\s+real)\b/i,
];

const EXCUSES = new RegExp(EXCUSE_PATTERNS.map(p => p.source).join('|'), 'i');
const DENIAL = new RegExp(DENIAL_PATTERNS.map(p => p.source).join('|'), 'i');
const LAZY = new RegExp(LAZY_REPETITION.map(p => p.source).join('|'), 'i');
const OFFTOPIC = new RegExp(OFF_TOPIC_PATTERNS.map(p => p.source).join('|'), 'i');
const FABR = new RegExp(FABRICATION_PATTERNS.map(p => p.source).join('|'), 'i');

export const L0_ANTI_RETARD: LayerRule = {
  layer: 'L5.18',
  analysisOrder: 1,
  description: 'Anti-Retard — blocks excuses, denial, lazy repetition, off-topic behavior, and fabrication admissions',
  applicableTo: [OperationType.READ, OperationType.WRITE, OperationType.EXECUTE, OperationType.TEST],
  patterns: [
    {
      intent: OperationType.EXECUTE,
      pattern: EXCUSES,
      field: 'args.description',
      description: 'Making excuses instead of fixing the problem',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: EXCUSES,
      field: 'args.notes',
      description: 'Making excuses in notes instead of fixing the problem',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: DENIAL,
      field: 'args.description',
      description: 'Denying test failures instead of investigating',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: DENIAL,
      field: 'args.notes',
      description: 'Denying test failures in notes instead of investigating',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: LAZY,
      field: 'args.description',
      description: 'Lazy repetition without variation — try a different approach',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: LAZY,
      field: 'args.notes',
      description: 'Lazy repetition in notes without variation — try a different approach',
    },
    {
      intent: OperationType.READ,
      pattern: OFFTOPIC,
      field: 'args.description',
      description: 'Off-topic behavior detected — stay focused on the task',
    },
    {
      intent: OperationType.READ,
      pattern: OFFTOPIC,
      field: 'args.notes',
      description: 'Off-topic behavior in notes — stay focused on the task',
    },
    {
      intent: OperationType.WRITE,
      pattern: FABR,
      field: 'args.description',
      description: 'Admission of fabrication — all output must be from real tool execution',
    },
    {
      intent: OperationType.WRITE,
      pattern: FABR,
      field: 'args.notes',
      description: 'Admission of fabrication in notes — all output must be from real tool execution',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\b(repeat|again|retry|re-execute|re.try)\b/i,
      field: 'args.task',
      description: 'Detected potential infinite loop or retry without variation',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: LAZY,
      field: 'command',
      description: 'Lazy repetition in command without variation',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\b(will|would)\s+(it|this)\s+(work|pass)\s+(now|this\s+time|again)\b/i,
      field: 'args.description',
      description: 'Superstition-based repetition — evidence required, not hope',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\b(will|would)\s+(it|this)\s+(work|pass)\s+(now|this\s+time|again)\b/i,
      field: 'args.notes',
      description: 'Superstition-based repetition in notes — evidence required, not hope',
    },
  ],
  correction: 'STOP. Read the task. Fix the root cause. Do not repeat the same approach. Container test now.',
  enabled: true,
};
