import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { pickText, startTestNotebook } from '../test-utils';

async function setupTest() {
  const ctx = await startTestNotebook({ settings: { noteChars: 40 } });

  const write = async (body: string, extra: Record<string, unknown> = {}) => {
    const outcome = await ctx.call('notebook.write', { title: 'Boiler', body, ...extra });

    invariant(outcome.status === 'ok');

    return pickText(outcome.result['note']);
  };

  const readBody = async (note: string, version?: number) => {
    const outcome = await ctx.call('notebook.read', {
      note,
      ...(version === undefined ? {} : { version }),
    });

    invariant(outcome.status === 'ok');

    return pickText(outcome.result['body']);
  };

  return { ...ctx, write, readBody };
}

test('it applies a change to the one match and makes version 2', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Trips after a cold night.');

  const outcome = await ctx.call('notebook.edit', {
    note,
    version: 1,
    changes: [{ find: 'cold night', replace: 'night under 2 C' }],
  });

  expect(outcome).toMatchObject({ status: 'ok', result: { note, version: 2 } });

  const awaited = await ctx.readBody(note);

  expect(awaited).toBe('Trips after a night under 2 C.');
});

test('it applies each change to the result of the last', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one two');

  await ctx.call('notebook.edit', {
    note,
    version: 1,
    changes: [
      { find: 'one', replace: 'three' },
      { find: 'three', replace: 'four' },
    ],
  });

  const awaited2 = await ctx.readBody(note);

  expect(awaited2).toBe('four two');
});

test('it replaces every match of a change that sets all', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('a b a b a');

  await ctx.call('notebook.edit', {
    note,
    version: 1,
    changes: [{ find: 'a', replace: 'x', all: true }],
  });

  const awaited3 = await ctx.readBody(note);

  expect(awaited3).toBe('x b x b x');
});

test('it replaces the whole body with body', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('old');

  await ctx.call('notebook.edit', { note, version: 1, body: 'new body' });

  const awaited4 = await ctx.readBody(note);

  expect(awaited4).toBe('new body');
});

test('it adds an append to the end after the changes', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one');

  await ctx.call('notebook.edit', {
    note,
    version: 1,
    changes: [{ find: 'one', replace: 'two' }],
    append: ' three',
  });

  const awaited5 = await ctx.readBody(note);

  expect(awaited5).toBe('two three');
});

test('it takes an append alone with no version, and never goes stale', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one');

  await ctx.call('notebook.edit', { note, append: ' two' });

  const second = await ctx.call('notebook.edit', { note, append: ' three' });

  expect(second).toMatchObject({ status: 'ok', result: { version: 3 } });

  const awaited6 = await ctx.readBody(note);

  expect(awaited6).toBe('one two three');
});

test('it makes a new version for a change of the title, the tags or the private flag alone', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one', { tags: ['home'] });

  const outcome = await ctx.call('notebook.edit', {
    note,
    version: 1,
    title: 'New title',
    tags: [],
    isPrivate: true,
  });

  const read = await ctx.call('notebook.read', { note });

  expect(outcome).toMatchObject({ result: { version: 2 } });

  expect(read).toMatchObject({
    result: { title: 'New title', tags: [], isPrivate: true, body: 'one' },
  });
});

test('it stores each version whole, so an older version stays readable', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one');

  await ctx.call('notebook.edit', { note, version: 1, body: 'two' });

  const awaited7 = await ctx.readBody(note, 1);

  expect(awaited7).toBe('one');
});

test('it refuses an unknown note with UNKNOWN_NOTE', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('notebook.edit', { note: 'zzzzzzzzzz', append: 'x' });

  expect(outcome).toMatchObject({ refusalCode: 'UNKNOWN_NOTE' });
});

test('it refuses an edit that sets no field with NOTHING_TO_CHANGE', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one');
  const outcome = await ctx.call('notebook.edit', { note, version: 1 });

  expect(outcome).toMatchObject({ refusalCode: 'NOTHING_TO_CHANGE' });
});

test('it refuses a body with changes or append with BODY_AND_CHANGES', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one');

  const withChanges = await ctx.call('notebook.edit', {
    note,
    version: 1,
    body: 'two',
    changes: [{ find: 'one', replace: 'x' }],
  });

  const withAppend = await ctx.call('notebook.edit', {
    note,
    version: 1,
    body: 'two',
    append: 'x',
  });

  expect([withChanges, withAppend]).toStrictEqual([
    expect.objectContaining({ refusalCode: 'BODY_AND_CHANGES' }),
    expect.objectContaining({ refusalCode: 'BODY_AND_CHANGES' }),
  ]);
});

test('it refuses an edit with no version that sets more than an append with VERSION_REQUIRED', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one');
  const outcome = await ctx.call('notebook.edit', { note, title: 'New', append: 'x' });

  expect(outcome).toMatchObject({ refusalCode: 'VERSION_REQUIRED' });
});

test('it refuses a stale version with STALE_VERSION and the current version', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one');

  await ctx.call('notebook.edit', { note, append: ' two' });

  const outcome = await ctx.call('notebook.edit', { note, version: 1, body: 'x' });

  expect(outcome).toMatchObject({ refusalCode: 'STALE_VERSION', result: { currentVersion: 2 } });
});

test('it refuses a change with no match with NO_MATCH, and applies none of the changes', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one two');

  const outcome = await ctx.call('notebook.edit', {
    note,
    version: 1,
    changes: [
      { find: 'one', replace: 'x' },
      { find: 'missing', replace: 'y' },
    ],
  });

  expect(outcome).toMatchObject({ refusalCode: 'NO_MATCH' });

  expect(outcome).toMatchObject({
    result: { message: expect.stringContaining('change 1 of note') },
  });

  const awaited8 = await ctx.readBody(note);

  expect(awaited8).toBe('one two');
});

test('it refuses a change with several matches with MANY_MATCHES unless it sets all', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('a a');

  const outcome = await ctx.call('notebook.edit', {
    note,
    version: 1,
    changes: [{ find: 'a', replace: 'b' }],
  });

  expect(outcome).toMatchObject({ refusalCode: 'MANY_MATCHES' });
});

test('it checks NOTE_TOO_LONG against the result of the changes and the append', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('x'.repeat(35));
  const outcome = await ctx.call('notebook.edit', { note, append: 'y'.repeat(6) });

  expect(outcome).toMatchObject({ refusalCode: 'NOTE_TOO_LONG' });

  const awaited9 = await ctx.readBody(note);

  expect(awaited9).toBe('x'.repeat(35));
});

test('it refuses a stale version before it looks for a match', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one');

  await ctx.call('notebook.edit', { note, append: ' two' });

  const outcome = await ctx.call('notebook.edit', {
    note,
    version: 1,
    changes: [{ find: 'missing', replace: 'x' }],
  });

  expect(outcome).toMatchObject({ refusalCode: 'STALE_VERSION' });
});

test('it appends a note_edited record that holds the whole version in its erasable fields', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one', { tags: ['home'] });

  await ctx.call('notebook.edit', { note, append: ' two' });

  const [edited] = await ctx.readRecords(['notebook.note_edited']);

  expect(edited?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { title: 'Boiler', body: 'one two', tags: ['home'] },
  });
});

test('it leaves the free text of the call out of the call record', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('one');
  const outcome = await ctx.call('notebook.edit', { note, append: ' two' });

  expect(outcome).toMatchObject({ record: { note, version: 2 } });
});
