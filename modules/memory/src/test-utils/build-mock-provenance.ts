import type { Provenance } from '../types';

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
