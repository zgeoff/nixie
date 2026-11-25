import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { claimTask } from '../task/projection/claim-task';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedDefinitionTask } from '../test-utils/seed-definition-task';
import { seedOpenDefinitionRun } from '../test-utils/seed-open-definition-run';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readToolHolders } from './read-tool-holders';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    readHolders: (tool: string) =>
      withWriteTransaction(tasks.writer, (tx) => readToolHolders(tx, tasks.context, tool)),
    startDefinitionRun: async (definitionID: string, tools: readonly string[]) => {
      const hash = `${definitionID}-hash`;

      const taskID = await seedDefinitionTask(tasks, {
        definitionID,
        definitionHash: hash,
        version: { tools },
      });

      await seedOpenDefinitionRun(tasks.context, { taskID, definitionID, definitionHash: hash });

      return taskID;
    },
  };
}

test('it finds the task whose open run holds the tool by its name', async () => {
  const ctx = await setupTest();
  const holder = await ctx.startDefinitionRun('chase-items', ['tracker.item_get']);

  await ctx.startDefinitionRun('water-plants', ['notes_read']);

  const holders = await ctx.readHolders('tracker.item_get');

  expect(holders).toStrictEqual([holder]);
});

test('it finds the task whose open run lists every tool of the server', async () => {
  const ctx = await setupTest();
  const holder = await ctx.startDefinitionRun('chase-items', ['tracker.*']);

  await ctx.startDefinitionRun('water-plants', ['metrics.*']);

  const holders = await ctx.readHolders('tracker.item_get');

  expect(holders).toStrictEqual([holder]);
});

test('it finds a started task that was started with the tool', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const holder = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Chase items',
    brief: 'Chase the open items.',
    options: { tools: ['tracker.item_get'] },
  });

  await claimTask(ctx.context, { holder: 'runner', leaseMs: 60_000, taskID: holder });

  await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Read notes',
    brief: 'Read the notes.',
    options: { tools: ['notes_read'] },
  });

  const holders = await ctx.readHolders('tracker.item_get');

  expect(holders).toStrictEqual([holder]);
});

test('it finds no task for a definition that holds the tool but has no open run', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, {
    definitionID: 'chase-items',
    definitionHash: 'chase-items-hash',
    version: { tools: ['tracker.item_get'] },
  });

  const holders = await ctx.readHolders('tracker.item_get');

  expect(holders).toStrictEqual([]);
});
