import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readTestRecordKeyRows } from '@heynixie/log/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { startTestTurnInputs } from '../test-utils';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';

async function setupTest(options: Parameters<typeof startTestTurnInputs>[0] = {}) {
  const ctx = await startTestTurnInputs(options);

  await ctx.turnInputs.runStart();

  return {
    ...ctx,
    openStep: () =>
      ctx.turnInputs.openCapture({
        step: { taskID: 'task-a', stepRunID: 'step-1@1' },
        profile: ctx.profile,
        role: 'task',
      }),
    readKeyRows: () => readTestRecordKeyRows(ctx.writer),
    readCaptureRows: () =>
      getTurnInputsDB(ctx.log).selectFrom('turn_input_captures').selectAll().execute(),
  };
}

test('it writes one not_received miss for each gap of a writer', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  await ctx.writeSpoolFile(capture.baseURL, { counter: 2, body: new Uint8Array([1]) });
  await ctx.writeSpoolFile(capture.baseURL, { counter: 5, body: new Uint8Array([2]) });
  await capture.close({ callFrames: 5 });

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(
    misses
      .map((miss) => [miss.reason, miss.writer, miss.counter, miss.count])
      .toSorted((first, second) => Number(first[2]) - Number(second[2])),
  ).toStrictEqual([
    ['not_received', 'aa', 1, 1],
    ['not_received', 'aa', 3, 2],
  ]);
});

test('it writes one not_received miss for call frames above the files it holds', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  await ctx.writeSpoolFile(capture.baseURL, { counter: 1, body: new Uint8Array([1]) });
  await capture.close({ callFrames: 3 });

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(misses).toStrictEqual([
    expect.objectContaining({ reason: 'not_received', count: 2, writer: null, counter: null }),
  ]);
});

test('it writes no miss when the files account for every call frame', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  await ctx.writeSpoolFile(capture.baseURL, { counter: 1, body: new Uint8Array([1]) });
  await capture.close({ callFrames: 1 });

  const listed = await ctx.turnInputs.list(10);

  expect(listed.misses).toStrictEqual([]);
});

test('it writes not_received for each call frame when no file arrives', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  await capture.close({ callFrames: 3 });

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(misses.map((miss) => [miss.reason, miss.count])).toStrictEqual([['not_received', 3]]);
});

test('it shreds the capture key and marks the capture closed', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  await capture.close({ callFrames: 0 });

  const rows = await ctx.readCaptureRows();

  expect(rows).toStrictEqual([
    expect.objectContaining({
      state: 'closed',
      close_cause: 'step_end',
      sealed_private_key: null,
      call_frames: 0,
      closed_at: expect.any(Number),
    }),
  ]);

  const received1 = await ctx.readKeyRows();

  expect(received1).toStrictEqual([]);
});

test('it closes without a file that outlasts close_wait and counts it as not_received', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  const captureID = capture.baseURL.split('/~in.')[1]?.split('.')[0] ?? '';

  await writeFile(join(ctx.spoolDir, `${captureID}.aa.1.part`), 'unfinished');

  const closing = capture.close({ callFrames: 1 });

  for (let poll = 0; poll < 5; poll += 1) {
    await waitForCondition(() => ctx.clock.countSleepers() === 1);

    ctx.clock.advance(100);
  }

  await closing;

  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  const rowRows = await ctx.readCaptureRows();

  const [row] = rowRows;

  expect(misses.map((miss) => [miss.reason, miss.counter, miss.count])).toStrictEqual([
    ['not_received', 1, 1],
  ]);

  expect(row?.state).toBe('closed');
});

test('it does nothing at a step end after a forget closed the capture', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  await ctx.turnInputs.closeCaptures({ cause: 'forget' });
  await capture.close({ callFrames: 4 });

  const rows = await ctx.readCaptureRows();

  expect(rows.map((row) => row.close_cause)).toStrictEqual(['forget']);

  const listed = await ctx.turnInputs.list(10);

  expect(listed.misses).toStrictEqual([]);
});

test('it keeps the capture open and retries only its shred when the key store is busy', async () => {
  const ctx = await setupTest({ keyStoreBusyTimeoutMs: 50 });
  const capture = await ctx.openStep();

  await ctx.writeSpoolFile(capture.baseURL, { counter: 1, body: new Uint8Array([1]) });

  const reader = await ctx.startKeyStoreReader();

  await capture.close({ callFrames: 3 });

  const openRows = await ctx.readCaptureRows();

  await reader.release();
  await ctx.turnInputs.runSweep();

  const closedRows = await ctx.readCaptureRows();
  const listed = await ctx.turnInputs.list(10);

  const misses = listed.misses;

  expect(openRows.map((row) => row.state)).toStrictEqual(['open']);
  expect(closedRows.map((row) => row.state)).toStrictEqual(['closed']);
  expect(misses.map((miss) => miss.count)).toStrictEqual([2]);
});

test('it throws for a forget when a capture key could not be shredded', async () => {
  const ctx = await setupTest({ keyStoreBusyTimeoutMs: 50 });

  await ctx.openStep();
  await ctx.startKeyStoreReader();

  expect(ctx.turnInputs.closeCaptures({ cause: 'forget' })).rejects.toThrow();
});
