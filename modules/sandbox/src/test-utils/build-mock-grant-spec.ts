import { faker } from '@faker-js/faker';
import type { GrantSpec } from '../types';

// A grant for one host, with one placeholder in its env.
export function buildMockGrantSpec(overrides: Partial<GrantSpec> = {}): GrantSpec {
  return {
    secret: faker.string.alphanumeric({ length: 12, casing: 'lower' }),
    host: faker.internet.domainName(),
    env: { API_KEY: faker.string.uuid() },
    ...overrides,
  };
}
