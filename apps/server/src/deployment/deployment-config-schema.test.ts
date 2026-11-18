import { expect, test } from 'bun:test';
import { deploymentConfigSchema } from './deployment-config-schema';

function setupTest() {
  const prices = { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 };

  return {
    buildConfig: (extra: Record<string, unknown>) => ({
      models: {
        profiles: {
          'chat-direct': {
            harness: 'agent-sdk',
            base_url: 'https://api.anthropic.com',
            credential: 'deployment:anthropic',
            auth_header: 'x-api-key',
            model: 'claude-test-1',
            effort: 'medium',
            prices,
          },
          'codex-plan': {
            harness: 'codex',
            base_url: 'https://chatgpt.com',
            credential: 'deployment:codex-plan',
            model: 'model-o',
            effort: 'low',
            prices,
            chatgpt_login: true,
          },
        },
        roles: { conversation: 'chat-direct', task: 'codex-plan' },
      },
      imp: { url: 'http://127.0.0.1:7070', host_addresses: ['192.0.2.10/32'] },
      definitions: { source: { kind: 'path', path: '/etc/nixie/definitions' } },
      ...extra,
    }),
    spendStop: {
      control: 'http://127.0.0.1:18091',
      token: 'deployment:gateway-control',
      modelURL: 'http://127.0.0.1:18090',
    },
  };
}

test('it rejects a plan profile when the config has no spendStop section, and names the profile', () => {
  const ctx = setupTest();
  const result = deploymentConfigSchema.safeParse(ctx.buildConfig({}));

  expect(result.error?.issues.map((issue) => issue.path.join('.'))).toStrictEqual([
    'models.profiles.codex-plan.chatgpt_login',
  ]);
});

test('it reads a plan profile when the config has a spendStop section', () => {
  const ctx = setupTest();
  const result = deploymentConfigSchema.safeParse(ctx.buildConfig({ spendStop: ctx.spendStop }));

  expect(result.success).toBeTrue();
});

test('it reads a codex API key profile when the config has no spendStop section', () => {
  const ctx = setupTest();
  const config = ctx.buildConfig({});

  const result = deploymentConfigSchema.safeParse({
    ...config,
    models: {
      ...config.models,
      profiles: {
        ...config.models.profiles,
        'codex-plan': { ...config.models.profiles['codex-plan'], chatgpt_login: false },
      },
    },
  });

  expect(result.success).toBeTrue();
});
