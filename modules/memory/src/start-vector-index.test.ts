import { expect, mock, onTestFinished, test } from 'bun:test';
import { makeGatedCall } from '@heynixie/testing';
import { startVectorIndex } from './start-vector-index';
import { buildStubEncoder } from './test-utils/build-stub-encoder';
import type { Encoder } from './types';

function setupTest(encoder: Encoder) {
  const onError = mock<(error: unknown) => void>();
  const index = startVectorIndex(encoder, onError);

  onTestFinished(() => index.stop());

  return { index, onError };
}

test('it ranks items by their similarity to the query once the rebuild ends', async () => {
  const ctx = setupTest(
    buildStubEncoder([['sister', 'sibling'], ['leeds'], ['boiler', 'heating']]),
  );

  const isReady = await ctx.index.rebuild([
    { itemID: 'item-sister', text: 'Ana is my sister' },
    { itemID: 'item-leeds', text: 'My sister moved to Leeds in spring' },
    { itemID: 'item-boiler', text: 'The boiler service is on the 14th' },
  ]);

  const matches = await ctx.index.readMatches('does my sibling live in leeds', {
    limit: 5,
    minSimilarity: 0.5,
  });

  expect(isReady).toBeTrue();

  expect(matches).toStrictEqual([
    { itemID: 'item-leeds', similarity: expect.toBeWithin(0.99, 1.02) },
    { itemID: 'item-sister', similarity: expect.toBeWithin(0.7, 0.72) },
  ]);
});

test('it answers null, so search falls back to keywords, while the first rebuild runs', async () => {
  const gated = makeGatedCall(buildStubEncoder([['sister', 'sibling']]).encode);
  const ctx = setupTest({ encode: gated.call });
  const rebuilt = ctx.index.rebuild([{ itemID: 'item-sister', text: 'Ana is my sister' }]);

  await gated.started;

  const matches = await ctx.index.readMatches('my sibling', { limit: 5, minSimilarity: 0.5 });

  gated.release();

  await rebuilt;

  expect(matches).toBeNull();
});

test('it answers null before any rebuild starts', () => {
  const ctx = setupTest(buildStubEncoder([['sister', 'sibling']]));

  expect(ctx.index.readMatches('my sibling', { limit: 5, minSimilarity: 0.5 })).resolves.toBeNull();
});

test('it leaves out a match below the floor and an excluded item', async () => {
  const ctx = setupTest(buildStubEncoder([['sister', 'sibling'], ['leeds'], ['spring']]));

  await ctx.index.rebuild([
    { itemID: 'item-sister', text: 'Ana is my sister' },
    { itemID: 'item-cousin', text: 'My sister has a cousin in Leeds who moved in spring' },
    { itemID: 'item-sibling', text: 'My sibling is called Ana' },
  ]);

  const matches = await ctx.index.readMatches('my sister', {
    limit: 5,
    minSimilarity: 0.9,
    excludedIDs: ['item-sibling'],
  });

  expect(matches).toStrictEqual([
    { itemID: 'item-sister', similarity: expect.toBeWithin(0.99, 1.02) },
  ]);
});

test('it keeps the limit of best matches', async () => {
  const ctx = setupTest(buildStubEncoder([['sister', 'sibling'], ['leeds']]));

  await ctx.index.rebuild([
    { itemID: 'item-sister', text: 'Ana is my sister' },
    { itemID: 'item-leeds', text: 'My sister lives in Leeds' },
  ]);

  const matches = await ctx.index.readMatches('my sibling', { limit: 1, minSimilarity: 0 });

  expect(matches).toStrictEqual([
    { itemID: 'item-sister', similarity: expect.toBeWithin(0.99, 1.02) },
  ]);
});

test('it finds no match for a blank query', async () => {
  const ctx = setupTest(buildStubEncoder([['sister', 'sibling']]));

  await ctx.index.rebuild([{ itemID: 'item-sister', text: 'Ana is my sister' }]);

  expect(ctx.index.readMatches('  ', { limit: 5, minSimilarity: -1 })).resolves.toStrictEqual([]);
});

test('it encodes an updated item from its new text', async () => {
  const ctx = setupTest(
    buildStubEncoder([
      ['sister', 'sibling'],
      ['boiler', 'heating'],
    ]),
  );

  await ctx.index.rebuild([{ itemID: 'item-1', text: 'Ana is my sister' }]);

  ctx.index.update({ itemID: 'item-1', text: 'The boiler service is on the 14th' });

  await ctx.index.waitForIdle();

  const matches = await ctx.index.readMatches('when is the heating looked at', {
    limit: 5,
    minSimilarity: 0.5,
  });

  expect(matches).toStrictEqual([{ itemID: 'item-1', similarity: expect.toBeWithin(0.99, 1.02) }]);
});

test('it drops a removed item', async () => {
  const ctx = setupTest(buildStubEncoder([['sister', 'sibling']]));

  await ctx.index.rebuild([{ itemID: 'item-sister', text: 'Ana is my sister' }]);

  ctx.index.remove('item-sister');

  expect(
    ctx.index.readMatches('my sibling', { limit: 5, minSimilarity: 0.5 }),
  ).resolves.toStrictEqual([]);
});

test('it discards an encoding that ends after its item was removed', async () => {
  const gated = makeGatedCall(buildStubEncoder([['sister', 'sibling']]).encode);
  const ctx = setupTest({ encode: gated.call });

  const rebuilt = ctx.index.rebuild([
    { itemID: 'item-sister', text: 'Ana is my sister' },
    { itemID: 'item-sibling', text: 'My sibling is called Ana' },
  ]);

  await gated.started;

  ctx.index.remove('item-sister');
  gated.release();

  await rebuilt;

  const matches = await ctx.index.readMatches('my sister', { limit: 5, minSimilarity: 0.5 });

  expect(matches).toStrictEqual([
    { itemID: 'item-sibling', similarity: expect.toBeWithin(0.99, 1.02) },
  ]);
});

test('it keeps an update that lands while the rebuild encodes the older text', async () => {
  const gated = makeGatedCall(
    buildStubEncoder([
      ['sister', 'sibling'],
      ['boiler', 'heating'],
    ]).encode,
  );

  const ctx = setupTest({ encode: gated.call });
  const rebuilt = ctx.index.rebuild([{ itemID: 'item-1', text: 'Ana is my sister' }]);

  await gated.started;

  ctx.index.update({ itemID: 'item-1', text: 'The boiler service is on the 14th' });
  gated.release();

  await rebuilt;

  await ctx.index.waitForIdle();

  const matches = await ctx.index.readMatches('my sister', { limit: 5, minSimilarity: 0.5 });

  expect(matches).toStrictEqual([]);
});

test('it counts only the first 256 numbers of each vector', async () => {
  const item = Float32Array.from({ length: 512 }, (_, index) => (index < 256 ? 1 : -1));
  const query = Float32Array.from({ length: 512 }, () => 1);

  const ctx = setupTest({
    encode: (texts, kind) => Promise.resolve(texts.map(() => (kind === 'query' ? query : item))),
  });

  await ctx.index.rebuild([{ itemID: 'item-1', text: 'Ana is my sister' }]);

  expect(ctx.index.readMatches('my sister', { limit: 5, minSimilarity: 0 })).resolves.toStrictEqual(
    [{ itemID: 'item-1', similarity: expect.toBeWithin(0.95, 1.01) }],
  );
});

test('it reports a failed rebuild and stays on keywords', async () => {
  const failure = new Error('the model file is unreadable');

  const ctx = setupTest({ encode: () => Promise.reject(failure) });

  const isReady = await ctx.index.rebuild([{ itemID: 'item-1', text: 'Ana is my sister' }]);
  const matches = await ctx.index.readMatches('my sister', { limit: 5, minSimilarity: 0 });

  expect(isReady).toBeFalse();
  expect(matches).toBeNull();
  expect(ctx.onError).toHaveBeenCalledExactlyOnceWith(failure);
});

test('it reports a failed update and leaves the item out', async () => {
  const failure = new Error('the model file is unreadable');

  const stub = buildStubEncoder([['sister', 'sibling']]);

  const ctx = setupTest({
    encode: (texts, kind) =>
      kind === 'document' && texts.length === 1
        ? Promise.reject(failure)
        : stub.encode(texts, kind),
  });

  await ctx.index.rebuild([
    { itemID: 'item-1', text: 'Ana is my sister' },
    { itemID: 'item-2', text: 'My sibling is called Ana' },
  ]);

  ctx.index.update({ itemID: 'item-1', text: 'Ana is my older sister' });

  await ctx.index.waitForIdle();

  const matches = await ctx.index.readMatches('my sister', { limit: 5, minSimilarity: 0.5 });

  expect(matches).toStrictEqual([{ itemID: 'item-2', similarity: expect.toBeWithin(0.99, 1.02) }]);
  expect(ctx.onError).toHaveBeenCalledExactlyOnceWith(failure);
});

test('it answers null after it stops', async () => {
  const ctx = setupTest(buildStubEncoder([['sister', 'sibling']]));

  await ctx.index.rebuild([{ itemID: 'item-1', text: 'Ana is my sister' }]);
  await ctx.index.stop();

  expect(ctx.index.readMatches('my sister', { limit: 5, minSimilarity: 0 })).resolves.toBeNull();
});
