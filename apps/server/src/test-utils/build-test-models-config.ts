import type { ModelsConfig } from '@heynixie/models';
import { modelsConfigSchema } from '@heynixie/models';

export interface TestModelsConfigOptions {
  readonly modelURL: string;

  readonly contextTokens?: number;
}

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
