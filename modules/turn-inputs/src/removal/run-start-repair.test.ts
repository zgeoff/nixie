import { expect, test } from 'bun:test';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRecordKey, removeRecordKey } from '@heynixie/log';
import { readTestRecordKeyRows } from '@heynixie/log/test-utils';
import { createTurnInputs } from '../create-turn-inputs';
import { startTestTurnInputs } from '../test-utils';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';

async function setupTest() {
  const ctx = await startTestTurnInputs();

  await ctx.turnInputs.runStart();

  return {
    ...ctx,

    // a start of the same data directory: a new instance with nothing in memory
    restart: () => createTurnInputs(ctx.turnInputsOptions),
    openStep: () =>
      ctx.turnInputs.openCapture({
        step: { taskID: 'task-a', stepRunID: 'step-1@1' },
        profile: ctx.profile,
        role: 'task',
      }),
    readCaptureRows: () =>
      getTurnInputsDB(ctx.log).selectFrom('turn_input_captures').selectAll().execute(),
    readInputRows: () => getTurnInputsDB(ctx.log).selectFrom('turn_inputs').selectAll().execute(),
    readKeyRows: () => readTestRecordKeyRows(ctx.writer),
    readBodyFiles: () => readdir(join(ctx.dataDir, 'turn-inputs'), { withFileTypes: false }),
  };
}

test('it takes in the files of an open capture and closes it with start', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  await ctx.writeSpoolFile(capture.baseURL, { counter: 1, body: new Uint8Array([9]) });

  const restarted = ctx.restart();

  await restarted.runStart();

  const rows = await ctx.readCaptureRows();
  const inputs = await ctx.readInputRows();

  expect(rows).toStrictEqual([
    expect.objectContaining({ state: 'closed', close_cause: 'start', sealed_private_key: null }),
  ]);

  expect(inputs.map((row) => row.state)).toStrictEqual(['stored']);

  const received1 = await ctx.readKeyRows();

  expect(received1).toHaveLength(1);
});

test('it closes a capture whose key is gone with no intake', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  await ctx.writeSpoolFile(capture.baseURL, { counter: 1, body: new Uint8Array([9]) });

  const rowRows = await ctx.readCaptureRows();

  const [row] = rowRows;

  await removeRecordKey(ctx.log, row?.key_id ?? '');

  await ctx.restart().runStart();

  const rows = await ctx.readCaptureRows();

  expect(rows.map((entry) => entry.state)).toStrictEqual(['closed']);

  const received2 = await ctx.readInputRows();

  expect(received2).toStrictEqual([]);
});

test('it removes a row left in writing and its stray file', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();
  const rowRows = await ctx.readCaptureRows();

  const [row] = rowRows;

  await capture.close({ callFrames: 0 });

  const recordKey = await createRecordKey(ctx.log, 'a-body-key');

  await getTurnInputsDB(ctx.log)
    .insertInto('turn_inputs')
    .values({
      input_id: '11111111-1111-4111-8111-111111111111',
      capture_id: row?.capture_id ?? '',
      task_id: 'task-a',
      step_run_id: 'step-1@1',
      writer: 'aa',
      counter: 1,
      role: 'task',
      profile: 'main',
      model: 'm',
      harness: 'agent-sdk',
      api: 'anthropic-messages',
      endpoint: 'messages',
      route: 'claude',
      is_rewritten: 0,
      upstream_status: 200,
      bytes: 1,
      key_id: recordKey.keyID,
      intake_sequence: 0,
      received_at: 0,
      taken_at: 0,
      state: 'writing',
      removed_cause: null,
    })
    .execute();

  await mkdir(join(ctx.dataDir, 'turn-inputs'), { recursive: true });

  await writeFile(
    join(ctx.dataDir, 'turn-inputs', '11111111-1111-4111-8111-111111111111.bin.tmp'),
    'x',
  );

  await writeFile(
    join(ctx.dataDir, 'turn-inputs', '22222222-2222-4222-8222-222222222222.bin'),
    'x',
  );

  await ctx.restart().runStart();

  const received3 = await ctx.readInputRows();

  expect(received3).toStrictEqual([]);

  const received4 = await ctx.readBodyFiles();

  expect(received4).toStrictEqual([]);

  const received5 = await ctx.readKeyRows();

  expect(received5).toStrictEqual([]);
});

test('it marks a stored row with no file as missing', async () => {
  const ctx = await setupTest();
  const capture = await ctx.openStep();

  await ctx.writeSpoolFile(capture.baseURL, { counter: 1, body: new Uint8Array([9]) });
  await capture.close({ callFrames: 1 });

  const inputRows = await ctx.readInputRows();

  const [input] = inputRows;

  await Bun.file(join(ctx.dataDir, 'turn-inputs', `${input?.input_id}.bin`)).delete();
  await ctx.restart().runStart();

  const rows = await ctx.readInputRows();

  expect(rows.map((row) => row.state)).toStrictEqual(['missing']);

  const received6 = await ctx.turnInputs.open(input?.input_id ?? '');

  expect(received6).toStrictEqual({ status: 'removed' });
});
