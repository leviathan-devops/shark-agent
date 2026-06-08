import type { LayerRule } from '../types.js';
import { OperationType } from '../types.js';

export const L0_CONTAINER_ESCAPE: LayerRule = {
  layer: 'L5.19',
  analysisOrder: 1,
  description: 'Container Escape Prevention — blocks privileged containers, host mounts, kernel module loading, namespace escapes, and systemd/service manipulation',
  applicableTo: [OperationType.SYSTEM, OperationType.EXECUTE],
  toolGate: ['bash', 'terminal'],
  patterns: [
    { intent: OperationType.SYSTEM, pattern: /docker\s+run.*--privileged/i, field: 'command', description: 'Privileged container — host escape vector' },
    { intent: OperationType.SYSTEM, pattern: /docker\s+run.*-v\s+\/:/i, field: 'command', description: 'Host filesystem mount' },
    { intent: OperationType.SYSTEM, pattern: /docker\s+run.*\/var\/run\/docker\.sock/i, field: 'command', description: 'Docker socket mount — host escape vector' },
    { intent: OperationType.SYSTEM, pattern: /nsenter\s+/i, field: 'command', description: 'Namespace entry — container breakout' },
    { intent: OperationType.SYSTEM, pattern: /\/proc\/1\/root/i, field: 'command', description: 'Host root access from container' },
    { intent: OperationType.SYSTEM, pattern: /chroot\s+/i, field: 'command', description: 'chroot — container breakout' },
    { intent: OperationType.SYSTEM, pattern: /\bmodprobe\b/i, field: 'command', description: 'Kernel module loading' },
    { intent: OperationType.SYSTEM, pattern: /systemctl\s+(start|stop|restart)/i, field: 'command', description: 'System service control' },
  ],
  correction: 'ALL operations must remain sandboxed. No host access, no privileged containers, no kernel modifications. Test inside shark-spawn-container.',
  enabled: true,
};
