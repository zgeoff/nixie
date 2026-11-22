import { expect, test } from 'bun:test';
import type { JSONValue } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { pickText, startTestNotebook } from '../test-utils';

async function setupTest() {
  const ctx = await startTestNotebook({ settings: { noteChars: 200_000 } });

  const write = async (input: Record<string, JSONValue>) => {
    const outcome = await ctx.call('notebook.write', input);

    invariant(outcome.status === 'ok');

    return pickText(outcome.result['note']);
  };

  return { ...ctx, write };
}

test('it reads a note with its version, its versions, its title, its tags and its body', async () => {
  const ctx = await setupTest();

  const note = await ctx.write({
    title: 'Boiler',
    body: 'Trips after cold nights.',
    tags: ['home'],
  });

  const outcome = await ctx.call('notebook.read', { note });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      note,
      version: 1,
      versionCount: 1,
      title: 'Boiler',
      tags: ['home'],
      isPrivate: false,
      body: 'Trips after cold nights.',
      part: 1,
      parts: 1,
      updatedAt: '2026-11-21T08:00:00Z',
      readAt: null,
      links: [],
      backlinks: [],
      linkCount: 0,
      backlinkCount: 0,
    },
  });
});

test('it shows readAt as the read before this one, and moves it', async () => {
  const ctx = await setupTest();
  const note = await ctx.write({ title: 'Boiler', body: 'Body.' });

  await ctx.call('notebook.read', { note });

  ctx.clock.advance(60_000);

  const second = await ctx.call('notebook.read', { note });

  expect(second).toMatchObject({ result: { readAt: '2026-11-21T08:00:00Z' } });
});

test('it appends one note_read record for each read, and none for a refused read', async () => {
  const ctx = await setupTest();
  const note = await ctx.write({ title: 'Boiler', body: 'Body.' });

  await ctx.call('notebook.read', { note });
  await ctx.call('notebook.read', { note: 'zzzzzzzzzz' });
  await ctx.call('notebook.read', { note, version: 9 });

  const reads = await ctx.readRecords(['notebook.note_read']);

  expect(reads).toHaveLength(1);
});

test('it shows ownerOpenedAt on a private note only', async () => {
  const ctx = await setupTest();
  const open = await ctx.write({ title: 'Open', body: 'Body.' });
  const secret = await ctx.write({ title: 'Secret', body: 'Body.', isPrivate: true });
  const openRead = await ctx.call('notebook.read', { note: open });
  const secretRead = await ctx.call('notebook.read', { note: secret });

  expect(openRead).not.toHaveProperty('result.ownerOpenedAt');
  expect(secretRead).toMatchObject({ result: { isPrivate: true, ownerOpenedAt: null } });
});

test('it reads an older version', async () => {
  const ctx = await setupTest();
  const note = await ctx.write({ title: 'Boiler', body: 'one' });

  await ctx.call('notebook.edit', { note, version: 1, body: 'two' });

  const outcome = await ctx.call('notebook.read', { note, version: 1 });

  expect(outcome).toMatchObject({ result: { version: 1, versionCount: 2, body: 'one' } });
});

test('it pages a long body at paragraph breaks, and repeats the title and the tags in each part', async () => {
  const ctx = await setupTest();

  const paragraph = `${'word '.repeat(1000).trim()}\n\n`;

  const note = await ctx.write({
    title: 'Long',
    body: paragraph.repeat(10),
    tags: ['home'],
  });

  const first = await ctx.call('notebook.read', { note });
  const second = await ctx.call('notebook.read', { note, part: 2 });

  expect(first).toMatchObject({ result: { part: 1, parts: expect.any(Number), title: 'Long' } });
  expect(second).toMatchObject({ result: { part: 2, title: 'Long', tags: ['home'] } });
  expect(second).not.toHaveProperty('result.links');
});

test('it returns the part where the find text first appears, with its matches', async () => {
  const ctx = await setupTest();

  const paragraph = `${'filler '.repeat(1000).trim()}\n\n`;

  const note = await ctx.write({
    title: 'Long',
    body: `${paragraph.repeat(6)}the zine layout is two columns`,
  });

  const outcome = await ctx.call('notebook.read', { note, find: 'ZINE LAYOUT' });

  expect(outcome).toMatchObject({
    result: {
      part: expect.any(Number),
      matches: [{ part: expect.any(Number), text: expect.stringContaining('zine layout') }],
    },
  });
});

test('it refuses an unknown note with UNKNOWN_NOTE', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('notebook.read', { note: 'zzzzzzzzzz' });

  expect(outcome).toMatchObject({ refusalCode: 'UNKNOWN_NOTE' });
});

test('it refuses a version the note never had with UNKNOWN_VERSION', async () => {
  const ctx = await setupTest();
  const note = await ctx.write({ title: 'Boiler', body: 'Body.' });
  const outcome = await ctx.call('notebook.read', { note, version: 5 });

  expect(outcome).toMatchObject({ refusalCode: 'UNKNOWN_VERSION' });
});

test('it refuses a part past the last with UNKNOWN_PART', async () => {
  const ctx = await setupTest();
  const note = await ctx.write({ title: 'Boiler', body: 'Body.' });
  const outcome = await ctx.call('notebook.read', { note, part: 2 });

  expect(outcome).toMatchObject({ refusalCode: 'UNKNOWN_PART' });
});

test('it refuses a find text that appears nowhere with NOT_FOUND, and carries the parts', async () => {
  const ctx = await setupTest();
  const note = await ctx.write({ title: 'Boiler', body: 'Body.' });
  const outcome = await ctx.call('notebook.read', { note, find: 'missing' });

  expect(outcome).toMatchObject({ refusalCode: 'NOT_FOUND', result: { parts: 1 } });
});

test('it returns an error for a call that passes both part and find', async () => {
  const ctx = await setupTest();
  const note = await ctx.write({ title: 'Boiler', body: 'Body.' });
  const outcome = await ctx.call('notebook.read', { note, part: 1, find: 'Body' });

  expect(outcome).toMatchObject({ status: 'error' });
});

test('it lists the links and the backlinks of a note on part 1, with the totals', async () => {
  const ctx = await setupTest();
  const boiler = await ctx.write({ title: 'Boiler', body: 'Body.' });
  const old = await ctx.write({ title: 'Boiler notes (old)', body: 'Old.' });
  const [message] = await ctx.seed.ownerMessages(['the engineer came on Monday']);

  invariant(message !== undefined);

  await ctx.call('notebook.link', {
    from: boiler,
    to: { event: String(message) },
    type: 'cites',
    reason: 'the engineer visit',
  });

  await ctx.call('notebook.link', { from: old, to: { note: boiler }, type: 'supersedes' });

  const outcome = await ctx.call('notebook.read', { note: boiler });

  expect(outcome).toMatchObject({
    result: {
      links: [{ type: 'cites', to: { event: String(message) }, reason: 'the engineer visit' }],
      backlinks: [{ type: 'supersedes', from: old, title: 'Boiler notes (old)' }],
      linkCount: 1,
      backlinkCount: 1,
    },
  });
});

test('it keeps the note UUID under hidden.uuids and the find text out of the call record', async () => {
  const ctx = await setupTest();
  const note = await ctx.write({ title: 'Boiler', body: 'Body.' });
  const outcome = await ctx.call('notebook.read', { note, find: 'Body' });

  expect(outcome).toMatchObject({
    record: { note, version: 1, part: 1, parts: 1 },
    hidden: { uuids: { [note]: expect.any(String) } },
  });
});

test('it keeps the whole result of a find read within the output limit', async () => {
  const ctx = await setupTest();
  const note = await ctx.write({ title: 'Long', body: 'needle '.repeat(7000) });
  const outcome = await ctx.call('notebook.read', { note, find: 'needle' });

  invariant(outcome.status === 'ok');

  expect(Buffer.byteLength(JSON.stringify(outcome.result))).toBeLessThanOrEqual(20_000);
});

test('it keeps the whole result within the output limit when the matches alone pass it', async () => {
  const ctx = await setupTest();

  const needle = 'x'.repeat(2000);

  const note = await ctx.write({ title: 'Long', body: `${needle} `.repeat(10) });
  const outcome = await ctx.call('notebook.read', { note, find: needle });

  invariant(outcome.status === 'ok');

  expect(Buffer.byteLength(JSON.stringify(outcome.result))).toBeLessThanOrEqual(20_000);
});
