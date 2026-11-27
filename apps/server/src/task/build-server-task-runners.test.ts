import { expect, test } from 'bun:test';
import { codingConfigSchema } from '@heynixie/coding';
import { buildServerCoding } from '../coding/build-server-coding';
import { buildServerTaskRunners } from './build-server-task-runners';

function setupTest() {
  const coding = buildServerCoding({
    config: {
      coding: codingConfigSchema.parse({
        atc: {
          url: 'https://atc.example.net',
          principal: 'service:nixie',
          token: 'deployment:atc_token',
          targets: [{ daemon: 'cloud', target: 'cloud' }],
          defaultTarget: 'cloud/cloud',
        },
      }),
      owner: { name: null, pronouns: { they: 'they', their: 'their' } },
    },
    secrets: { atcToken: 'atcs_token-value' },
    log: () => {},
    testGatewayURL: null,
  });

  return { coding: coding?.runner.definition ?? null };
}

test('it holds no coding runner when the deployment sets none', () => {
  const registry = buildServerTaskRunners({ coding: null, isCallsOn: false });

  expect(registry.startable.map((runner) => runner.key)).not.toContain('atc');
});

test('it adds the coding runner to the startable runners, behind the default one, which stays the sandbox runner', () => {
  const ctx = setupTest();
  const registry = buildServerTaskRunners({ coding: ctx.coding, isCallsOn: false });

  expect({
    keys: registry.startable.map((runner) => runner.key),
    defaultKey: registry.defaultRunner.key,
  }).toStrictEqual({ keys: ['sandbox', 'atc'], defaultKey: 'sandbox' });
});
