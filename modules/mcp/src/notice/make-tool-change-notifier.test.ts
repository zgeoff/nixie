import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import {
  seedDefinitionTask,
  seedOpenDefinitionRun,
  startTestTasks,
} from '@heynixie/tasks/test-utils';
import type { PinMove } from '../types';
import { makeToolChangeNotifier } from './make-tool-change-notifier';

async function setupTest() {
  const tasks = await startTestTasks();

  const notify = makeToolChangeNotifier(tasks.context);

  return {
    ...tasks,
    startRun: async (definitionID: string, tools: readonly string[]) => {
      const hash = `${definitionID}-hash`;

      const taskID = await seedDefinitionTask(tasks, {
        definitionID,
        definitionHash: hash,
        version: { tools },
      });

      await seedOpenDefinitionRun(tasks.context, { taskID, definitionID, definitionHash: hash });

      return taskID;
    },
    move: (move: PinMove) => withWriteTransaction(tasks.writer, (tx) => notify(tx, move)),
    trustedChange: {
      tool: 'tracker.item_get',
      fromHash: 'old',
      toHash: 'new',
      cause: 'trusted_change',
    } satisfies PinMove,
    readNotes: async () => {
      const records = await readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['tool_changed'],
      });

      return records.map((entry) => [entry.record.thread, entry.record.payload]);
    },
  };
}

test('it leaves the change note in the conversation and in each task whose run holds the tool', async () => {
  const ctx = await setupTest();
  const chase = await ctx.startRun('chase-items', ['tracker.*']);

  await ctx.startRun('water-plants', ['notes_read']);
  await ctx.move(ctx.trustedChange);

  const payload = { tool: 'tracker.item_get', fromHash: 'old', toHash: 'new' };

  const notes = await ctx.readNotes();

  expect(notes).toStrictEqual([
    ['conversation', payload],
    [chase, payload],
  ]);
});

test('it leaves no note for a pin that you allowed yourself', async () => {
  const ctx = await setupTest();

  await ctx.startRun('chase-items', ['tracker.item_get']);
  await ctx.move({ ...ctx.trustedChange, cause: 'allowed' });

  const notes = await ctx.readNotes();

  expect(notes).toStrictEqual([]);
});
