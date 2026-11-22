import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { pickText, startTestNotebook } from '../test-utils';

async function setupTest() {
  const ctx = await startTestNotebook();

  const write = async (title: string, extra: Record<string, unknown> = {}) => {
    const outcome = await ctx.call('notebook.write', { title, body: 'Body.', ...extra });

    invariant(outcome.status === 'ok');

    return pickText(outcome.result['note']);
  };

  const recallItem = async (query: string) => {
    const recalled = await ctx.memory.recall({ query });

    return recalled.items[0];
  };

  return { ...ctx, write, recallItem };
}

test('it shows no count on an item that no note disputes or supersedes', async () => {
  const ctx = await setupTest();

  await ctx.seed.item('The thermostat is faulty.');

  const item = await ctx.recallItem('thermostat');

  expect(item).not.toHaveProperty('disputedBy');
  expect(item).not.toHaveProperty('supersededBy');
});

test('it counts the active notes that dispute an item, private ones included', async () => {
  const ctx = await setupTest();
  const item = await ctx.seed.item('The thermostat is faulty.');
  const open = await ctx.write('Open');
  const secret = await ctx.write('Secret', { isPrivate: true });

  await ctx.call('notebook.link', { from: open, to: { memory: item.shortID }, type: 'disputes' });
  await ctx.call('notebook.link', { from: secret, to: { memory: item.shortID }, type: 'disputes' });

  const awaited = await ctx.recallItem('thermostat');

  expect(awaited).toMatchObject({ disputedBy: 2 });
});

test('it counts the active notes that supersede an item apart from the disputes', async () => {
  const ctx = await setupTest();
  const item = await ctx.seed.item('The thermostat is faulty.');
  const first = await ctx.write('First');
  const second = await ctx.write('Second');

  await ctx.call('notebook.link', {
    from: first,
    to: { memory: item.shortID },
    type: 'supersedes',
  });

  await ctx.call('notebook.link', { from: second, to: { memory: item.shortID }, type: 'disputes' });

  const awaited2 = await ctx.recallItem('thermostat');

  expect(awaited2).toMatchObject({ disputedBy: 1, supersededBy: 1 });
});

test('it leaves cites and related links out of the counts', async () => {
  const ctx = await setupTest();
  const item = await ctx.seed.item('The thermostat is faulty.');
  const note = await ctx.write('Note');

  await ctx.call('notebook.link', { from: note, to: { memory: item.shortID }, type: 'cites' });

  await ctx.call('notebook.link', {
    from: note,
    to: { memory: item.shortID },
    type: 'related',
    reason: 'because',
  });

  const recalled = await ctx.recallItem('thermostat');

  expect(recalled).not.toHaveProperty('disputedBy');
});

test('it drops a count when the note is unlinked or forgotten', async () => {
  const ctx = await setupTest();
  const item = await ctx.seed.item('The thermostat is faulty.');
  const first = await ctx.write('First');
  const second = await ctx.write('Second');

  await ctx.call('notebook.link', { from: first, to: { memory: item.shortID }, type: 'disputes' });
  await ctx.call('notebook.link', { from: second, to: { memory: item.shortID }, type: 'disputes' });

  await ctx.call('notebook.unlink', {
    from: first,
    to: { memory: item.shortID },
    type: 'disputes',
  });

  const afterUnlink = await ctx.recallItem('thermostat');

  await ctx.notebook.forget({ note: second, version: 1 });

  const afterForget = await ctx.recallItem('thermostat');

  expect(afterUnlink).toMatchObject({ disputedBy: 1 });
  expect(afterForget).not.toHaveProperty('disputedBy');
});

test('it never shows a note ID or a note title in a recalled item', async () => {
  const ctx = await setupTest();
  const item = await ctx.seed.item('The thermostat is faulty.');
  const note = await ctx.write('A very particular title');

  await ctx.call('notebook.link', { from: note, to: { memory: item.shortID }, type: 'disputes' });

  const recalled = await ctx.recallItem('thermostat');

  const text = JSON.stringify(recalled);

  expect(text).not.toInclude(note);
  expect(text).not.toInclude('particular');
});
