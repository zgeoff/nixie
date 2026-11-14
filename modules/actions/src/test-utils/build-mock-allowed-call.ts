import type { AllowedCall } from '../types';

export type AllowedCallSeed = Partial<AllowedCall> & Pick<AllowedCall, 'step'>;

// The step has no default: queueing needs a live step lease of the task, and a mock lease fails it.
export function buildMockAllowedCall(overrides: AllowedCallSeed): AllowedCall {
  return {
    tool: 'test.send',
    actionHash: `sha256:${crypto.randomUUID()}`,
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    ...overrides,
  };
}
