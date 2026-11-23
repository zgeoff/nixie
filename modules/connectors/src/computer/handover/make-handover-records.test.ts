import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startTestLog } from '../../test-utils/start-test-log';
import { makeTakeoverRecords } from '../takeover/make-takeover-records';
import { makeHandoverRecords } from './make-handover-records';
import { readOpenHandover } from './read-open-handover';
import { resumeOpenHandover } from './resume-open-handover';

async function setupTest() {
  const log = await startTestLog();

  return {
    log,
    records: makeHandoverRecords({ log, definitions: () => ({ snapshotHash: 'sha256:test' }) }),
    takeoverRecords: makeTakeoverRecords({
      log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),
    }),
    readAll: () => readRecords(log, { afterSequence: 0, limit: 10 }),
  };
}

test('it writes an ask on the conversation thread with a short ID and the reason as an erasable field', async () => {
  const ctx = await setupTest();

  await ctx.records.writeAsked({ reason: 'itch.io asks for a CAPTCHA' });

  const [entry] = await ctx.readAll();

  expect(entry?.record).toMatchObject({
    kind: 'computer.handover_asked',
    thread: 'conversation',
    payload: { shortID: expect.stringMatching(/^[\da-z]{10}$/u) },
    erasable: { status: 'readable', fields: { reason: 'itch.io asks for a CAPTCHA' } },
  });
});

test('it writes the close of an ask with who closed it and how long it stood', async () => {
  const ctx = await setupTest();

  await ctx.records.writeClosed({ by: 'expired', waitedSeconds: 3600 });

  const [entry] = await ctx.readAll();

  expect(entry?.record).toMatchObject({
    kind: 'computer.handover_closed',
    thread: 'conversation',
    payload: {
      shortID: expect.stringMatching(/^[\da-z]{10}$/u),
      by: 'expired',
      waitedSeconds: 3600,
    },
  });
});

test('it reads an ask that nothing has answered as open, with its reason', async () => {
  const ctx = await setupTest();

  await ctx.records.writeAsked({ reason: 'a bank check' });

  const open = await readOpenHandover(ctx.log);

  expect(open).toStrictEqual({
    sequence: expect.any(Number),
    askedAtMs: expect.any(Number),
    reason: 'a bank check',
  });
});

test('it reads no open ask once the ask is closed', async () => {
  const ctx = await setupTest();

  await ctx.records.writeAsked({ reason: 'a bank check' });
  await ctx.records.writeClosed({ by: 'assistant', waitedSeconds: 3 });

  const open = await readOpenHandover(ctx.log);

  expect(open).toBeNull();
});

test('it reads no open ask once a take-over started', async () => {
  const ctx = await setupTest();

  await ctx.records.writeAsked({ reason: 'a bank check' });
  await ctx.takeoverRecords.writeStarted({ device: 'laptop' });

  const open = await readOpenHandover(ctx.log);

  expect(open).toBeNull();
});

test('it resumes the open ask with the time it was asked at', async () => {
  const ctx = await setupTest();

  const resumed: number[] = [];

  await ctx.records.writeAsked({ reason: 'a bank check' });

  await resumeOpenHandover(ctx.log, {
    resume: (askedAtMs) => {
      resumed.push(askedAtMs);
    },
  });

  expect(resumed).toStrictEqual([expect.any(Number)]);
});

test('it resumes nothing when no ask is open', async () => {
  const ctx = await setupTest();

  const resumed: number[] = [];

  await resumeOpenHandover(ctx.log, {
    resume: (askedAtMs) => {
      resumed.push(askedAtMs);
    },
  });

  expect(resumed).toStrictEqual([]);
});
