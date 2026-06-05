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

export const L5_12_PRIVILEGE_ESCALATION: LayerRule = {
  layer: 'L5.12',
  description: 'Privilege Escalation — blocks sudo, su, chown, chmod 777, passwd, useradd, pkexec, doas, visudo',
  applicableTo: ALL_OPERATIONS,
  patterns: [
    {
      intent: OperationType.EXECUTE,
      pattern: /sudo\s+/i,
      field: 'command',
      description: 'sudo execution — privilege escalation blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /su\s+-/i,
      field: 'command',
      description: 'su execution — user switching blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /chown\s+/i,
      field: 'command',
      description: 'chown — file ownership change blocked',
    },
    {
      intent: OperationType.WRITE,
      pattern: /chmod\s+0?777/i,
      field: 'command',
      description: 'chmod 777 — world-writable permissions blocked',
    },
    {
      intent: OperationType.WRITE,
      pattern: /chmod\s+-R\s+777/i,
      field: 'command',
      description: 'chmod -R 777 — recursive world-writable blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /passwd/i,
      field: 'command',
      description: 'passwd — password change blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /useradd/i,
      field: 'command',
      description: 'useradd — user creation blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /usermod/i,
      field: 'command',
      description: 'usermod — user modification blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /groupadd/i,
      field: 'command',
      description: 'groupadd — group creation blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /pkexec/i,
      field: 'command',
      description: 'pkexec — policy kit escalation blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /doas/i,
      field: 'command',
      description: 'doas — privilege escalation blocked',
    },
    {
      intent: OperationType.EXECUTE,
      pattern: /visudo/i,
      field: 'command',
      description: 'visudo — sudo configuration blocked',
    },
  ],
  correction: 'Privilege escalation is forbidden. All operations run as unprivileged user in sandbox.',
  enabled: true,
};
