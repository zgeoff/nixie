import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readTurnRecalledThrough } from './read-turn-recalled-through';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  const definitions = { snapshotHash: 'sha256:test' };
  const thread = 'conversation';

  const writeSequence = async (kind: 'memory.recalled' | 'tool_called', payload: JSONObject) => {
    const [written] = await writeRecords(tasks.context.log, [
      { kind, definitions, thread, payload },
    ]);

    invariant(written);

    return written.sequence;
  };

  const writeResult = async (callSequence: number) => {
    await writeRecords(tasks.context.log, [
      { kind: 'tool_result', definitions, thread, parent: callSequence, payload: {} },
    ]);
  };

  const writeInterrupt = async (stepKey: string) => {
    await writeRecords(tasks.context.log, [
      {
        kind: 'task.interrupted',
        definitions,
        thread,
        payload: { taskID: thread, stepKey },
      },
    ]);
  };

  return {
    tasks,
    writeRecall: () => writeSequence('memory.recalled', { items: [] }),
    writeTurnNote: () => writeSequence('memory.recalled', { items: [], isTurnNote: true }),
    writeCall: () => writeSequence('tool_called', {}),
    writeResult,
    writeInterrupt,
    readThrough: (stepKey: string) =>
      readTurnRecalledThrough(tasks.context, { taskID: thread, stepKey }),
  };
}

test('it counts a recall whose tool result comes before the interrupt', async () => {
  const ctx = await setupTest();
  const call = await ctx.writeCall();
  const recall = await ctx.writeRecall();

  await ctx.writeResult(call);
  await ctx.writeInterrupt('conversation:2');

  const through = await ctx.readThrough('conversation:2');

  expect(through).toBe(recall);
});

test('it leaves out a recall whose tool result comes after the interrupt', async () => {
  const ctx = await setupTest();
  const firstCall = await ctx.writeCall();
  const first = await ctx.writeRecall();

  await ctx.writeResult(firstCall);

  const secondCall = await ctx.writeCall();

  await ctx.writeRecall();
  await ctx.writeInterrupt('conversation:2');
  await ctx.writeResult(secondCall);

  const through = await ctx.readThrough('conversation:2');

  expect(through).toBe(first);
});

test('it reads 0 when the only recall has no tool result before the interrupt', async () => {
  const ctx = await setupTest();
  const call = await ctx.writeCall();

  await ctx.writeRecall();
  await ctx.writeInterrupt('conversation:2');
  await ctx.writeResult(call);

  const through = await ctx.readThrough('conversation:2');

  expect(through).toBe(0);
});

test('it counts the newest recall when the interrupt belongs to another step', async () => {
  const ctx = await setupTest();
  const call = await ctx.writeCall();

  await ctx.writeRecall();
  await ctx.writeInterrupt('conversation:1');

  const newest = await ctx.writeRecall();

  await ctx.writeResult(call);

  const through = await ctx.readThrough('conversation:2');

  expect(through).toBe(newest);
});

test('it counts a turn note, which has no tool call', async () => {
  const ctx = await setupTest();
  const note = await ctx.writeTurnNote();

  await ctx.writeInterrupt('conversation:2');

  const through = await ctx.readThrough('conversation:2');

  expect(through).toBe(note);
});
