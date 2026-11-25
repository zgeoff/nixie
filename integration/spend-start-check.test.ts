import { expect, onTestFinished, test } from 'bun:test';
import { makeKeyedFetch } from '@heynixie/egress/test-utils';
import { startTestModelGateway } from '@heynixie/model-gateway/test-utils';
import { checkSpendStart, createPlanLoginsHolder } from '@heynixie/spend';
import { createSpendGateway } from '@heynixie/spend-model-gateway';
import { startScriptedModel } from '@heynixie/testing';
import invariant from 'tiny-invariant';

async function setupTest() {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const gateway = await startTestModelGateway({
    upstreamURL: model.url,
    periods: {
      zone: 'Europe/London',
      countBySandbox: true,
    },
  });

  const spend = createSpendGateway({
    url: gateway.control.url,
    fetch: makeKeyedFetch('authorization', `Bearer ${gateway.control.token}`),
  });

  const options = {
    gateway: spend,
    planLogins: createPlanLoginsHolder(),
    defaultZone: 'Europe/London',
    credentialCount: 0,
    pathProfileIDs: [],
    log: () => {},
  };

  return { spend, options };
}

test('it finds a gateway in the default zone, which holds a limit for its route', async () => {
  const ctx = await setupTest();
  const result = await checkSpendStart(ctx.options);
  const status = await ctx.spend.readStatus();

  invariant(status.kind === 'ok');

  expect([result, status.value.routes['scripted']?.day.limit]).toStrictEqual(['answered', 100]);
});

test('it refuses to start when the gateway counts its periods in another zone', async () => {
  const ctx = await setupTest();

  const started = checkSpendStart({ ...ctx.options, defaultZone: 'Australia/Sydney' });

  expect(started).rejects.toThrow(/Europe\/London.*Australia\/Sydney/u);
});
