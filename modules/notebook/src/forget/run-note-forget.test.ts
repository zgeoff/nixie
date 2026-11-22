import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { pickText, startTestNotebook } from '../test-utils';

async function setupTest() {
  const state = { isCleanupFailing: false };

  const ctx = await startTestNotebook({
    cleanupSessions: () =>
      state.isCleanupFailing
        ? Promise.reject(new Error('session cleanup crashed'))
        : Promise.resolve(),
  });

  const write = async (title: string, extra: Record<string, unknown> = {}) => {
    const outcome = await ctx.call('notebook.write', {
      title,
      body: `Body of ${title}.`,
      ...extra,
    });

    invariant(outcome.status === 'ok');

    return pickText(outcome.result['note']);
  };

  const readNoteID = async (shortID: string) => {
    const records = await ctx.readRecords(['notebook.note_written']);

    const found = records.find((entry) => entry.record.payload['shortID'] === shortID);

    return pickText(found?.record.payload['note']);
  };

  return { ...ctx, state, write, readNoteID };
}

test('it forgets a note and answers its short ID', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const forgotten = await ctx.notebook.forget({ note, version: 1 });

  expect(forgotten).toStrictEqual({
    status: 'forgotten',
    noteID: expect.any(String),
    shortID: note,
  });
});

test('it refuses a note that does not exist with not_found, and a stale version with stale', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.call('notebook.edit', { note, append: ' more' });

  const unknown = await ctx.notebook.forget({ note: 'zzzzzzzzzz', version: 1 });
  const stale = await ctx.notebook.forget({ note, version: 1 });

  expect([unknown, stale]).toStrictEqual([
    { status: 'refused', reason: 'not_found' },
    { status: 'refused', reason: 'stale' },
  ]);
});

test('it appends no record for a refused forget', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.notebook.forget({ note, version: 5 });

  const records = await ctx.readRecords(['notebook.note_forgetting', 'notebook.note_forgotten']);

  expect(records).toStrictEqual([]);
});

test('it reads a forgotten note as unknown to every tool', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const other = await ctx.write('Other');

  await ctx.notebook.forget({ note, version: 1 });

  const outcomes = await Promise.all([
    ctx.call('notebook.read', { note }),
    ctx.call('notebook.edit', { note, append: 'x' }),
    ctx.call('notebook.history', { note }),
    ctx.call('notebook.walk', { from: note }),
    ctx.call('notebook.link', { from: other, to: { note }, type: 'cites' }),
  ]);

  expect(outcomes.map((outcome) => 'refusalCode' in outcome && outcome.refusalCode)).toStrictEqual([
    'UNKNOWN_NOTE',
    'UNKNOWN_NOTE',
    'UNKNOWN_NOTE',
    'UNKNOWN_NOTE',
    'UNKNOWN_TARGET',
  ]);
});

test('it drops the note from the indexes', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.notebook.forget({ note, version: 1 });

  const found = await ctx.notebook.readFound({
    query: 'Boiler',
    by: 'words',
    isPrivateShown: true,
  });

  expect(found.notes).toStrictEqual([]);
});

test('it shreds the keys of every version record and every link record of the note', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const other = await ctx.write('Other');

  await ctx.call('notebook.edit', { note, append: ' more' });

  await ctx.call('notebook.link', {
    from: note,
    to: { note: other },
    type: 'related',
    reason: 'a reason',
  });

  await ctx.notebook.forget({ note, version: 2 });

  const entries = await readRecords(ctx.log, { afterSequence: 0, limit: 1000 });

  const erased = entries
    .filter((entry) =>
      ['notebook.note_written', 'notebook.note_edited', 'notebook.linked'].includes(
        entry.record.kind,
      ),
    )
    .map((entry) => [entry.record.kind, entry.record.erasable.status]);

  expect(erased).toStrictEqual([
    ['notebook.note_written', 'shredded'],
    ['notebook.note_written', 'readable'],
    ['notebook.note_edited', 'shredded'],
    ['notebook.linked', 'shredded'],
  ]);
});

test('it runs the session cleanup with the note ID as its cause', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const noteID = await ctx.readNoteID(note);

  await ctx.notebook.forget({ note, version: 1 });

  expect(ctx.cleanups).toStrictEqual([{ noteID }]);
});

test('it writes notebook.note_forgotten once, with the note and its short ID', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const noteID = await ctx.readNoteID(note);

  await ctx.notebook.forget({ note, version: 1 });

  const records = await ctx.readRecords(['notebook.note_forgotten']);

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    { note: noteID, shortID: note },
  ]);
});

test('it keeps a link from another note, which reads as gone in a walk and dangling in the check', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const other = await ctx.write('Other');

  await ctx.call('notebook.link', { from: other, to: { note }, type: 'cites' });
  await ctx.notebook.forget({ note, version: 1 });

  const walk = await ctx.call('notebook.walk', { from: other });
  const check = await ctx.call('notebook.check', {});

  expect(walk).toMatchObject({ result: { gone: [{ note }] } });
  expect(check).toMatchObject({ result: { danglingCount: 1 } });
});

test('it drops the links the forgotten note held', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const other = await ctx.write('Other');

  await ctx.call('notebook.link', { from: note, to: { note: other }, type: 'cites' });
  await ctx.notebook.forget({ note, version: 1 });

  const read = await ctx.call('notebook.read', { note: other });

  expect(read).toMatchObject({ result: { backlinks: [], backlinkCount: 0 } });
});

test('it leaves every other note readable', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const other = await ctx.write('Other');

  await ctx.notebook.forget({ note, version: 1 });

  const read = await ctx.call('notebook.read', { note: other });

  expect(read).toMatchObject({
    result: { body: 'Body of Other.' },
  });
});

test('it leaves a private note forgettable without a record of its opening', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Secret', { isPrivate: true });
  const preview = await ctx.notebook.readForgetPreview(note);
  const forgotten = await ctx.notebook.forget({ note, version: 1 });

  expect(preview).toStrictEqual({
    status: 'ready',
    preview: {
      note,
      version: 1,
      title: 'Secret',
      versionCount: 1,
      linkCount: 0,
      backlinkCount: 0,
    },
  });

  expect(forgotten.status).toBe('forgotten');

  const awaited = await ctx.readRecords(['notebook.private_opened']);

  expect(awaited).toStrictEqual([]);
});

test('it finishes a forget that a crash cut short when the server starts again, and writes one note_forgotten', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const noteID = await ctx.readNoteID(note);

  ctx.state.isCleanupFailing = true;

  const crashed = ctx.notebook.forget({ note, version: 1 });

  await Promise.allSettled([crashed]);

  const readBefore = await ctx.call('notebook.read', { note });
  const forgottenBefore = await ctx.readRecords(['notebook.note_forgotten']);

  ctx.state.isCleanupFailing = false;

  await ctx.start();

  const forgottenAfter = await ctx.readRecords(['notebook.note_forgotten']);

  expect(crashed).rejects.toThrow('session cleanup crashed');
  expect(readBefore).toMatchObject({ refusalCode: 'UNKNOWN_NOTE' });
  expect(forgottenBefore).toStrictEqual([]);
  expect(forgottenAfter.map((entry) => entry.record.payload['note'])).toStrictEqual([noteID]);
});

test('it runs the cleanup again on finishForget without writing a second note_forgotten', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.notebook.forget({ note, version: 1 });
  await ctx.notebook.finishForget(note);
  await ctx.notebook.finishForget(note);

  const awaited2 = await ctx.readRecords(['notebook.note_forgotten']);

  expect(awaited2).toHaveLength(1);
});

test('it reads the sequence of the record that ended the forget, and null before it ends', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const before = await ctx.notebook.readForgottenSequence(note);

  await ctx.notebook.forget({ note, version: 1 });

  const [ended] = await ctx.readRecords(['notebook.note_forgotten']);

  expect(before).toBeNull();

  const awaited3 = await ctx.notebook.readForgottenSequence(note);

  invariant(ended);

  expect(awaited3).toBe(ended.record.sequence);
});

test('it reads the first record of the note as the floor of the turn-input deletion', async () => {
  const ctx = await setupTest();

  await ctx.seed.ownerMessages(['earlier']);

  const note = await ctx.write('Boiler');
  const noteID = await ctx.readNoteID(note);
  const [written] = await ctx.readRecords(['notebook.note_written']);
  const awaited4 = await ctx.notebook.readForgetFloor(noteID);

  invariant(written);

  expect(awaited4).toBe(written.record.sequence);
});

test('it lists the notes that link to a record, with a private note left without its title', async () => {
  const ctx = await setupTest();
  const [message] = await ctx.seed.ownerMessages(['the engineer came']);

  invariant(message);

  const open = await ctx.write('Open');
  const secret = await ctx.write('Secret', { isPrivate: true });

  await ctx.call('notebook.link', { from: open, to: { event: String(message) }, type: 'cites' });
  await ctx.call('notebook.link', { from: secret, to: { event: String(message) }, type: 'cites' });
  await ctx.notebook.forget({ note: open, version: 1 });

  const awaited5 = await ctx.notebook.readLinkingNotes(message);

  expect(awaited5).toStrictEqual([{ note: secret }]);
});
