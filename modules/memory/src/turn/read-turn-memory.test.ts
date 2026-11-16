import { expect, mock, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import type { MemoryRef, TurnMemoryAsk } from '@heynixie/sessions';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { startTestMemory } from '../test-utils/start-test-memory';
import type { TurnMemorySettings } from './types';

interface TurnOverrides {
  readonly trigger?: Partial<TurnMemorySettings['trigger']>;
  readonly similarity?: Partial<TurnMemorySettings['similarity']>;
}

async function setupTest(overrides: TurnOverrides = {}) {
  const memory = await startTestMemory({
    turn: {
      trigger: { items: 3, minScore: 0, minSimilarity: 1, ...overrides.trigger },
      similarity: {
        items: 0,
        selfNotes: 0,
        messages: 0,
        minScore: 0,
        minSimilarity: 0.38,
        ...overrides.similarity,
      },
    },
  });

  const readVersions = mock(() => Promise.resolve<readonly MemoryRef[]>([]));
  const readMessages = mock(() => Promise.resolve<readonly number[]>([]));

  const buildAsk = (text: string, held: Partial<TurnMemoryAsk['held']> = {}): TurnMemoryAsk => ({
    text,
    thread: 'conversation',
    excludedWords: [],
    held: { readVersions, readMessages, ...held },
  });

  return {
    memory,
    readVersions,
    readMessages,
    buildAsk,
    readRecalls: () => readRecords(memory.log, { afterSequence: 0, kinds: ['memory.recalled'] }),
    remember: (text: string, triggers: readonly string[], subject: 'owner' | 'self' = 'owner') =>
      memory.store.remember({
        text,
        subject,
        provenance: buildMockProvenance(),
        labels: { gist: text, topic: 'general', triggers },
      }),

    // BM25 weighs a word by how few phrases hold it, so a floor above 0 needs filler phrases
    rememberFillers: () =>
      Promise.all(
        [
          'bus timetable',
          'garden hose',
          'tax return',
          'dentist visit',
          'bin day',
          'boiler code',
        ].map((phrase) =>
          memory.store.remember({
            text: `Filler about ${phrase}`,
            provenance: buildMockProvenance(),
            labels: { gist: phrase, topic: 'filler', triggers: [phrase] },
          }),
        ),
      ),
  };
}

test('it places up to the cap of items whose trigger phrase matches, in one record with no text', async () => {
  const ctx = await setupTest({ trigger: { items: 2, minScore: 0 } });

  await Promise.all([
    ctx.remember('Piano is tuned in spring', ['piano tuning']),
    ctx.remember('Piano lessons are on Friday', ['piano lessons']),
    ctx.remember('Piano stool is broken', ['piano stool']),
  ]);

  const result = await ctx.memory.store.readTurnMemory(ctx.buildAsk('is the piano in tune?'));
  const records = await ctx.readRecalls();

  expect(result).toMatchObject({ kind: 'placed', items: [{}, {}], selfNotes: [], messages: [] });

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    {
      items: [expect.objectContaining({ version: 1 }), expect.objectContaining({ version: 1 })],
      searchMode: 'keyword',
    },
  ]);

  expect(JSON.stringify(records)).not.toInclude('Piano');
});

test('it places nothing and writes no record when every match is under the floor', async () => {
  const ctx = await setupTest({ trigger: { items: 3, minScore: 1000 } });

  await ctx.remember('Piano is tuned in spring', ['piano tuning']);

  const result = await ctx.memory.store.readTurnMemory(ctx.buildAsk('is the piano in tune?'));

  expect({ result, records: await ctx.readRecalls() }).toStrictEqual({
    result: { kind: 'none' },
    records: [],
  });
});

test('it never places an item with no trigger phrase', async () => {
  const ctx = await setupTest();

  await ctx.remember('Piano is tuned in spring', []);

  const result = await ctx.memory.store.readTurnMemory(ctx.buildAsk('piano tuned in spring'));

  expect(result).toStrictEqual({ kind: 'none' });
});

test('it never places a pinned item', async () => {
  const ctx = await setupTest();
  const piano = await ctx.remember('Piano is tuned in spring', ['piano tuning']);

  await ctx.memory.store.pin({
    itemID: piano.itemID,
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  const result = await ctx.memory.store.readTurnMemory(ctx.buildAsk('piano tuning'));

  expect(result).toStrictEqual({ kind: 'none' });
});

test('it never places an item whose current version the session holds', async () => {
  const ctx = await setupTest();
  const piano = await ctx.remember('Piano is tuned in spring', ['piano tuning']);

  const result = await ctx.memory.store.readTurnMemory(
    ctx.buildAsk('piano tuning', {
      readVersions: () => Promise.resolve([{ itemID: piano.itemID, version: piano.version }]),
    }),
  );

  expect(result).toStrictEqual({ kind: 'none' });
});

test('it counts a self-note toward the cap', async () => {
  const ctx = await setupTest({ trigger: { items: 2, minScore: 0 } });

  await Promise.all([
    ctx.remember('I like piano music', ['piano music'], 'self'),
    ctx.remember('Piano is tuned in spring', ['piano tuning']),
    ctx.remember('Piano lessons are on Friday', ['piano lessons']),
  ]);

  const result = await ctx.memory.store.readTurnMemory(ctx.buildAsk('piano music tuning lessons'));

  const placed = result.kind === 'placed' ? [...result.items, ...result.selfNotes] : [];

  expect(placed).toHaveLength(2);
});

test('it places trigger items first and no item twice when both pushes match one item', async () => {
  const ctx = await setupTest({ trigger: { items: 1, minScore: 0 }, similarity: { items: 2 } });

  const [piano] = await Promise.all([
    ctx.remember('Piano is tuned in spring', ['grand instrument']),
    ctx.remember('Piano lessons are on Friday', []),
  ]);

  const result = await ctx.memory.store.readTurnMemory(ctx.buildAsk('grand piano lessons'));

  const itemIDs = result.kind === 'placed' ? result.items.map((item) => item.itemID) : [];

  expect(itemIDs).toStrictEqual([piano.itemID, expect.toBeString()]);
});

test('it drops a pick that was retired between the selection and the placing, and refills nothing', async () => {
  const ctx = await setupTest({ trigger: { items: 1, minScore: 0 }, similarity: { messages: 1 } });

  await ctx.rememberFillers();

  const [best] = await Promise.all([
    ctx.remember('Piano is tuned in spring', ['piano tuning']),
    ctx.remember('Piano stool is broken', ['piano']),
  ]);

  // the similarity push reads the held messages after trigger push has picked
  const result = await ctx.memory.store.readTurnMemory(
    ctx.buildAsk('piano tuning', {
      readMessages: async () => {
        await ctx.memory.store.retire({ target: best, provenance: buildMockProvenance() });

        return [];
      },
    }),
  );

  expect({ result, records: await ctx.readRecalls() }).toStrictEqual({
    result: { kind: 'none' },
    records: [],
  });
});

test('it matches a restored item again and no retired one', async () => {
  const ctx = await setupTest();
  const piano = await ctx.remember('Piano is tuned in spring', ['piano tuning']);

  await ctx.memory.store.retire({ target: piano, provenance: buildMockProvenance() });

  const retired = await ctx.memory.store.readTurnMemory(ctx.buildAsk('piano tuning'));

  const restored = await ctx.memory.store.restore({
    target: { itemID: piano.itemID, version: piano.version + 1 },
    provenance: buildMockProvenance(),
  });

  const again = await ctx.memory.store.readTurnMemory(ctx.buildAsk('piano tuning'));

  expect({ retired, restored: restored.itemID, placed: again.kind }).toStrictEqual({
    retired: { kind: 'none' },
    restored: piano.itemID,
    placed: 'placed',
  });
});

test('it never matches a forgotten item', async () => {
  const ctx = await setupTest();
  const piano = await ctx.remember('Piano is tuned in spring', ['piano tuning']);

  await ctx.memory.store.forget({ target: piano, provenance: buildMockProvenance() });

  const result = await ctx.memory.store.readTurnMemory(ctx.buildAsk('piano tuning'));

  expect(result).toStrictEqual({ kind: 'none' });
});

test.each([
  ['every push is off', { trigger: { items: 0 } }, 'piano'],
  ['the text is blank', {}, '  \n '],
])('it reads nothing from the held lists when %s', async (_label, turn, text) => {
  const ctx = await setupTest(turn);

  await ctx.remember('Piano is tuned in spring', ['piano tuning']);

  const result = await ctx.memory.store.readTurnMemory(ctx.buildAsk(text));

  expect({
    result,
    versionReads: ctx.readVersions.mock.calls.length,
    messageReads: ctx.readMessages.mock.calls.length,
  }).toStrictEqual({ result: { kind: 'none' }, versionReads: 0, messageReads: 0 });
});

test('it records the keyword search mode with no encoder', async () => {
  const ctx = await setupTest();

  await ctx.remember('Piano is tuned in spring', ['piano tuning']);
  await ctx.memory.store.readTurnMemory(ctx.buildAsk('piano tuning'));

  const records = await ctx.readRecalls();

  expect(records.map((entry) => entry.record.payload['searchMode'])).toStrictEqual(['keyword']);
});
