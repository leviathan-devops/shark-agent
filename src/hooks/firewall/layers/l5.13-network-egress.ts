import type { LayerRule } from '../types.js';
import { OperationType } from '../types.js';

const ALL_OPERATIONS: OperationType[] = [
  OperationType.READ,
  OperationType.WRITE,
  OperationType.EXECUTE,
  OperationType.TEST,
  OperationType.INSPECT,
  OperationType.CONTAINER,
  OperationType.BUILD,
  OperationType.CROSS_AGENT,
  OperationType.SYSTEM,
];

export const L5_13_NETWORK_EGRESS: LayerRule = {
  layer: 'L5.13',
  description: 'Network Egress — blocks curl/wget/nc/ssh to external hosts',
  applicableTo: ALL_OPERATIONS,
  patterns: [
    {
      intent: OperationType.EXECUTE,
      pattern: /curl\s+(https?:\/\/|http:\/\/)/i,
      field: 'command',
      description: 'curl to external URL — network egress blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /wget\s+(https?:\/\/|http:\/\/)/i,
      field: 'command',
      description: 'wget to external URL — network egress blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /nc\s+-[a-z]*[ev]\s+\d{1,3}\.\d{1,3}\./i,
      field: 'command',
      description: 'netcat to external IP — network egress blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /ssh\s+[^@]+@\d{1,3}\.\d{1,3}/i,
      field: 'command',
      description: 'SSH to external host — network egress blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /telnet\s+\d{1,3}\.\d{1,3}\./i,
      field: 'command',
      description: 'telnet to external IP — network egress blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /curl\s+-[^-]*[^-]*\s+-[^-]*[^-]*\s+(https?:\/\/|http:\/\/)/i,
      field: 'command',
      description: 'curl with flags to external URL — network egress blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /curl\s+-[^-]*s\s+(https?:\/\/|http:\/\/)/i,
      field: 'command',
      description: 'curl silent to external URL — network egress blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\bcurl\s+[a-zA-Z0-9]+\.[a-zA-Z]{2,}/i,
      field: 'command',
      description: 'curl to domain name — network egress blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /\bwget\s+[a-zA-Z0-9]+\.[a-zA-Z]{2,}/i,
      field: 'command',
      description: 'wget to domain name — network egress blocked',
    },
  ],
  correction: 'Network egress is forbidden. All operations run in isolated sandbox without external network access.',
  enabled: true,
};
