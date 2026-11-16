import { faker } from '@faker-js/faker';
import type { CodexProfile } from '../codex/codex-harness-definition';

export function buildMockCodexProfile(overrides: Partial<CodexProfile> = {}): CodexProfile {
  return {
    id: faker.helpers.slugify(faker.lorem.words(2)),
    harness: 'codex',
    baseURL: faker.internet.url({ protocol: 'https', appendSlash: false }),
    credential: `deployment:${faker.lorem.word()}`,
    model: `${faker.lorem.word()}-${faker.number.int({ min: 1, max: 9 })}`,
    effort: 'medium',
    prices: null,
    ...overrides,
  };
}
