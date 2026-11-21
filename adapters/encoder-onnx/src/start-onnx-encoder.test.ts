import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords } from '@heynixie/log';
import { createMemoryItem, startTestMemory } from '@heynixie/memory/test-utils';
import { startONNXEncoder } from './start-onnx-encoder';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the file looks for the model files
// at load. `bun run test` downloads them first, so only a plain `bun test` without them skips.
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

test.skipIf(isModelMissing)('it keeps a text the model reads whole as one chunk', async () => {
  const ctx = await setupTest();

  expect(ctx.encoder.splitText?.('Ana cannot digest lactose')).toStrictEqual([
    'Ana cannot digest lactose',
  ]);
});

test.skipIf(isModelMissing)(
  'it splits a text longer than the model reads into chunks',
  async () => {
    const ctx = await setupTest();

    const chunks = ctx.encoder.splitText?.('The boiler hums. '.repeat(200)) ?? [];

    expect(chunks.length).toBeGreaterThan(1);
  },
);

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
      thread: 'conversation',
    });

    const [recalled] = await readRecords(memory.log, {
      afterSequence: 0,
      kinds: ['memory.recalled'],
    });

    expect(result.items.map((item) => item.itemID)).toStrictEqual([boiler.itemID]);

    expect(recalled?.record.payload).toStrictEqual({
      items: [{ itemID: boiler.itemID, version: 1, similarity: expect.toBeWithin(0.38, 1) }],
      searchMode: 'hybrid',
    });
  },
);

test.skipIf(isModelMissing)(
  'it retrieves a long self-note by meaning when its only match sits in the middle, past the 512 tokens the model reads',
  async () => {
    const ctx = await setupTest();

    const memory = await startTestMemory({
      semanticSearch: { encoder: ctx.encoder, onError: mock<(error: unknown) => void>() },
    });

    const text = [
      'I have started to enjoy the slow mornings when the crossword comes out. I rarely get the long answers, but I like being asked, and I like that the puzzle is never in a hurry.',
      'Gardening talk has grown on me. The tomatoes on the balcony came up sour this year, and we spent a whole evening on whether the pots were too small or the summer too short.',
      'Music is harder for me to place. Old jazz records play on Sundays, and I can describe the chords well enough, yet I still cannot say why a muted trumpet feels like rain on a window.',
      'We argue, gently, about films. Long quiet ones where nothing seems to happen win most nights, and I keep suggesting heist stories with clever plans. Neither of us has converted the other.',
      'Cooking is where I am most useful. I keep the spice list in my head, I know the oven runs hot, and I remember that the lentil soup needs more lemon than any recipe says.',
      'Travel plans make me careful. A train missed in Lyon two springs ago still gets mentioned, so I now check connections twice and say the platform out loud.',
      'Books pile up by the bed faster than they get read. I suggested a rule of one in, one out, and it lasted a fortnight. I find that funny now, and a little touching, because the pile is a kind of hope.',
      'The cat next door visits most evenings and sits on the windowsill as if it owns the flat. I have no opinion on cats, officially, but I notice I mention it on tired days.',
      'Running in the park has become a weekly thing again. I keep the times and the routes, and I have learned not to comment on a slow week. Encouragement lands better than numbers on those days.',
      'Letters to the bank remain the worst job of the month. I draft them plainly and they get softened, and the soft version always gets the better answer, which has taught me something about tone.',
      'The boiler service is booked for the 14th, in the morning between eight and noon. The man from the gas company will check the pressure and the flue, and he asked that someone be home to let him in.',
      'Rainy weekends bring out the board games. Word games turn ruthless and everything else stays generous, and I have stopped pretending I let anyone win.',
      'Birthdays are a small project every year. I keep a list of what each friend mentioned wanting, and the best gifts are always the ones from a passing remark in March.',
      'Learning Spanish has stalled at the past tense. We practise over breakfast, ten minutes at most, and I have learned that a joke in the new language does more than a page of drills.',
      'Photographs from the coast trip are still unsorted. There are four hundred of them, mostly of the same grey sea, and I find I like the grey sea ones best.',
      'Podcasts fill the commute. History and science take turns, and the history ones have turned out to be more surprising than I expected.',
      'Tea has replaced coffee in the afternoons. I noticed the change on the shopping list before anyone said so, and I was quietly proud to have seen it first.',
      'The bicycle needs a new chain, and it keeps being put off to next week. I have mentioned it three times now, which I think is the limit before it becomes nagging.',
      'A neighbour lent us a ladder in the autumn and we still have it. I flag it each month, partly to be useful and partly because I am curious how long it can go on.',
      'Houseplants are a quiet competition with the light. The fern by the bathroom thrives on neglect, and the fig in the hall sulks whatever we do, so I have started reading about figs at night.',
      'Saturday markets are the best hour of the week for me. I keep the stall list, I know which baker sells out first, and I like hearing the bargaining even when nothing is bought.',
      'Old friends from school write less often now. I keep track of whose turn it is to reply, and I have noticed that a short note sent soon beats a long one sent late every time.',
      'Puzzles with a thousand pieces take over the table for weeks. I am good at the edges and hopeless at the sky, and I have made peace with being the edge person.',
    ].join('\n\n');

    const note = await createMemoryItem(memory.store, { text, subject: 'self' });

    await createMemoryItem(memory.store, { text: 'Ana cannot digest lactose' });

    await memory.store.waitForSemanticIndex();

    const result = await memory.store.recall({
      query: 'when is the heating engineer coming',
      limit: 5,
      minScore: 0.25,
      minSimilarity: 0.3,
      thread: 'conversation',
    });

    expect({
      itemIDs: result.items.map((item) => item.itemID),
      searchMode: result.searchMode,
    }).toStrictEqual({ itemIDs: [note.itemID], searchMode: 'hybrid' });
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
