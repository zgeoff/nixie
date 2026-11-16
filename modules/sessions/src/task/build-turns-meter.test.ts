import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { claimTask, readOpenRun } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { workerTurnEndedCodec } from '../worker/worker-turn-ended-codec';
import { buildTurnsMeter } from './build-turns-meter';

async function setupTest() {
  const tasks = await startTestTasks();

  const seed = buildSeeder(tasks);

  const starter = await seed.conversationStep();

  const taskID = await seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  const run = await readOpenRun(tasks.context.log.writer.db, taskID);

  invariant(run, 'the claim opened a task run');

  return {
    tasks,
    run,
    readTurns: () => buildTurnsMeter().read(tasks.context, run),
  };
}

test('it counts no turn for a worker call of the task run', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: workerTurnEndedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: ctx.run.taskID,
      payload: workerTurnEndedCodec.encode({
        workerRunID: crypto.randomUUID(),
        callID: crypto.randomUUID(),
        taskRunID: ctx.run.runID,
        model: 'claude-worker-test',
        profile: 'worker-direct',
        turn: 1,
        inputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        dollars: 0.01,
      }),
      erasable: { text: 'Found 3 cafes.' },
    },
  ]);

  const turns = await ctx.readTurns();

  expect(turns).toBe(0);
});
