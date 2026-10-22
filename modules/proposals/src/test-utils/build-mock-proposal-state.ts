import { faker } from '@faker-js/faker';
import type { ProposalState } from '../types';

export function buildMockProposalState(overrides: Partial<ProposalState> = {}): ProposalState {
  return {
    proposalID: faker.string.alphanumeric({ length: 10, casing: 'lower' }),
    thread: faker.string.alphanumeric({ length: 12, casing: 'lower' }),
    proposedAt: faker.date.past().getTime(),
    outcome: null,
    ...overrides,
  };
}
