import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startTestLog } from '../../test-utils/start-test-log';
import { makeTakeoverRecords } from './make-takeover-records';
import { readOpenTakeover } from './read-open-takeover';

async function setupTest() {
  const log = await startTestLog();

  return {
    log,
    records: makeTakeoverRecords({ log, definitions: () => ({ snapshotHash: 'sha256:test' }) }),
    readAll: () => readRecords(log, { afterSequence: 0, limit: 10 }),
    readOpen: () => readOpenTakeover(log.writer.db),
  };
}

test('it writes a start record on the conversation thread with a short ID and the device', async () => {
  const ctx = await setupTest();

  await ctx.records.writeStarted({ device: 'laptop' });

  const [entry] = await ctx.readAll();

  expect(entry?.record).toMatchObject({
    kind: 'computer.takeover_started',
    thread: 'conversation',
    payload: { shortID: expect.stringMatching(/^[\da-z]{10}$/u), device: 'laptop' },
  });
});

test('it writes the sites and the window of a hand-back as erasable fields', async () => {
  const ctx = await setupTest();

  await ctx.records.writeEnded({
    by: 'user',
    durationSeconds: 63,
    read: {
      origins: ['https://itch.io'],
      now: { kind: 'browser', tab: 't1', text: 'Solve the puzzle' },
    },
  });

  const [entry] = await ctx.readAll();

  expect(entry?.record).toMatchObject({
    kind: 'computer.takeover_ended',
    payload: { by: 'user', durationSeconds: 63 },
    erasable: {
      status: 'readable',
      fields: {
        origins: ['https://itch.io'],
        now: { kind: 'browser', tab: 't1', text: 'Solve the puzzle' },
      },
    },
  });
});

test('it writes a restart end with no sites and no window', async () => {
  const ctx = await setupTest();

  await ctx.records.writeEnded({ by: 'restart', durationSeconds: 5, read: null });

  const [entry] = await ctx.readAll();

  expect(entry?.record).toMatchObject({
    erasable: { status: 'readable', fields: { origins: [], now: null } },
  });
});

test('it reads the start of a hold that no record ended', async () => {
  const ctx = await setupTest();

  await ctx.records.writeStarted({ device: 'laptop' });

  const [entry] = await ctx.readAll();
  const open = await ctx.readOpen();

  expect(open).toBe(entry?.record.recordedAt.valueOf() ?? null);
});

test('it reads no open hold once a record ended it', async () => {
  const ctx = await setupTest();

  await ctx.records.writeStarted({ device: 'laptop' });
  await ctx.records.writeEnded({ by: 'user', durationSeconds: 1, read: null });

  const open = await ctx.readOpen();

  expect(open).toBeNull();
});

test('it reads no open hold when no hold was ever taken', async () => {
  const ctx = await setupTest();
  const open = await ctx.readOpen();

  expect(open).toBeNull();
});
