import { faker } from '@faker-js/faker';
import type { CheckerAnswer } from '@heynixie/models';

// An answer that confirms the write, with a reason and the checker's model ID.
export function buildMockCheckerAnswer(overrides: Partial<CheckerAnswer> = {}): CheckerAnswer {
  return {
    verdict: 'asserted',
    reason: faker.lorem.sentence(),
    model: `claude-${faker.lorem.word()}-${String(faker.number.int({ min: 1, max: 9 }))}`,
    failure: null,
    ...overrides,
  };
}
