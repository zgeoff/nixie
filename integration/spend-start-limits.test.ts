import { expect, onTestFinished, test } from 'bun:test';
import { startTestModelGateway } from '@heynixie/model-gateway/test-utils';
import { startSpendLimits } from '@heynixie/spend';
import { createSpendGateway } from '@heynixie/spend-model-gateway';
import { startScriptedModel } from '@heynixie/testing';
import invariant from 'tiny-invariant';

async function setupTest() {
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const stopping = new AbortController();

  onTestFinished(() => stopping.abort());

  const gateway = await startTestModelGateway({
    upstreamURL: model.url,
    periods: {
      zone: 'Europe/London',
      countBySandbox: true,
    },
  });

  invariant(gateway.control);

  const spend = createSpendGateway({ url: gateway.control.url, token: gateway.control.token });

  const options = {
    gateway: spend,
    limits: {
      day: { dollars: 60, tokens: 80_000_000 },
      month: { dollars: 600, tokens: 600_000_000 },
    },
    defaultZone: 'Europe/London',
    credentialCount: 0,
    pathProfileIDs: [],
    log: () => {},
    signal: stopping.signal,
  };

  return { spend, options };
}

test('it sets the limits of a gateway in the default zone, which the status then holds in force', async () => {
  const ctx = await setupTest();

  await startSpendLimits(ctx.options);

  const status = await ctx.spend.readStatus();

  invariant(status.kind === 'ok');

  expect(status.value.periods.day.limit).toStrictEqual({ dollars: 60, tokens: 80_000_000 });
});

test('it refuses to start when the gateway counts its periods in another zone', async () => {
  const ctx = await setupTest();

  const started = startSpendLimits({ ...ctx.options, defaultZone: 'Australia/Sydney' });

  expect(started).rejects.toThrow(/Europe\/London.*Australia\/Sydney/u);
});

test('it refuses to start when the day limit is above the gateway cap, and names the cap', async () => {
  const ctx = await setupTest();

  const started = startSpendLimits({
    ...ctx.options,
    limits: { ...ctx.options.limits, day: { dollars: 500, tokens: 80_000_000 } },
  });

  expect(started).rejects.toThrow(/cap of 120 dollars and 160000000 tokens/u);
});
