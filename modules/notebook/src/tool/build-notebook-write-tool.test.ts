import { expect, test } from 'bun:test';
import { pickText, startTestNotebook } from '../test-utils';
import { buildNotebookTools } from './build-notebook-tools';

test('it writes a note and answers its short ID and version 1', async () => {
  const ctx = await startTestNotebook();

  const outcome = await ctx.call('notebook.write', {
    title: 'Why the boiler keeps tripping',
    body: '## What I know\nThe trip happens after a cold night.',
    tags: ['home', 'boiler'],
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { note: expect.stringMatching(/^[a-z0-9]{10}$/u), version: 1 },
    record: { note: expect.any(String), version: 1 },
    hidden: { uuids: expect.any(Object) },
  });
});

test('it keeps each UUID under hidden.uuids, keyed by the short ID the result shows', async () => {
  const ctx = await startTestNotebook();
  const outcome = await ctx.call('notebook.write', { title: 'T', body: 'B' });
  const [written] = await ctx.readRecords(['notebook.note_written']);

  const shortID = pickText(written?.record.payload['shortID']);

  expect(outcome).toMatchObject({
    hidden: { uuids: { [shortID]: pickText(written?.record.payload['note']) } },
  });
});

test('it records the writer and the model from the run, never from the input', async () => {
  const ctx = await startTestNotebook();

  await ctx.call(
    'notebook.write',
    { title: 'A task note', body: 'Body.' },
    { thread: 'task-7', model: 'model-b' },
  );

  const [written] = await ctx.readRecords(['notebook.note_written']);

  expect(written?.record.payload).toStrictEqual({
    note: expect.any(String),
    shortID: expect.any(String),
    version: 1,
    writer: 'task-7',
    model: 'model-b',
    chars: 5,
    isPrivate: false,
  });
});

test('it records the conversation as the writer of a note from the conversation', async () => {
  const ctx = await startTestNotebook();

  await ctx.call('notebook.write', { title: 'Mine', body: 'Body.' });

  const [written] = await ctx.readRecords(['notebook.note_written']);

  expect(written?.record.payload['writer']).toBe('conversation');
});

test('it keeps the title, the body and the tags in the erasable fields of the record', async () => {
  const ctx = await startTestNotebook();

  await ctx.call('notebook.write', {
    title: 'A title',
    body: 'A body.',
    tags: ['Home', 'home', 'zine'],
  });

  const [written] = await ctx.readRecords(['notebook.note_written']);

  expect(written?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { title: 'A title', body: 'A body.', tags: ['Home', 'zine'] },
  });
});

test('it refuses a body past note_chars with NOTE_TOO_LONG and writes nothing', async () => {
  const ctx = await startTestNotebook({ settings: { noteChars: 10 } });
  const outcome = await ctx.call('notebook.write', { title: 'Long', body: 'x'.repeat(11) });
  const records = await ctx.readRecords(['notebook.note_written']);

  expect(outcome).toMatchObject({ refusalCode: 'NOTE_TOO_LONG' });
  expect(records).toStrictEqual([]);
});

test('it refuses a write past max_notes with NOTEBOOK_FULL', async () => {
  const ctx = await startTestNotebook({ settings: { maxNotes: 1 } });

  await ctx.call('notebook.write', { title: 'First', body: 'Body.' });

  const outcome = await ctx.call('notebook.write', { title: 'Second', body: 'Body.' });

  expect(outcome).toMatchObject({ refusalCode: 'NOTEBOOK_FULL' });
});

test('it checks NOTE_TOO_LONG before NOTEBOOK_FULL', async () => {
  const ctx = await startTestNotebook({ settings: { maxNotes: 1, noteChars: 3 } });

  await ctx.call('notebook.write', { title: 'First', body: 'abc' });

  const outcome = await ctx.call('notebook.write', { title: 'Second', body: 'abcd' });

  expect(outcome).toMatchObject({ refusalCode: 'NOTE_TOO_LONG' });
});

test('it leaves the free text of the call out of the call record', async () => {
  const ctx = await startTestNotebook();

  const tools = buildNotebookTools(() => ctx.notebook);
  const [tool] = tools;

  expect(
    tool?.recordInput?.({ title: 'T', body: 'B', tags: ['x'], isPrivate: true }),
  ).toStrictEqual({
    isPrivate: true,
  });
});
