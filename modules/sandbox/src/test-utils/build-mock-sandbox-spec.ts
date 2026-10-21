import { faker } from '@faker-js/faker';
import type { SandboxLimits, SandboxSpec } from '../types';

export type MockSandboxSpecOverrides = Partial<Omit<SandboxSpec, 'limits'>> & {
  readonly limits?: Partial<SandboxLimits>;
};

export function buildMockSandboxSpec(overrides: MockSandboxSpecOverrides = {}): SandboxSpec {
  const { limits, ...rest } = overrides;

  return {
    kind: 'worker',
    image: faker.string.alphanumeric({ length: 12, casing: 'lower' }),
    owner: `${faker.string.uuid()}:${faker.string.uuid()}`,
    egress: { kind: 'none' },
    grants: [],
    toolRoute: true,
    ...rest,
    limits: {
      vcpus: faker.number.int({ min: 1, max: 8 }),
      memoryMiB: faker.number.int({ min: 256, max: 8192 }),
      diskMiB: faker.number.int({ min: 4096, max: 16_384 }),
      ...limits,
    },
  };
}
