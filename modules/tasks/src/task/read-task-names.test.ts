import { expect, test } from 'bun:test';
import type { KyselyPlugin } from 'kysely';
import { seedChildTask } from '../test-utils/seed-child-task';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { TaskDirectoryQuery } from './read-task-directory';
import { readTaskNames } from './read-task-names';

async function setupTest() {
  const tasks = await startTestTasks();
  const step = await seedConversationStep(tasks.context);

  const createdRecords: number[] = [];

  const recordReadsPlugin: KyselyPlugin = {
    transformQuery: (args) => args.node,
    transformResult: (args) => {
      for (const row of args.result.rows) {
        if (
          typeof row === 'object' &&
          row !== null &&
          'kind' in row &&
          row['kind'] === 'task.created'
        ) {
          createdRecords.push(Number(row['sequence']));
        }
      }

      return Promise.resolve(args.result);
    },
  };

  const watchedContext = {
    ...tasks.context,
    log: {
      ...tasks.context.log,
      writer: {
        ...tasks.context.log.writer,
        db: tasks.context.log.writer.db.withPlugin(recordReadsPlugin),
      },
    },
  };

  return {
    tasks,
    createdRecords,
    startInboxTask: () =>
      seedTask(tasks.context, {
        starter: step.claim,
        name: 'Read the inbox',
        brief: 'Read the new mail.',
      }),
    startBedsTask: (parentID: string) =>
      seedChildTask(tasks.context, {
        parentID,
        name: 'Plan the beds',
        brief: 'Plan the garden beds.',
      }),
    bindWateringTask: () =>
      seedDefinitionTask(tasks, {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
        version: { name: 'Water the tomatoes' },
      }),
    readNames: (query: TaskDirectoryQuery = {}) => readTaskNames(tasks.context, query),
    readWatchedNames: (query: TaskDirectoryQuery) => readTaskNames(watchedContext, query),
  };
}

test('#readTaskNames names every started task and definition task when no IDs are given', async () => {
  const ctx = await setupTest();
  const inboxID = await ctx.startInboxTask();
  const bedsID = await ctx.startBedsTask(inboxID);
  const wateringID = await ctx.bindWateringTask();
  const names = await ctx.readNames();

  expect([...names]).toStrictEqual([
    [inboxID, 'Read the inbox'],
    [bedsID, 'Plan the beds'],
    [wateringID, 'Water the tomatoes'],
  ]);
});

test('#readTaskNames leaves out a started task and a definition task that the given IDs do not name', async () => {
  const ctx = await setupTest();
  const inboxID = await ctx.startInboxTask();
  const bedsID = await ctx.startBedsTask(inboxID);

  await ctx.bindWateringTask();

  const names = await ctx.readNames({ taskIDs: [bedsID] });

  expect([...names]).toStrictEqual([[bedsID, 'Plan the beds']]);
});

test('#readTaskNames names a definition task that the given IDs name', async () => {
  const ctx = await setupTest();

  await ctx.startInboxTask();

  const wateringID = await ctx.bindWateringTask();
  const names = await ctx.readNames({ taskIDs: [wateringID] });

  expect([...names]).toStrictEqual([[wateringID, 'Water the tomatoes']]);
});

test('#readTaskNames reads the creation record of only the tasks that the given IDs name', async () => {
  const ctx = await setupTest();
  const inboxID = await ctx.startInboxTask();
  const bedsID = await ctx.startBedsTask(inboxID);
  const names = await ctx.readWatchedNames({ taskIDs: [bedsID] });

  expect([...names]).toStrictEqual([[bedsID, 'Plan the beds']]);
  expect(new Set(ctx.createdRecords).size).toBe(1);
});
