import { faker } from '@faker-js/faker';
import type { HarnessProfile } from '../types';

export function buildMockModelProfile(overrides: Partial<HarnessProfile> = {}): HarnessProfile {
  return {
    id: faker.helpers.slugify(faker.lorem.words(2)),
    harness: 'agent-sdk',
    baseURL: faker.internet.url({ protocol: 'https', appendSlash: false }),
    credential: `deployment:${faker.lorem.word()}`,
    authHeader: 'x-api-key',
    model: `${faker.lorem.word()}-${faker.number.int({ min: 1, max: 9 })}`,
    effort: 'medium',
    providerPin: null,
    contextTokens: null,
    cacheTTL: '5m',
    prices: null,
    ...overrides,
  };
}
