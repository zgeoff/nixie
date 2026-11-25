import { expect, test } from 'bun:test';
import { deploymentConfigSchema } from './deployment-config-schema';

function setupTest() {
  const prices = { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 };

  const profiles = {
    'chat-direct': {
      harness: 'agent-sdk',
      base_url: 'https://api.anthropic.com',
      credential: 'deployment:anthropic',
      auth_header: 'x-api-key',
      model: 'claude-test-1',
      effort: 'medium',
    },
    'codex-plan': {
      harness: 'codex',
      base_url: 'https://chatgpt.com',
      credential: 'deployment:codex-plan',
      model: 'model-o',
      effort: 'low',
      chatgpt_login: true,
    },
  };

  const buildConfig = (
    extra: Record<string, unknown>,
    chosen: Record<string, unknown>,
    codex: Record<string, unknown> = {},
  ) => ({
    models: {
      profiles: {
        'chat-direct': { ...profiles['chat-direct'], ...chosen },
        'codex-plan': { ...profiles['codex-plan'], ...chosen, ...codex },
      },
      roles: { conversation: 'chat-direct', task: 'codex-plan' },
    },
    imp: { url: 'http://127.0.0.1:7070', host_addresses: ['192.0.2.10/32'] },
    definitions: { source: { kind: 'path', path: '/etc/nixie/definitions' } },
    ...extra,
  });

  return {
    // a deployment with no gateway prices each call itself
    buildPricedConfig: (extra: Record<string, unknown>, codex: Record<string, unknown> = {}) =>
      buildConfig(extra, { prices }, codex),

    buildBareConfig: (codex: Record<string, unknown>) => buildConfig({}, {}, codex),

    // a deployment with a gateway takes each model's prices from the route
    buildGatewayConfig: (chosen: Record<string, unknown> = {}) =>
      buildConfig(
        {
          spendStop: {
            control: 'http://127.0.0.1:18091',
            token: 'deployment:gateway-control',
            modelURL: 'http://127.0.0.1:18090',
          },
        },
        chosen,
      ),
    prices,
  };
}

test('it rejects a plan profile when the config has no spendStop section, and names the profile', () => {
  const ctx = setupTest();
  const result = deploymentConfigSchema.safeParse(ctx.buildPricedConfig({}));

  expect(result.error?.issues.map((issue) => issue.path.join('.'))).toStrictEqual([
    'models.profiles.codex-plan.chatgpt_login',
  ]);
});

test('it reads a plan profile when the config has a spendStop section and the profiles set no prices', () => {
  const ctx = setupTest();
  const result = deploymentConfigSchema.safeParse(ctx.buildGatewayConfig());

  expect(result.success).toBeTrue();
});

test('it reads a codex API key profile when the config has no spendStop section', () => {
  const ctx = setupTest();

  const result = deploymentConfigSchema.safeParse(
    ctx.buildPricedConfig({}, { chatgpt_login: false }),
  );

  expect(result.success).toBeTrue();
});

test('it rejects a profile that sets prices beside a spendStop section, and names the route prices', () => {
  const ctx = setupTest();
  const result = deploymentConfigSchema.safeParse(ctx.buildGatewayConfig({ prices: ctx.prices }));

  expect(
    result.error?.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  ).toStrictEqual([
    {
      path: 'models.profiles.chat-direct.prices',
      message: expect.stringContaining("the gateway route's prices"),
    },
    {
      path: 'models.profiles.codex-plan.prices',
      message: expect.stringContaining("the gateway route's prices"),
    },
  ]);
});

test('it rejects a task role whose profile sets no prices when the config has no spendStop section', () => {
  const ctx = setupTest();
  const result = deploymentConfigSchema.safeParse(ctx.buildBareConfig({ chatgpt_login: false }));

  expect(result.error?.issues.map((issue) => issue.path.join('.'))).toStrictEqual([
    'models.roles.task',
  ]);
});
