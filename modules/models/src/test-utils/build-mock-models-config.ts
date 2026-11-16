import { faker } from '@faker-js/faker';
import type { AgentSDKProfile } from '../agent/agent-sdk-harness-definition';
import type { ModelsConfig } from '../types';
import { buildMockModelProfile } from './build-mock-model-profile';

interface ModelsConfigOverrides {
  readonly profiles?: Readonly<Record<string, Partial<AgentSDKProfile>>>;
  readonly roles?: Partial<ModelsConfig['roles']>;
  readonly selectable?: ModelsConfig['selectable'];
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

  return {
    profiles,
    roles: { conversation: first, ...overrides.roles },
    selectable: overrides.selectable ?? [],
    limits: {
      taskRun: { default: { turns: 25, dollars: 2 }, max: { turns: 100, dollars: 10 } },
    },
  };
}
