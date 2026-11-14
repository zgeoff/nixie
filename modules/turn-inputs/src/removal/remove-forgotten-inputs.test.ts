import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeRecords } from '@heynixie/log';
import { readTestRecordKeyRows } from '@heynixie/log/test-utils';
import { inputLogSetCodec } from '../state/input-log-set-codec';
import { startTestTurnInputs } from '../test-utils';

async function setupTest() {
  const ctx = await startTestTurnInputs();

  await ctx.turnInputs.runStart();

  return {
    ...ctx,

    // stores one request of a thread, as a step would
    writeInput: async (taskID: string, counter = 1) => {
      const capture = await ctx.turnInputs.openCapture({
        step: { taskID, stepRunID: `${taskID}-step@1` },
        profile: ctx.profile,
        role: 'task',
      });

      await ctx.writeSpoolFile(capture.baseURL, { counter, body: new Uint8Array([counter]) });
      await capture.close({ callFrames: counter });
    },
    writeRecord: async () => {
      const [record] = await writeRecords(ctx.log, [
        {
          kind: inputLogSetCodec.kind,
          definitions: { snapshotHash: 'sha256:aa11' },
          payload: inputLogSetCodec.encode({ state: 'on', until: null }),
        },
      ]);

      return record?.sequence ?? 0;
    },
    readStates: async () => {
      const list = await ctx.turnInputs.list(20);

      return list.inputs
        .toSorted((first, second) => first.intakeSequence - second.intakeSequence)
        .map((input) => [input.taskID, input.state, input.removedCause]);
    },
    readKeyRows: () => readTestRecordKeyRows(ctx.writer),
    readBodyFiles: () => readdir(join(ctx.dataDir, 'turn-inputs')),
  };
}

test('it removes every request on a covered thread and each later request on another', async () => {
  const ctx = await setupTest();

  await ctx.writeInput('conversation');
  await ctx.writeInput('task-a');

  const sequence = await ctx.writeRecord();

  await ctx.writeInput('task-b');
  await ctx.turnInputs.removeForgotten({ threads: ['conversation'], fromSequence: sequence });

  const received1 = await ctx.readStates();

  expect(received1).toStrictEqual([
    ['conversation', 'removed', 'forget'],
    ['task-a', 'stored', null],
    ['task-b', 'removed', 'forget'],
  ]);

  const received2 = await ctx.readKeyRows();

  expect(received2).toHaveLength(1);

  const received3 = await ctx.readBodyFiles();

  expect(received3).toHaveLength(1);
});

test('it removes each request after a forgotten record on every thread and keeps an earlier one', async () => {
  const ctx = await setupTest();

  await ctx.writeInput('task-a');

  const sequence = await ctx.writeRecord();

  await ctx.writeInput('conversation');
  await ctx.turnInputs.removeForgotten({ threads: [], fromSequence: sequence });

  const received4 = await ctx.readStates();

  expect(received4).toStrictEqual([
    ['task-a', 'stored', null],
    ['conversation', 'removed', 'forget'],
  ]);
});

test('it removes every request when the sequence cannot be found', async () => {
  const ctx = await setupTest();

  await ctx.writeInput('task-a');
  await ctx.writeInput('task-b');
  await ctx.turnInputs.removeForgotten({ threads: [], fromSequence: null });

  const received5 = await ctx.readStates();

  expect(received5).toStrictEqual([
    ['task-a', 'removed', 'forget'],
    ['task-b', 'removed', 'forget'],
  ]);
});

test('it does nothing on a rerun', async () => {
  const ctx = await setupTest();

  await ctx.writeInput('task-a');
  await ctx.turnInputs.removeForgotten({ threads: [], fromSequence: null });
  await ctx.turnInputs.removeForgotten({ threads: [], fromSequence: null });

  const received6 = await ctx.readStates();

  expect(received6).toStrictEqual([['task-a', 'removed', 'forget']]);

  const received7 = await ctx.readKeyRows();

  expect(received7).toStrictEqual([]);
});

test('it opens nothing of a forgotten request', async () => {
  const ctx = await setupTest();

  await ctx.writeInput('task-a');

  const listed = await ctx.turnInputs.list(10);

  const [input] = listed.inputs;

  await ctx.turnInputs.removeForgotten({ threads: ['task-a'], fromSequence: null });

  const received8 = await ctx.turnInputs.open(input?.inputID ?? '');

  expect(received8).toStrictEqual({ status: 'removed' });
});

test('it removes every stored request with dropped on off with drop', async () => {
  const ctx = await setupTest();

  await ctx.writeInput('task-a');
  await ctx.writeInput('task-b');
  await ctx.turnInputs.set({ state: 'off', drop: true });

  const received9 = await ctx.readStates();

  expect(received9).toStrictEqual([
    ['task-a', 'removed', 'dropped'],
    ['task-b', 'removed', 'dropped'],
  ]);

  const received10 = await ctx.readKeyRows();

  expect(received10).toStrictEqual([]);
});
