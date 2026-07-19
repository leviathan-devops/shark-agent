import type { DeterministicRule } from './index.js';
import { detectTheatrical } from './detect-theatrical.js';
import { detectFakeTest } from './detect-fake-test.js';
import { detectWrongContainer } from './detect-wrong-container.js';
import { detectSourceInspection } from './detect-source-inspection.js';
import { detectHostFallback } from './detect-host-fallback.js';
import { detectSuccessClaim } from './detect-success-claim.js';
import { detectModelRestriction } from './detect-model-restriction.js';
import { detectMockStub } from './detect-mock-stub.js';
import { detectSimplification } from './detect-simplification.js';
import { detectConfusionPretense } from './detect-confusion-pretense.js';
import { detectScopeCreep } from './detect-scope-creep.js';
import { detectUndermining } from './detect-undermining.js';
import { detectImpatience } from './detect-impatience.js';
import { detectSelfReference } from './detect-self-reference.js';
import { detectContextualFirewall } from './detect-contextual-firewall.js';

export const ALL_RULES: DeterministicRule[] = [
  detectTheatrical,
  detectFakeTest,
  detectWrongContainer,
  detectSourceInspection,
  detectHostFallback,
  detectSuccessClaim,
  detectModelRestriction,
  detectMockStub,
  detectSimplification,
  detectConfusionPretense,
  detectScopeCreep,
  detectUndermining,
  detectImpatience,
  detectSelfReference,
  detectContextualFirewall,
];

export { isLegitimate } from './detect-legitimate.js';
