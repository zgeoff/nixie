import { faker } from '@faker-js/faker';
import type { ModelProfile } from '../types';

// A direct profile that sends its key in the x-api-key header, with no provider pin and no prices.
export function buildMockModelProfile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: faker.helpers.slugify(faker.lorem.words(2)),
    baseURL: faker.internet.url({ protocol: 'https', appendSlash: false }),
    credential: `deployment:${faker.lorem.word()}`,
    authHeader: 'x-api-key',
    model: `${faker.lorem.word()}-${faker.number.int({ min: 1, max: 9 })}`,
    effort: 'medium',
    providerPin: null,
    prices: null,
    ...overrides,
  };
}
