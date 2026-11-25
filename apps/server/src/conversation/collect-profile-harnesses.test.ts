import { expect, test } from 'bun:test';
import { modelsConfigSchema } from '@heynixie/models';
import { collectProfileHarnesses } from './collect-profile-harnesses';

test('it collects the harness of each profile once', () => {
  const profile = {
    base_url: 'https://models.example.test',
    credential: 'deployment:anthropic',
    auth_header: 'x-api-key',
    model: 'claude-test-1',
    effort: 'low',
    prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
  };

  const models = modelsConfigSchema.parse({
    profiles: {
      chat: { harness: 'agent-sdk', ...profile },
      fast: { harness: 'agent-sdk', ...profile },
    },
    roles: { conversation: 'chat' },
  });

  expect(collectProfileHarnesses(models)).toStrictEqual(['agent-sdk']);
});
