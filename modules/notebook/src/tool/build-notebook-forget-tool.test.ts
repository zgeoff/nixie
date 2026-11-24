import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { pickText, startTestNotebook } from '../test-utils';
import type { TestNotebookOptions } from '../test-utils';
import type { RunningStepClaim } from '../types';

async function setupTest(options: TestNotebookOptions = {}) {
  const ctx = await startTestNotebook(options);

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

  return { ...ctx, write, readNoteID };
}

test('it forgets a note by its short ID and answers forgetting with the short ID and the title', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const outcome = await ctx.call('notebook.forget', { id: note });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      note,
      title: 'Boiler',
      status: 'forgetting',
      message: expect.stringContaining('in the background'),
    },
  });
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

  const records = await ctx.readRecords(['erasure.started', 'erasure.finished']);

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

test('it refuses a note UUID with UNKNOWN_NOTE and leaves the note', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');
  const noteID = await ctx.readNoteID(note);
  const outcome = await ctx.call('notebook.forget', { id: noteID });
  const read = await ctx.call('notebook.read', { note });

  expect([outcome, read]).toMatchObject([
    { refusalCode: 'UNKNOWN_NOTE' },
    { status: 'ok', result: { title: 'Boiler' } },
  ]);
});

test('it confirms the title of the version that the forget erased', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Before');
  const edited = await ctx.call('notebook.edit', { note, version: 1, title: 'After' });
  const outcome = await ctx.call('notebook.forget', { id: note });

  expect([edited.status, outcome]).toMatchObject([
    'ok',
    { status: 'ok', result: { note, title: 'After' } },
  ]);
});

test('it finishes a forget whose session cleanup failed once', async () => {
  let attempts = 0;

  const ctx = await setupTest({
    cleanupSessions: () => {
      attempts += 1;

      return attempts === 1 ? Promise.reject(new Error('cleanup failed')) : Promise.resolve();
    },
  });

  const note = await ctx.write('Boiler');
  const outcome = await ctx.call('notebook.forget', { id: note });

  await ctx.notebook.waitForForgets();

  const records = await ctx.readRecords(['erasure.finished']);

  expect([outcome.status, records.length]).toStrictEqual(['ok', 1]);
});

test('it answers forgetting, and records no finished erasure, while the session cleanup keeps failing', async () => {
  const ctx = await setupTest({
    cleanupSessions: () => Promise.reject(new Error('cleanup failed')),
  });

  const note = await ctx.write('Boiler');
  const outcome = await ctx.call('notebook.forget', { id: note });
  const records = await ctx.readRecords(['erasure.finished']);

  expect([outcome, records.length]).toMatchObject([
    {
      status: 'ok',
      result: {
        note,
        title: 'Boiler',
        status: 'forgetting',
        message: expect.stringContaining('in the background'),
      },
    },
    0,
  ]);
});

test('it finishes at the next start a forget whose session cleanup kept failing', async () => {
  const cleanup = { isFailing: true };

  const ctx = await setupTest({
    cleanupSessions: () =>
      cleanup.isFailing ? Promise.reject(new Error('cleanup failed')) : Promise.resolve(),
  });

  const note = await ctx.write('Boiler');

  await ctx.call('notebook.forget', { id: note });
  await ctx.notebook.stop();

  cleanup.isFailing = false;

  await ctx.start();

  const records = await ctx.readRecords(['erasure.finished']);

  expect(records.map((entry) => entry.record.payload['by'])).toStrictEqual(['assistant']);
});

test('it runs the session cleanup only once the step that called the forget has ended', async () => {
  const step: { running: RunningStepClaim | null; reads: number } = {
    running: { stepKey: 'conversation:1', generation: 1 },
    reads: 0,
  };

  const ctx = await setupTest({
    readRunningStep: () => {
      step.reads += 1;

      return Promise.resolve(step.running);
    },
  });

  const note = await ctx.write('Boiler');

  await ctx.call('notebook.forget', { id: note });

  await waitFor(() => {
    expect(step.reads).toBeGreaterThanOrEqual(3);
  });

  const whileRunning = ctx.cleanups.length;

  step.running = null;

  await ctx.notebook.waitForForgets();

  expect([whileRunning, ctx.cleanups.length]).toStrictEqual([0, 1]);
});

test('it runs the session cleanup once a rerun of the calling step claims it again', async () => {
  const step = { running: { stepKey: 'conversation:1', generation: 1 } };

  const ctx = await setupTest({ readRunningStep: () => Promise.resolve(step.running) });
  const note = await ctx.write('Boiler');

  await ctx.call('notebook.forget', { id: note });

  step.running = { stepKey: 'conversation:1', generation: 2 };

  await ctx.notebook.waitForForgets();

  expect(ctx.cleanups).toHaveLength(1);
});

test('it drops the note from a search while the step that called the forget still runs', async () => {
  const step = { reads: 0 };

  const ctx = await setupTest({
    readRunningStep: () => {
      step.reads += 1;

      return Promise.resolve({ stepKey: 'conversation:1', generation: 1 });
    },
  });

  const note = await ctx.write('Boiler');

  await ctx.call('notebook.forget', { id: note });

  await waitFor(() => {
    expect(step.reads).toBeGreaterThanOrEqual(2);
  });

  const found = await ctx.call('notebook.find', { query: 'Boiler' });

  expect([JSON.stringify(found).includes(note), ctx.cleanups.length]).toStrictEqual([false, 0]);
});

test('it finishes at the next start a forget whose calling step still ran at the stop', async () => {
  const ctx = await setupTest({
    readRunningStep: () => Promise.resolve({ stepKey: 'conversation:1', generation: 1 }),
  });

  const note = await ctx.write('Boiler');

  await ctx.call('notebook.forget', { id: note });
  await ctx.notebook.stop();
  await ctx.start();

  const records = await ctx.readRecords(['erasure.finished']);

  expect(records.map((entry) => entry.record.payload['by'])).toStrictEqual(['assistant']);
});

test('it keeps running the cleanup of a confirmed forget until it ends', async () => {
  let attempts = 0;

  const ctx = await setupTest({
    cleanupSessions: () => {
      attempts += 1;

      return attempts <= 12 ? Promise.reject(new Error('cleanup failed')) : Promise.resolve();
    },
  });

  const note = await ctx.write('Boiler');

  await ctx.call('notebook.forget', { id: note });
  await ctx.notebook.waitForForgets();

  const records = await ctx.readRecords(['erasure.finished']);

  expect([attempts, records.length]).toStrictEqual([13, 1]);
});
