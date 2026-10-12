import type { Provenance } from '../types';

// Your own action in the client: you as origin and source, with no task, proposal or checks.
export function buildMockProvenance(overrides: Partial<Provenance> = {}): Provenance {
  return {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
    ...overrides,
  };
}
