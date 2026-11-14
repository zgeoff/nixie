import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readTestRecordKeyRows } from '@heynixie/log/test-utils';
import { startTestTurnInputs } from '../test-utils';

async function setupTest() {
  const ctx = await startTestTurnInputs();

  await ctx.turnInputs.runStart();

  return {
    ...ctx,

    // stores one request of a thread, as a step would
    writeInput: async (taskID: string) => {
      const capture = await ctx.turnInputs.openCapture({
        step: { taskID, stepRunID: `${taskID}-step@1` },
        profile: ctx.profile,
        role: 'task',
      });

      await ctx.writeSpoolFile(capture.baseURL, { counter: 1, body: new Uint8Array([7]) });
      await capture.close({ callFrames: 1 });
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

test('it removes every request on a reset thread and keeps the others', async () => {
  const ctx = await setupTest();

  await ctx.writeInput('conversation');
  await ctx.writeInput('task-a');
  await ctx.turnInputs.removeThreads(['conversation']);

  const received1 = await ctx.readStates();

  expect(received1).toStrictEqual([
    ['conversation', 'removed', 'reset'],
    ['task-a', 'stored', null],
  ]);

  const received2 = await ctx.readKeyRows();

  expect(received2).toHaveLength(1);

  const received3 = await ctx.readBodyFiles();

  expect(received3).toHaveLength(1);
});

test('it closes the open capture of a reset thread so a later spool file is not stored', async () => {
  const ctx = await setupTest();

  const capture = await ctx.turnInputs.openCapture({
    step: { taskID: 'conversation', stepRunID: 'conversation:1@1' },
    profile: ctx.profile,
    role: 'conversation',
  });

  await ctx.turnInputs.removeThreads(['conversation']);
  await ctx.writeSpoolFile(capture.baseURL, { counter: 1, body: new Uint8Array([7]) });
  await capture.close({ callFrames: 1 });

  const received4 = await ctx.turnInputs.list(20);

  expect(received4.inputs).toStrictEqual([]);

  const received5 = await ctx.readKeyRows();

  expect(received5).toStrictEqual([]);
});
