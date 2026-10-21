import { faker } from '@faker-js/faker';
import type { ModelProfile, ModelsConfig } from '../types';
import { buildMockModelProfile } from './build-mock-model-profile';

interface ModelsConfigOverrides {
  readonly profiles?: Readonly<Record<string, Partial<ModelProfile>>>;
  readonly roles?: Partial<ModelsConfig['roles']>;
}

export function buildMockModelsConfig(overrides: ModelsConfigOverrides = {}): ModelsConfig {
  const profileOverrides = overrides.profiles ?? {
    [faker.helpers.slugify(faker.lorem.words(2))]: {},
  };

  const profiles = Object.fromEntries(
    Object.entries(profileOverrides).map(([id, profile]) => [
      id,
      buildMockModelProfile({ id, ...profile }),
    ]),
  );

  const [first = ''] = Object.keys(profiles);

  return { profiles, roles: { conversation: first, ...overrides.roles } };
}
