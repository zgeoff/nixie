import type { ModelsConfig } from '@heynixie/models';
import { modelsConfigSchema } from '@heynixie/models';

export interface TestModelsConfigOptions {
  readonly modelURL: string;

  // the profile's context window, which the profile leaves unset when this is absent
  readonly contextTokens?: number;
}

// Builds a models config whose conversation role runs on one profile, chat-direct, that points
// at the scripted model with a placeholder deployment credential.
export function buildTestModelsConfig(options: TestModelsConfigOptions): ModelsConfig {
  return modelsConfigSchema.parse({
    profiles: {
      'chat-direct': {
        base_url: options.modelURL,
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'low',
        ...(options.contextTokens === undefined ? {} : { context_tokens: options.contextTokens }),
      },
    },
    roles: { conversation: 'chat-direct' },
  });
}
