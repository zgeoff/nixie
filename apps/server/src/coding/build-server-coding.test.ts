import { expect, onTestFinished, test } from 'bun:test';
import { codingConfigSchema } from '@heynixie/coding';
import { startFakeATCGateway } from '@heynixie/coding-atc/test-utils';
import { buildServerCoding } from './build-server-coding';

function setupTest() {
  const coding = codingConfigSchema.parse({
    atc: {
      url: 'https://atc.example.net/mcp',
      principal: 'service:nixie',
      token: 'deployment:atc_token',
      targets: [{ daemon: 'cloud', target: 'cloud' }],
      defaultTarget: 'cloud/cloud',
    },
  });

  return {
    options: {
      config: { coding, owner: { name: null, pronouns: { they: 'they', their: 'their' } } },
      secrets: { atcToken: 'atcs_token-value' },
      log: () => {},
      testGatewayURL: null,
    },
  };
}

test('it builds no coding runner for a deployment that sets no coding section', () => {
  const ctx = setupTest();

  const coding = buildServerCoding({
    ...ctx.options,
    config: { ...ctx.options.config, coding: undefined },
  });

  expect(coding).toBeNull();
});

test('it builds no coding runner for a coding section with no atc block', () => {
  const ctx = setupTest();

  const coding = buildServerCoding({
    ...ctx.options,
    config: { ...ctx.options.config, coding: codingConfigSchema.parse({}) },
  });

  expect(coding).toBeNull();
});

test('it refuses to start when the config names the atc token and the secrets file has none', () => {
  const ctx = setupTest();

  expect(() => buildServerCoding({ ...ctx.options, secrets: { atcToken: null } })).toThrow(
    'coding.atc.token is deployment:atc_token, and the secrets file has no atc_token entry',
  );
});

test('it builds the runner of the adapter atc, which lists the sessions of a configured target through the test gateway', async () => {
  const ctx = setupTest();
  const gateway = startFakeATCGateway({ token: 'atcs_token-value' });

  onTestFinished(() => gateway.stop());

  gateway.addSession({ id: 'cloud.3f9a1c2e.a', name: 'Billing' });

  const coding = buildServerCoding({ ...ctx.options, testGatewayURL: gateway.url });

  const listed = await coding?.adapter.list();

  expect({
    adapter: coding?.adapter.id,
    runner: coding?.runner.definition.key,
    names: listed?.status === 'ok' ? listed.value.map((session) => session.name) : null,
  }).toStrictEqual({ adapter: 'atc', runner: 'atc', names: ['Billing'] });
});

test('it refuses a read of the tasks context before the server binds it', () => {
  const ctx = setupTest();
  const coding = buildServerCoding(ctx.options);

  expect(() => coding?.context.tasks).toThrow('the coding runner ran before the server bound');
});
