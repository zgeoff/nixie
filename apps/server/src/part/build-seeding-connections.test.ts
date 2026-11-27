import { expect, test } from 'bun:test';
import type { Connections, FinishConsentResult } from '@heynixie/connections';
import { buildSeedingConnections } from './build-seeding-connections';

function setupTest() {
  const seeds = { count: 0 };

  const build = (result: FinishConsentResult) => {
    const connections: Pick<Connections, 'finishConsent'> = {
      finishConsent: () => Promise.resolve(result),
    };

    return buildSeedingConnections(connections, () => {
      seeds.count += 1;

      return Promise.resolve();
    });
  };

  const input = { deviceSessionID: 'device-1', state: 'state-1', code: 'code-1', error: null };

  return { seeds, build, input };
}

test('#buildSeedingConnections runs the seed once a consent has finished', async () => {
  const ctx = setupTest();
  const result: FinishConsentResult = { kind: 'finished', connection: 'k3p9m2x7qa', missing: [] };

  const returned = await ctx.build(result).finishConsent(ctx.input);

  expect({ returned, seeds: ctx.seeds.count }).toStrictEqual({ returned: result, seeds: 1 });
});

test('#buildSeedingConnections runs no seed for a consent that did not finish', async () => {
  const ctx = setupTest();

  const returned = await ctx.build({ kind: 'consent_refused' }).finishConsent(ctx.input);

  expect({ returned, seeds: ctx.seeds.count }).toStrictEqual({
    returned: { kind: 'consent_refused' },
    seeds: 0,
  });
});
