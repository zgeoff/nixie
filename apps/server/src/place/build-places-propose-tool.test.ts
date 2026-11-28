import { expect, test } from 'bun:test';
import { startTestLog } from '@heynixie/log/test-utils';
import { placesProjection, writePlaceAdded } from '@heynixie/policy';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildPlacesProposeTool } from './build-places-propose-tool';

async function setupTest() {
  const started = await startTestLog();

  const log = { ...started.log, projections: [...started.log.projections, placesProjection] };

  const context = {
    log,
    definitions: () => ({ snapshotHash: 'snapshot-1' }),
    runInForce: () => Promise.resolve(),
  };

  const tool = buildPlacesProposeTool(() => context);

  return {
    tool,
    context,
    clear: (places: readonly Record<string, string>[]) =>
      tool.clear?.({ places: [...places] }, buildMockToolContext()),
    run: (places: readonly Record<string, string>[]) =>
      tool.run(
        {
          callID: 'call-1',
          tool: 'places.propose',
          input: { places: [...places] },
          toolUseID: null,
        },
        buildMockToolContext(),
      ),
  };
}

test('it declares the widening of the policy, so it always asks', async () => {
  const ctx = await setupTest();

  expect(ctx.tool.declaration.effects).toStrictEqual(['policy_widen']);
});

test('it refuses a key on a whole public suffix before the card is made', async () => {
  const ctx = await setupTest();
  const sentence = await ctx.clear([{ place: '*.github.io', trust: 'read', why: 'Notes.' }]);

  expect(sentence).toBeString();
});

test('it lets a proposal of real places go to the card', async () => {
  const ctx = await setupTest();

  const sentence = await ctx.clear([
    { place: '*.library.example.org', trust: 'read', why: 'Your library splits its catalog.' },
  ]);

  expect(sentence).toBeNull();
});

test('it reports each place as trusted once the approval has added it', async () => {
  const ctx = await setupTest();

  await writePlaceAdded(ctx.context, {
    key: { kind: 'site', domain: 'tickets.example.com', subdomains: false },
    trust: 'act',
    name: null,
    addedBy: 'proposal',
  });

  const outcome = await ctx.run([
    { place: 'tickets.example.com', trust: 'act', why: 'You book here every week.' },
    { place: 'news.example.net', trust: 'read', why: 'You read it daily.' },
  ]);

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      places: [
        { place: 'tickets.example.com', status: 'trusted', trust: 'act' },
        { place: 'news.example.net', status: 'not_trusted' },
      ],
    },
  });
});
