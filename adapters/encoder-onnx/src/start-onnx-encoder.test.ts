import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords } from '@heynixie/log';
import { createMemoryItem, startTestMemory } from '@heynixie/memory/test-utils';
import { startONNXEncoder } from './start-onnx-encoder';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip. The model files come from `bun run
// models`, which `bun run test` runs first, so a plain `bun test` without them skips these tests and
// CI, which always has them, never does.
const isModelMissing =
  !(await Bun.file(
    join(import.meta.dir, '../../../node_modules/.cache/nixie-encoder/tokenizer.json'),
  ).exists()) && process.env['CI'] === undefined;

async function setupTest() {
  const encoder = await startONNXEncoder(
    join(import.meta.dir, '../../../node_modules/.cache/nixie-encoder'),
  );

  onTestFinished(() => encoder.stop());

  return { encoder };
}

test.skipIf(isModelMissing)(
  'it encodes each text as a unit vector at the model width, in the order given',
  async () => {
    const ctx = await setupTest();

    const vectors = await ctx.encoder.encode(
      ['The boiler service is booked for the 14th', 'Ana cannot digest lactose'],
      'document',
    );

    expect(vectors.map((vector) => vector.length)).toStrictEqual([768, 768]);

    expect(vectors.map((vector) => Math.hypot(...vector))).toStrictEqual([
      expect.toBeWithin(0.999, 1.001),
      expect.toBeWithin(0.999, 1.001),
    ]);
  },
);

test.skipIf(isModelMissing)('it encodes the same text the same way each time', async () => {
  const ctx = await setupTest();
  const [first] = await ctx.encoder.encode(['Ana cannot digest lactose'], 'document');
  const [second] = await ctx.encoder.encode(['Ana cannot digest lactose'], 'document');

  expect(first).toStrictEqual(second);
});

test.skipIf(isModelMissing)('it encodes a text beside others as it encodes it alone', async () => {
  const ctx = await setupTest();
  const [alone] = await ctx.encoder.encode(['Ana cannot digest lactose'], 'document');

  const [batched] = await ctx.encoder.encode(
    ['Ana cannot digest lactose', 'The car insurance renews in March, two weeks after the MOT'],
    'document',
  );

  expect(batched).toStrictEqual(alone);
});

test.skipIf(isModelMissing)('it encodes nothing for no texts', async () => {
  const ctx = await setupTest();

  expect(ctx.encoder.encode([], 'query')).resolves.toStrictEqual([]);
});

test.skipIf(isModelMissing)('it encodes a text longer than the model reads', async () => {
  const ctx = await setupTest();
  const vectors = await ctx.encoder.encode(['the boiler '.repeat(400)], 'document');

  expect(vectors.map((vector) => vector.length)).toStrictEqual([768]);
});

test.skipIf(isModelMissing)(
  'it retrieves an item by a paraphrased question that keyword search misses, as per-turn retrieval asks',
  async () => {
    const ctx = await setupTest();

    const memory = await startTestMemory({
      semanticSearch: { encoder: ctx.encoder, onError: mock<(error: unknown) => void>() },
    });

    const boiler = await createMemoryItem(memory.store, {
      text: 'The boiler service is booked for the 14th',
    });

    await createMemoryItem(memory.store, { text: 'Ana cannot digest lactose' });
    await createMemoryItem(memory.store, { text: 'The car insurance renews in March' });

    await memory.store.waitForSemanticIndex();

    const result = await memory.store.recall({
      query: 'when is the heating engineer coming',
      limit: 5,
      minScore: 0.25,
      minSimilarity: 0.38,
      excludePinned: true,
      thread: 'conversation',
    });

    const [recalled] = await readRecords(memory.log, {
      afterSequence: 0,
      kinds: ['memory.recalled'],
    });

    expect(result.items.map((item) => item.itemID)).toStrictEqual([boiler.itemID]);

    // a similarity and no keyword score: the vector index placed the item, and the keyword index
    // matched nothing
    expect(recalled?.record.payload).toStrictEqual({
      items: [{ itemID: boiler.itemID, version: 1, similarity: expect.toBeWithin(0.38, 1) }],
      searchMode: 'hybrid',
    });
  },
);

test.skipIf(isModelMissing)(
  'it gives the same paraphrased question nothing from keyword search alone',
  async () => {
    const memory = await startTestMemory();

    await createMemoryItem(memory.store, { text: 'The boiler service is booked for the 14th' });
    await createMemoryItem(memory.store, { text: 'Ana cannot digest lactose' });

    const result = await memory.store.recall({
      query: 'when is the heating engineer coming',
      limit: 5,
      minScore: 0.25,
      excludePinned: true,
    });

    expect(result.items).toStrictEqual([]);
    expect(result.searchMode).toBe('keyword');
  },
);

test('it refuses a folder that holds no model', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-encoder-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  expect(startONNXEncoder(directory)).rejects.toThrow();
});
