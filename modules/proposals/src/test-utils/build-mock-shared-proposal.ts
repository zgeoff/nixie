import { faker } from '@faker-js/faker';
import type { SharedProposal } from '../answer/proposal-kind-handler';

export function buildMockSharedProposal(overrides: Partial<SharedProposal> = {}): SharedProposal {
  const createdAt = faker.date.past().getTime();

  return {
    id: crypto.randomUUID(),
    shortID: faker.string.alphanumeric({ length: 10, casing: 'lower' }),
    family: 'action',
    kind: 'action',
    riskClass: 'routine',
    actionHash: `sha256:${faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' })}`,
    ruleHash: null,
    cause: 'no_rule',
    taskID: null,
    thread: 'conversation',
    createdSequence: faker.number.int({ min: 1, max: 10_000 }),
    createdAt,
    lapsesAt: createdAt + 72 * 60 * 60 * 1000,
    deadlineAt: null,
    state: 'pending',
    usedBy: null,
    deferGeneration: 0,
    deferUntil: null,
    returnAt: null,
    ...overrides,
  };
}
