import type { LayerRule } from '../types.js';
import { OperationType } from '../types.js';

export const L0_IDENTITY: LayerRule = {
  layer: 'L0',
  description: 'Identity Wall — enforced via guardian-hook.ts agent detection at tool.execute.before: sessionAgent check + isShark check at line 210. Non-Shark agents are rejected before the layer engine runs. This layer exists for firewall counting (24 layers) but does NO pattern matching — all enforcement is at the hook level.',
  applicableTo: [OperationType.SYSTEM],
  toolGate: ['__nonexistent_tool__'],
  patterns: [
    { intent: OperationType.SYSTEM, pattern: /^\b\B$/, field: 'command', description: 'Never matches — L0 identity enforced at hook level before layer engine' },
  ],
  correction: 'Non-Shark agents are blocked at guardian hook entry. If you are a Shark agent and seeing this, the sessionAgent detection failed.',
  enabled: true,
};
