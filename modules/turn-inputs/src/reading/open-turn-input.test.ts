import { expect, test } from 'bun:test';
import { readTestRecordRows } from '@heynixie/log/test-utils';
import { createTurnInputs } from '../create-turn-inputs';
import { startTestTurnInputs } from '../test-utils';

async function setupTest() {
  const ctx = await startTestTurnInputs();

  await ctx.turnInputs.runStart();

  const capture = await ctx.turnInputs.openCapture({
    step: { taskID: 'task-a', stepRunID: 'step-1@1' },
    profile: ctx.profile,
    role: 'task',
  });

  await ctx.writeSpoolFile(capture.baseURL, { counter: 1, body: new Uint8Array([1, 2, 3]) });
  await capture.close({ callFrames: 1 });

  const list = await ctx.turnInputs.list(10);

  return {
    ...ctx,
    inputID: list.inputs[0]?.inputID ?? '',
    readRecordKinds: async () => {
      const rows = await readTestRecordRows(ctx.writer);

      return rows.map((row) => row.kind);
    },
  };
}

test('it opens a stored request and records the opening first', async () => {
  const ctx = await setupTest();
  const opened = await ctx.turnInputs.open(ctx.inputID);

  expect(opened).toStrictEqual({
    status: 'opened',
    inputID: ctx.inputID,
    body: new Uint8Array([1, 2, 3]),
  });

  const received1 = await ctx.readRecordKinds();

  expect(received1).toContain('model.input_opened');
});

test('it gives not_found for an ID with no row', async () => {
  const ctx = await setupTest();
  const received2 = await ctx.turnInputs.open('no-such-input');

  expect(received2).toStrictEqual({ status: 'not_found' });
});

test('it gives not_recorded and reads nothing when the opening cannot be committed', async () => {
  const ctx = await setupTest();

  const stale = createTurnInputs({
    ...ctx.turnInputsOptions,
    log: { ...ctx.log, writer: { ...ctx.log.writer, epoch: ctx.log.writer.epoch + 1 } },
  });

  const received3 = await stale.open(ctx.inputID);

  expect(received3).toStrictEqual({ status: 'not_recorded' });

  const received4 = await ctx.readRecordKinds();

  expect(received4).not.toContain('model.input_opened');
});

test('it lists a request with no key ID, body or sealed key', async () => {
  const ctx = await setupTest();
  const listed = await ctx.turnInputs.list(10);

  const inputs = listed.inputs;

  expect(Object.keys(inputs[0] ?? {})).not.toContain('keyID');
  expect(JSON.stringify(inputs)).not.toContain('key_id');
});
