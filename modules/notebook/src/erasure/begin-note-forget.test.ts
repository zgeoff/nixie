import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { noteForgettingCodec } from '../record/note-forgetting-codec';
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
  const forgotten = await ctx.forget({ note, version: 1 });

  expect(forgotten).toStrictEqual({
    status: 'begun',
    noteID: expect.any(String),
    shortID: note,
    title: 'Boiler',
  });
});

test('it refuses a note that does not exist with not_found, and a stale version with stale', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.call('notebook.edit', { note, append: ' more' });

  const unknown = await ctx.forget({ note: 'zzzzzzzzzz', version: 1 });
  const stale = await ctx.forget({ note, version: 1 });

  expect([unknown, stale]).toStrictEqual([
    { status: 'refused', reason: 'not_found' },
    { status: 'refused', reason: 'stale' },
  ]);
});

test('it appends no record for a refused forget', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.forget({ note, version: 5 });

  const records = await ctx.readRecords(['erasure.started', 'erasure.finished']);

  expect(records).toStrictEqual([]);
});

test('it reads a forgotten note as unknown to every tool', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const other = await ctx.write('Other');

  await ctx.forget({ note, version: 1 });

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

  await ctx.forget({ note, version: 1 });

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

  await ctx.forget({ note, version: 2 });

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

  await ctx.forget({ note, version: 1 });

  expect(ctx.cleanups).toStrictEqual([{ noteID }]);
});

test('it writes erasure.started and then erasure.finished, with the note, its short ID and the user as who forgot', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const noteID = await ctx.readNoteID(note);

  await ctx.forget({ note, version: 1 });

  const records = await ctx.readRecords(['erasure.started', 'erasure.finished']);

  expect(records.map((entry) => [entry.record.kind, entry.record.payload])).toMatchObject([
    [
      'erasure.started',
      {
        kind: 'note',
        targetID: noteID,
        shortID: note,
        version: 1,
        parentID: null,
        by: 'user',
        capture: { sessionCause: { noteID }, turnInputs: { threads: [], cleaned: false } },
      },
    ],
    ['erasure.finished', { kind: 'note', targetID: noteID, shortID: note, by: 'user' }],
  ]);
});

test('it writes no old forget record', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.forget({ note, version: 1 });

  const records = await ctx.readRecords(['notebook.note_forgetting', 'notebook.note_forgotten']);

  expect(records).toStrictEqual([]);
});

test('it keeps a link from another note, which reads as gone in a walk and dangling in the check', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const other = await ctx.write('Other');

  await ctx.call('notebook.link', { from: other, to: { note }, type: 'cites' });
  await ctx.forget({ note, version: 1 });

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
  await ctx.forget({ note, version: 1 });

  const read = await ctx.call('notebook.read', { note: other });

  expect(read).toMatchObject({ result: { backlinks: [], backlinkCount: 0 } });
});

test('it leaves every other note readable', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const other = await ctx.write('Other');

  await ctx.forget({ note, version: 1 });

  const read = await ctx.call('notebook.read', { note: other });

  expect(read).toMatchObject({
    result: { body: 'Body of Other.' },
  });
});

test('it leaves a private note forgettable without a record of its opening', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Secret', { isPrivate: true });
  const preview = await ctx.notebook.readForgetPreview(note);
  const forgotten = await ctx.forget({ note, version: 1 });

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

  expect(forgotten.status).toBe('begun');

  const awaited = await ctx.readRecords(['notebook.private_opened']);

  expect(awaited).toStrictEqual([]);
});

test('it deletes the keys before it writes erasure.finished, so a failed cleanup leaves the keys gone and the forget open', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  ctx.state.isCleanupFailing = true;

  await Promise.allSettled([ctx.forget({ note, version: 1 })]);

  const entries = await readRecords(ctx.log, { afterSequence: 0, limit: 1000 });
  const finished = await ctx.readRecords(['erasure.finished']);

  const written = entries.filter((entry) => entry.record.kind === 'notebook.note_written');

  expect({
    written: written.map((entry) => entry.record.erasable.status),
    finished,
  }).toStrictEqual({ written: ['shredded'], finished: [] });
});

test('it finishes a forget that a crash cut short when the server starts again, and writes one erasure.finished', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const noteID = await ctx.readNoteID(note);

  ctx.state.isCleanupFailing = true;

  const [crashed] = await Promise.allSettled([ctx.forget({ note, version: 1 })]);
  const readBefore = await ctx.call('notebook.read', { note });
  const finishedBefore = await ctx.readRecords(['erasure.finished']);

  ctx.state.isCleanupFailing = false;

  await ctx.start();

  const finishedAfter = await ctx.readRecords(['erasure.finished']);

  expect(crashed.status).toBe('rejected');
  expect(readBefore).toMatchObject({ refusalCode: 'UNKNOWN_NOTE' });
  expect(finishedBefore).toStrictEqual([]);
  expect(finishedAfter.map((entry) => entry.record.payload['targetID'])).toStrictEqual([noteID]);
});

test('it finishes at the first start a forget that the old pipeline left in forgetting, and writes only the new records', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const noteID = await ctx.readNoteID(note);

  await writeRecords(ctx.log, [
    {
      kind: 'notebook.note_forgetting',
      definitions: { snapshotHash: 'sha256:test' },
      payload: noteForgettingCodec.encode({ note: noteID, version: 1, by: 'assistant' }),
    },
  ]);

  await ctx.start();

  const records = await ctx.readRecords([
    'erasure.started',
    'erasure.finished',
    'notebook.note_forgotten',
  ]);

  expect(records.map((entry) => [entry.record.kind, entry.record.payload['by']])).toStrictEqual([
    ['erasure.started', 'assistant'],
    ['erasure.finished', 'assistant'],
  ]);
});

test('it runs the cleanup again on finishForget without writing a second erasure.finished', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.forget({ note, version: 1 });
  await ctx.notebook.finishForget(note);
  await ctx.notebook.finishForget(note);

  const finished = await ctx.readRecords(['erasure.finished']);

  expect(finished).toHaveLength(1);
});

test('it reads the sequence of the record that ended the forget, and null before it ends', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const before = await ctx.notebook.readForgottenSequence(note);

  await ctx.forget({ note, version: 1 });

  const [ended] = await ctx.readRecords(['erasure.finished']);
  const after = await ctx.notebook.readForgottenSequence(note);

  invariant(ended);

  expect([before, after]).toStrictEqual([null, ended.record.sequence]);
});

test('it captures the first record of the note as the floor of the turn-input deletion', async () => {
  const ctx = await setupTest();

  await ctx.seed.ownerMessages(['earlier']);

  const note = await ctx.write('Boiler');

  await ctx.forget({ note, version: 1 });

  const [written] = await ctx.readRecords(['notebook.note_written']);
  const [started] = await ctx.readRecords(['erasure.started']);

  invariant(written);
  invariant(started);

  expect(started.record.payload['capture']).toMatchObject({
    turnInputs: { floor: written.record.sequence },
  });
});

test('it lists the notes that link to a record, with a private note left without its title', async () => {
  const ctx = await setupTest();
  const [message] = await ctx.seed.ownerMessages(['the engineer came']);

  invariant(message !== undefined);

  const open = await ctx.write('Open');
  const secret = await ctx.write('Secret', { isPrivate: true });

  await ctx.call('notebook.link', { from: open, to: { event: String(message) }, type: 'cites' });
  await ctx.call('notebook.link', { from: secret, to: { event: String(message) }, type: 'cites' });
  await ctx.forget({ note: open, version: 1 });

  const awaited5 = await ctx.notebook.readLinkingNotes(message);

  expect(awaited5).toStrictEqual([{ note: secret }]);
});
