import { expect, test } from 'bun:test';
import {
  exemptTaskInTransaction,
  pauseNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import { buildLogSeeder } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { taskLimitReachedCodec } from '../limit/task-limit-reached-codec';
import { writeTaskControl } from '../task/write-task-control';
import { buildTaskSeeder } from '../test-utils/build-task-seeder';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { GateCaller } from '../types';
import { buildGateFilter } from './build-gate-filter';
import { isGateBarring } from './is-gate-barring';
import { readTaskGate } from './read-task-gate';

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  const taskSeeds = buildTaskSeeder(tasks);
  const logSeeds = buildLogSeeder(tasks.context);
  const started = { starter: starter.claim, name: 'Tide tables', brief: 'Find the tides.' };
  const definitions = tasks.context.definitions();

  const pauseNixie = () =>
    withWriteTransaction(tasks.writer, (tx) =>
      pauseNixieInTransaction(tx, tasks.context.log, {
        cause: 'owner',
        recoveryID: null,
        by: 'session-a',
        definitions,
      }),
    );

  const seed = {
    readyTask: () => taskSeeds.task(started),
    stoppedTask: () => taskSeeds.stoppedTask(started),
    pausedTask: async () => {
      const taskID = await taskSeeds.task(started);

      await writeTaskControl(tasks.context, { taskID, control: 'pause' });

      return taskID;
    },
    limitedTask: async () => {
      const taskID = await taskSeeds.task(started);

      await logSeeds.record({
        kind: 'task.limit_reached',
        thread: taskID,
        payload: taskLimitReachedCodec.encode({
          taskID,
          stepKey: `${taskID}:1`,
          used: { turns: 1, dollars: 0.1 },
          limits: { turns: 1, dollars: 2 },
        }),
      });

      return taskID;
    },
    limitedPausedTask: () =>
      taskSeeds.pausedTask({ starter: starter.claim, limits: { turns: 1, dollars: 2 } }),
    nixiePausedTask: async () => {
      const taskID = await taskSeeds.task(started);

      await pauseNixie();

      return taskID;
    },
    spendStoppedExemptTask: async () => {
      const taskID = await taskSeeds.task(started);

      await pauseNixie();

      await withWriteTransaction(tasks.writer, (tx) =>
        exemptTaskInTransaction(tx, tasks.context.log, { taskID, by: 'session-a', definitions }),
      );

      await logSeeds.spendStop();

      return taskID;
    },
    stoppedNixiePausedTask: async () => {
      const taskID = await taskSeeds.stoppedTask(started);

      await pauseNixie();

      return taskID;
    },
  };

  return {
    ...tasks,
    seed,
    readFilter: async (caller: GateCaller, taskID: string, isStarted: boolean) => {
      const row = await tasks.writer.db
        .selectFrom(sql`(select 1)`.as('one'))
        .select((eb) =>
          buildGateFilter(eb, caller, {
            taskID: sql`${taskID}`,
            isStarted: sql`${isStarted ? 1 : 0}`,
          }).as('may_go_on'),
        )
        .executeTakeFirstOrThrow();

      return Boolean(row.may_go_on);
    },
    readGate: (caller: GateCaller, taskID: string) =>
      withWriteTransaction(tasks.writer, (tx) => readTaskGate(tx, taskID, caller)),
  };
}

test.each([
  ['no hold', 'readyTask', true],
  ['ended', 'stoppedTask', false],
  ['task', 'pausedTask', false],
  ['limit', 'limitedTask', true],
  ['limit and task', 'limitedPausedTask', false],
  ['nixie', 'nixiePausedTask', false],
  ['spend, with the task exempt from the pause', 'spendStoppedExemptTask', false],
  ['ended and nixie', 'stoppedNixiePausedTask', false],
] as const)(
  'it filters a task claim with %s, and the gate agrees',
  async (_hold, seeder, mayClaim) => {
    const ctx = await setupTest();
    const taskID = await ctx.seed[seeder]();
    const gate = await ctx.readGate('task_claim', taskID);
    const filtered = await ctx.readFilter('task_claim', taskID, false);

    expect([filtered, !isGateBarring('task_claim', gate, { isStarted: false })]).toStrictEqual([
      mayClaim,
      mayClaim,
    ]);
  },
);

test.each([
  ['no hold', 'readyTask', true, true],
  ['ended', 'stoppedTask', true, true],
  ['task', 'pausedTask', false, true],
  ['limit', 'limitedTask', false, true],
  ['limit and task', 'limitedPausedTask', false, true],
  ['nixie', 'nixiePausedTask', false, false],
  ['spend, with the task exempt from the pause', 'spendStoppedExemptTask', false, false],
  ['ended and nixie', 'stoppedNixiePausedTask', false, false],
] as const)(
  'it filters an action with %s, and the gate agrees',
  async (_hold, seeder, mayClaimUnstarted, mayClaimStarted) => {
    const ctx = await setupTest();
    const taskID = await ctx.seed[seeder]();
    const gate = await ctx.readGate('action', taskID);
    const unstarted = await ctx.readFilter('action', taskID, false);
    const started = await ctx.readFilter('action', taskID, true);

    expect([
      unstarted,
      started,
      !isGateBarring('action', gate, { isStarted: false }),
      !isGateBarring('action', gate, { isStarted: true }),
    ]).toStrictEqual([mayClaimUnstarted, mayClaimStarted, mayClaimUnstarted, mayClaimStarted]);
  },
);

test.each([
  ['no hold', 'readyTask', true],
  ['ended', 'stoppedTask', true],
  ['task', 'pausedTask', true],
  ['limit', 'limitedTask', true],
  ['limit and task', 'limitedPausedTask', true],
  ['nixie', 'nixiePausedTask', false],
  ['spend, with the task exempt from the pause', 'spendStoppedExemptTask', false],
  ['ended and nixie', 'stoppedNixiePausedTask', false],
] as const)(
  'it filters a conversation trigger with %s, and the gate agrees',
  async (_hold, seeder, mayFire) => {
    const ctx = await setupTest();
    const taskID = await ctx.seed[seeder]();
    const gate = await ctx.readGate('conversation_trigger', taskID);
    const filtered = await ctx.readFilter('conversation_trigger', taskID, false);

    expect([
      filtered,
      !isGateBarring('conversation_trigger', gate, { isStarted: false }),
    ]).toStrictEqual([mayFire, mayFire]);
  },
);
