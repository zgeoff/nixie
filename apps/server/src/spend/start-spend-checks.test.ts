import { expect, mock, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import { buildMockModelsConfig } from '@heynixie/models/test-utils';
import { createPlanLoginsHolder } from '@heynixie/spend';
import { buildStubSpendGateway } from '@heynixie/spend/test-utils';
import invariant from 'tiny-invariant';
import { startSpendChecks } from './start-spend-checks';

test('it calls no gateway when the config sets no spendStop', async () => {
  const log = mock<Logger>(() => {});

  const result = await startSpendChecks({
    spend: null,
    config: { models: buildMockModelsConfig(), time: { default_zone: 'UTC' } },
    secrets: { models: { model_credentials: { anthropic: 'not-a-real-key' } } },
    log,
  });

  expect([result, log.mock.calls]).toStrictEqual(['off', []]);
});

test('it sends the day and month limits of the models config to the gateway', async () => {
  const gateway = buildStubSpendGateway();

  await startSpendChecks({
    spend: {
      control: 'http://127.0.0.1:8790',
      token: 'a-token',
      modelURL: 'http://127.0.0.1:8789',
      gateway,
      planLogins: createPlanLoginsHolder(),
    },
    config: { models: buildMockModelsConfig(), time: { default_zone: 'UTC' } },
    secrets: { models: {} },
    log: () => {},
  });

  expect(gateway.putLimits.mock.calls).toStrictEqual([
    [
      {
        day: { dollars: 60, tokens: 80_000_000 },
        month: { dollars: 600, tokens: 600_000_000 },
      },
    ],
  ]);
});

test('it refuses to start with a model credential in the secrets file', () => {
  const gateway = buildStubSpendGateway();

  const started = startSpendChecks({
    spend: {
      control: 'http://127.0.0.1:8790',
      token: 'a-token',
      modelURL: 'http://127.0.0.1:8789',
      gateway,
      planLogins: createPlanLoginsHolder(),
    },
    config: { models: buildMockModelsConfig(), time: { default_zone: 'UTC' } },
    secrets: { models: { model_credentials: { anthropic: 'not-a-real-key' } } },
    log: () => {},
  });

  expect(started).rejects.toThrow(/model_credentials/u);
});

test('it refuses to start when a profile base URL has a path', () => {
  const gateway = buildStubSpendGateway();
  const models = buildMockModelsConfig();
  const [id, profile] = Object.entries(models.profiles)[0] ?? [];

  invariant(id !== undefined && profile !== undefined);

  const started = startSpendChecks({
    spend: {
      control: 'http://127.0.0.1:8790',
      token: 'a-token',
      modelURL: 'http://127.0.0.1:8789',
      gateway,
      planLogins: createPlanLoginsHolder(),
    },
    config: {
      models: {
        ...models,
        profiles: {
          ...models.profiles,
          [id]: { ...profile, baseURL: 'https://models.example.test/anthropic' },
        },
      },
      time: { default_zone: 'UTC' },
    },
    secrets: { models: {} },
    log: () => {},
  });

  expect(started).rejects.toThrow(new RegExp(`fix ${id}`, 'u'));
});

test('it says the limits are sent when the gateway takes them', async () => {
  const gateway = buildStubSpendGateway();

  const result = await startSpendChecks({
    spend: {
      control: 'http://127.0.0.1:8790',
      token: 'a-token',
      modelURL: 'http://127.0.0.1:8789',
      gateway,
      planLogins: createPlanLoginsHolder(),
    },
    config: { models: buildMockModelsConfig(), time: { default_zone: 'UTC' } },
    secrets: { models: {} },
    log: () => {},
  });

  expect(result).toBe('sent');
});

test('it says the limits are unsent when the gateway does not answer', async () => {
  const gateway = buildStubSpendGateway();

  gateway.putLimits.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const result = await startSpendChecks({
    spend: {
      control: 'http://127.0.0.1:8790',
      token: 'a-token',
      modelURL: 'http://127.0.0.1:8789',
      gateway,
      planLogins: createPlanLoginsHolder(),
    },
    config: { models: buildMockModelsConfig(), time: { default_zone: 'UTC' } },
    secrets: { models: {} },
    log: () => {},
  });

  expect(result).toBe('unsent');
});
