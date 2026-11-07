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
        harness: 'agent-sdk',
        base_url: options.modelURL,
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'low',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
        ...(options.contextTokens === undefined ? {} : { context_tokens: options.contextTokens }),
      },
    },
    roles: { conversation: 'chat-direct' },
  });
}
