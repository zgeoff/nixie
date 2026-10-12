import { faker } from '@faker-js/faker';
import type { ModelProfile, ModelsConfig } from '../types';
import { buildMockModelProfile } from './build-mock-model-profile';

// profiles replaces the default profile: each entry builds from fresh profile defaults, with its
// key as its ID. roles merges into the default role map.
interface ModelsConfigOverrides {
  readonly profiles?: Readonly<Record<string, Partial<ModelProfile>>>;
  readonly roles?: Partial<ModelsConfig['roles']>;
}

// One profile, which the conversation role names. With profiles overridden, the conversation role
// names the first of them.
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
