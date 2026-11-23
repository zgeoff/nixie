import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { pickText, startTestNotebook } from '../test-utils';

async function setupTest() {
  const ctx = await startTestNotebook();

  const write = async (title: string, extra: Record<string, unknown> = {}) => {
    const outcome = await ctx.call('notebook.write', {
      title,
      body: `Body of ${title}.`,
      ...extra,
    });

    invariant(outcome.status === 'ok');

    return pickText(outcome.result['note']);
  };

  return { ...ctx, write };
}

test('it forgets a note by its short ID and confirms the short ID and the title', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const outcome = await ctx.call('notebook.forget', { id: note });

  expect(outcome).toMatchObject({ status: 'ok', result: { note, title: 'Boiler' } });
});

test('it erases the note as the owner forget does', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.call('notebook.forget', { id: note });
  await ctx.notebook.waitForForgets();

  const entries = await readRecords(ctx.log, { afterSequence: 0, limit: 1000 });

  const erased = entries
    .filter((entry) => entry.record.kind === 'notebook.note_written')
    .map((entry) => entry.record.erasable.status);

  const found = await ctx.notebook.readFound({
    query: 'Boiler',
    by: 'words',
    isPrivateShown: true,
  });

  const read = await ctx.call('notebook.read', { note });

  expect([erased, found.notes, read]).toMatchObject([
    ['shredded'],
    [],
    { refusalCode: 'UNKNOWN_NOTE' },
  ]);
});

test('it shows a link to the forgotten note as gone in a walk', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const other = await ctx.write('Other');

  await ctx.call('notebook.link', { from: other, to: { note }, type: 'cites' });
  await ctx.call('notebook.forget', { id: note });

  const walked = await ctx.call('notebook.walk', { from: other });

  expect(walked).toMatchObject({ status: 'ok', result: { gone: [expect.anything()] } });
});

test('it forgets a private note like any other', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Diary', { isPrivate: true });
  const outcome = await ctx.call('notebook.forget', { id: note });

  expect(outcome).toMatchObject({ status: 'ok', result: { note, title: 'Diary' } });
});

test('it records the assistant as who forgot', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.call('notebook.forget', { id: note });
  await ctx.notebook.waitForForgets();

  const records = await ctx.readRecords(['notebook.note_forgetting', 'notebook.note_forgotten']);

  expect(records.map((entry) => entry.record.payload['by'])).toStrictEqual([
    'assistant',
    'assistant',
  ]);
});

test('it refuses a note that was already forgotten with UNKNOWN_NOTE', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.call('notebook.forget', { id: note });

  const outcome = await ctx.call('notebook.forget', { id: note });

  expect(outcome).toMatchObject({ refusalCode: 'UNKNOWN_NOTE' });
});

test('it refuses an unknown ID with UNKNOWN_NOTE', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('notebook.forget', { id: 'zzzzzzzzzz' });

  expect(outcome).toMatchObject({ refusalCode: 'UNKNOWN_NOTE' });
});
