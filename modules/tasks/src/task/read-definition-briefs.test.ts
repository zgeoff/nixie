import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { readRunRows } from '../run/read-run-rows';
import { writeStepCommit } from '../step/write-step-commit';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { writeTestTriggerFire } from '../test-utils/write-test-trigger-fire';
import type { StartedClaim } from '../types';
import { writeTaskLimitRaise } from './limit/write-task-limit-raise';
import { claimTask } from './projection/claim-task';
import { readTaskBrief } from './read-task-brief';
import { readTaskBriefs } from './read-task-briefs';

async function setupTest() {
  const tasks = await startTestTasks();

  onTestFinished(() => {
    setSystemTime();
  });

  return {
    ...tasks,
    setNow: (timeMs: number) => {
      setSystemTime(new Date(timeMs));
    },
    enableDefinition: (brief: string) =>
      seedDefinitionTask(tasks, {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
        version: { name: 'Water the tomatoes', brief },
      }),
    withdrawDefinition: (brief: string) =>
      seedDefinitionTask(tasks, {
        definitionID: 'water-the-tomatoes',
        definitionHash: null,
        version: { name: 'Water the tomatoes', brief },
      }),

    // a fire that the claim turns into an open task run
    openRun: async (taskID: string): Promise<StartedClaim> => {
      await writeTestTriggerFire(tasks.context, taskID, {
        definitionHash: 'hash-1',
        dedupeKey: 'fire-1',
      });

      const claim = await claimTask(tasks.context, {
        holder: 'runner-a',
        leaseMs: 60_000,
        taskID,
      });

      invariant(claim, 'the fire is ready to claim');

      return claim;
    },
    readRuns: (taskID: string) => readRunRows(tasks.writer.db, taskID),
    endAtLimit: (claim: StartedClaim) =>
      writeStepCommit(tasks.context, claim, {
        next: 'continue',
        records: [],
        acknowledged: [],
        run: { activity: 'worked', limit: { meter: 'turns', used: 40, limit: 40 } },
      }),
    raiseRun: async (taskID: string) => {
      await writeTaskLimitRaise(tasks.context, { taskID, limits: { turns: 50 } });

      return claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });
    },
  };
}

test('it reads the brief of a definition task from its open task run and the version it pins', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.enableDefinition('Water the tomatoes at dawn.');

  ctx.setNow(2_000_000);

  await ctx.openRun(taskID);

  const [run] = await ctx.readRuns(taskID);
  const brief = await readTaskBrief(ctx.context, taskID);

  expect(brief).toStrictEqual({
    origin: 'definition',
    briefID: run?.opened.briefID ?? '',
    sequence: run?.openedSequence ?? 0,
    sentAt: new Date(2_000_000),
    body: 'Water the tomatoes at dawn.',
  });

  expect(run?.opened.briefID).toBeString();
});

test('it reads no brief of a definition task with no open task run', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.enableDefinition('Water the tomatoes at dawn.');
  const brief = await readTaskBrief(ctx.context, taskID);

  expect(brief).toBeNull();
});

test('it reads the same brief ID for a task run that carries another', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.enableDefinition('Water the tomatoes at dawn.');
  const claim = await ctx.openRun(taskID);

  await ctx.endAtLimit(claim);
  await ctx.raiseRun(taskID);

  const [first, carried] = await ctx.readRuns(taskID);
  const brief = await readTaskBrief(ctx.context, taskID);

  expect(carried?.opened.carriesRunID).toBe(first?.runID ?? null);
  expect(brief).toMatchObject({ origin: 'definition', briefID: first?.opened.briefID });
  expect(carried?.opened.briefID).toBe(first?.opened.briefID ?? null);
});

test('it reads the brief of the version that an open task run pins for a definition out of force', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.enableDefinition('Water the tomatoes at dawn.');

  await ctx.openRun(taskID);
  await ctx.withdrawDefinition('A later brief that the run does not pin.');

  const briefs = await readTaskBriefs(ctx.context, [taskID]);

  expect(briefs.get(taskID)).toMatchObject({
    origin: 'definition',
    body: 'Water the tomatoes at dawn.',
  });
});

test('it leaves a definition task with no open task run out of the briefs', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.enableDefinition('Water the tomatoes at dawn.');
  const briefs = await readTaskBriefs(ctx.context, [taskID]);

  expect([...briefs.keys()]).toStrictEqual([]);
});
