import { expect, test } from 'bun:test';
import type { JSONValue } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startTestNotebook } from '../test-utils';

interface NotebookOptions {
  readonly topics?: readonly (readonly string[])[];
}

async function setupTest(options: NotebookOptions = {}) {
  const ctx = await startTestNotebook(options);

  const write = async (input: Record<string, JSONValue>) => {
    const outcome = await ctx.call('notebook.write', input);

    invariant(outcome.status === 'ok');

    return String(outcome.result['note']);
  };

  const readFindResult = async (input: Record<string, JSONValue>) => {
    const outcome = await ctx.call('notebook.find', input);

    invariant(outcome.status === 'ok');

    return outcome.result;
  };

  const readTitles = async (input: Record<string, JSONValue>) => {
    const result = await readFindResult(input);

    const notes = result['notes'];

    invariant(Array.isArray(notes));

    return notes.map((entry) =>
      typeof entry === 'object' && entry !== null && 'title' in entry ? entry.title : null,
    );
  };

  return { ...ctx, write, readFindResult, readTitles };
}

test('it finds a note by any word of the query, and shows the text around the match and a words score', async () => {
  const ctx = await setupTest();

  await ctx.write({ title: 'Boiler', body: 'The trip happens after a cold night.' });
  await ctx.write({ title: 'Zine', body: 'Two columns of text.' });

  const result = await ctx.readFindResult({ query: 'heating cold', by: 'words' });

  expect(result).toMatchObject({
    notes: [
      {
        title: 'Boiler',
        version: 1,
        match: expect.stringContaining('cold night'),
        score: { words: expect.any(Number) },
      },
    ],
    next: null,
    isMeaningPartial: false,
  });
});

test('it finds a note by meaning with the encoder, and merges it with the words', async () => {
  const ctx = await setupTest({ topics: [['boiler', 'furnace', 'heating']] });

  await ctx.write({ title: 'Boiler', body: 'The boiler trips after cold nights.' });
  await ctx.write({ title: 'Zine', body: 'Two columns of text.' });

  const result = await ctx.readFindResult({ query: 'heating cuts out' });

  expect(result).toMatchObject({
    notes: [{ title: 'Boiler', score: { meaning: expect.any(Number) } }],
    isMeaningPartial: false,
  });
});

test('it finds nothing by words for a query word that no note holds, though a meaning matches it', async () => {
  const ctx = await setupTest({ topics: [['boiler', 'furnace']] });

  await ctx.write({ title: 'Boiler', body: 'The boiler trips.' });

  const awaited = await ctx.readTitles({ query: 'furnace', by: 'words' });

  expect(awaited).toStrictEqual([]);
});

test('it reports isMeaningPartial when no encoder runs', async () => {
  const ctx = await setupTest();

  await ctx.write({ title: 'Boiler', body: 'The boiler trips.' });

  const result = await ctx.readFindResult({ query: 'boiler', by: 'meaning' });

  expect(result).toMatchObject({ isMeaningPartial: true });
});

test('it narrows to the notes that hold every tag', async () => {
  const ctx = await setupTest();

  await ctx.write({ title: 'Both', body: 'Body.', tags: ['home', 'boiler'] });
  await ctx.write({ title: 'One', body: 'Body.', tags: ['home'] });

  const awaited2 = await ctx.readTitles({ tags: ['home', 'BOILER'] });

  expect(awaited2).toStrictEqual(['Both']);
});

test('it lists notes newest edit first with no query, and oldest first with order oldest', async () => {
  const ctx = await setupTest();

  await ctx.write({ title: 'First', body: 'Body.' });

  ctx.clock.advance(60_000);

  await ctx.write({ title: 'Second', body: 'Body.' });

  const newest = await ctx.readTitles({});
  const oldest = await ctx.readTitles({ order: 'oldest' });

  expect([newest, oldest]).toStrictEqual([
    ['Second', 'First'],
    ['First', 'Second'],
  ]);
});

test('it shows no match and no score in a list', async () => {
  const ctx = await setupTest();

  await ctx.write({ title: 'First', body: 'Body.' });

  const result = await ctx.readFindResult({ order: 'oldest' });

  expect(result['notes']).toStrictEqual([
    {
      note: expect.any(String),
      title: 'First',
      tags: [],
      version: 1,
      updatedAt: '2026-11-21T08:00:00Z',
    },
  ]);
});

test('it returns 20 notes a call, with a cursor for the next call', async () => {
  const ctx = await setupTest();

  for (let count = 0; count < 25; count += 1) {
    await ctx.write({ title: `Note ${String(count)}`, body: 'Body.' });
  }

  const first = await ctx.readFindResult({});

  const next = first['next'];

  invariant(typeof next === 'string');

  const second = await ctx.readFindResult({ after: next });

  expect([first['notes'], second['notes'], second['next']]).toStrictEqual([
    expect.toBeArrayOfSize(20),
    expect.toBeArrayOfSize(5),
    null,
  ]);
});

test('it returns an error for a call that passes order with a query', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('notebook.find', { query: 'boiler', order: 'oldest' });

  expect(outcome).toMatchObject({ status: 'error' });
});

test('it lists a private note as it lists any other', async () => {
  const ctx = await setupTest();

  await ctx.write({ title: 'Secret', body: 'Body.', isPrivate: true });

  const awaited3 = await ctx.readTitles({});

  expect(awaited3).toStrictEqual(['Secret']);
});

test('it never lists a note that was forgotten', async () => {
  const ctx = await setupTest();
  const note = await ctx.write({ title: 'Gone', body: 'unique words here' });

  await ctx.notebook.forget({ note, version: 1 });

  const awaited4 = await ctx.readTitles({ query: 'unique', by: 'words' });

  expect(awaited4).toStrictEqual([]);

  const awaited5 = await ctx.readTitles({});

  expect(awaited5).toStrictEqual([]);
});

test('it finds again after a restart, from the notes the log holds', async () => {
  const ctx = await setupTest();

  await ctx.write({ title: 'Boiler', body: 'The boiler trips after cold nights.' });

  const restarted = await ctx.start();
  const found = await restarted.readFound({ query: 'cold', by: 'words', isPrivateShown: true });

  expect(found.notes.map((entry) => entry.meta.title)).toStrictEqual(['Boiler']);
});

test('it leaves the query and the tags out of the call record', async () => {
  const ctx = await setupTest();

  await ctx.write({ title: 'Boiler', body: 'The boiler trips.', tags: ['home'] });

  const outcome = await ctx.call('notebook.find', { query: 'boiler', tags: ['home'] });

  invariant(outcome.status === 'ok');

  expect(outcome.record).toStrictEqual({
    notes: [{ note: expect.any(String), version: 1 }],
  });
});
