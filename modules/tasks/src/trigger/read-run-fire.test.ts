import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { readRunRows } from '../run/read-run-rows';
import { claimTask } from '../task/projection/claim-task';
import { writeInboxRecords } from '../task/projection/write-inbox-records';
import { runTaskStep } from '../task/run-task-step';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { writeTestTriggerFire } from '../test-utils/write-test-trigger-fire';
import { readRunFire } from './read-run-fire';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    createFireTask: () =>
      seedDefinitionTask(tasks, {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
      }),
    readFirstRun: async (taskID: string) => {
      const [run] = await readRunRows(tasks.writer.db, taskID);

      invariant(run, 'a run is open');

      return run;
    },
    claimAndRun: async () => {
      const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000 });

      invariant(claim, 'a task is claimed');

      await runTaskStep(tasks.context, claim, {
        runStep: (input) =>
          Promise.resolve({
            next: 'wait',
            records: [],
            acknowledged: input.inbox.map((record) => record.sequence),
          }),
        leaseMs: 60_000,
        logger: () => {},
        maxStepErrors: 3,
        retryDelayMs: 30_000,
        maxRetryDelayMs: 300_000,
      });
    },
  };
}

test('it reads the fire that opened the task run, with the pinned hash', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.createFireTask();

  const sequence = await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: 'hash-1',
    scheduledFor: '2026-06-03T20:30:00.000Z',
    isCatchUp: true,
    skipped: ['2026-06-02T20:30:00.000Z'],
    skippedCount: 1,
  });

  await ctx.claimAndRun();

  const run = await ctx.readFirstRun(taskID);
  const found = await readRunFire(ctx.context, run);

  expect(found).toStrictEqual({
    sequence,
    fire: expect.objectContaining({
      kind: 'schedule',
      scheduledFor: '2026-06-03T20:30:00.000Z',
      isCatchUp: true,
      skippedCount: 1,
    }),
    startedAt: expect.any(Date),
    definitionHash: 'hash-1',
  });
});

test('it reads no fire for a task run that an owner message opened', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.createFireTask();

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: ctx.context.definitions(),
      thread: taskID,
      erasable: { text: 'water them now' },
    },
  ]);

  await ctx.claimAndRun();

  const run = await ctx.readFirstRun(taskID);
  const found = await readRunFire(ctx.context, run);

  expect(found).toBeNull();
});

test('it reads no fire for a poll fire', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.createFireTask();

  await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: 'hash-1',
    kind: 'poll',
    polled: [1],
  });

  await ctx.claimAndRun();

  const run = await ctx.readFirstRun(taskID);
  const found = await readRunFire(ctx.context, run);

  expect(found).toBeNull();
});
