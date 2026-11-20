import { expect, onTestFinished, test } from 'bun:test';
import { rebindSecret, seedSecret } from './seed-secret';
import { startImpd } from './start-impd';

async function setupTest() {
  const impd = await startImpd();

  onTestFinished(impd.stop);

  return { impd };
}

test('it holds a secret with one rule for each host', async () => {
  const ctx = await setupTest();

  await seedSecret(ctx.impd, 'model-wide', ['api.anthropic.com', 'example.com']);

  const secrets = await ctx.impd.client.secrets.list();

  expect(secrets.find((secret) => secret.name === 'model-wide')?.rules).toStrictEqual([
    { host: 'api.anthropic.com', header: 'x-api-key', scheme: 'raw' },
    { host: 'example.com', header: 'x-api-key', scheme: 'raw' },
  ]);
});

test('it takes the grant of an imp when it rebinds the secret', async () => {
  const ctx = await setupTest();

  await seedSecret(ctx.impd, 'model-wide', ['api.anthropic.com']);

  await ctx.impd.seedImage('harbour-image');
  await ctx.impd.client.imps.create({ name: 'harbour', image: 'harbour-image' });
  await ctx.impd.client.grants.add({ name: 'harbour', secret: 'model-wide' });

  await rebindSecret(ctx.impd, 'model-wide', ['api.anthropic.com']);

  const grants = await ctx.impd.client.grants.details({ name: 'harbour' });

  expect(grants).toStrictEqual([]);
});
