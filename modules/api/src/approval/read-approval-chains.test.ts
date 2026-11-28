import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import type { TasksTables } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import type { KyselyPlugin } from 'kysely';
import { startTestAPI } from '../test-utils/start-test-api';
import { readApprovalChains } from './read-approval-chains';

async function setupTest() {
  const api = await startTestAPI();

  const seeder = buildTaskSeeder({ context: api.context });

  const step = await seeder.conversationStep();

  const inboxID = await seeder.task({
    starter: step.claim,
    name: 'Read the inbox',
    brief: 'Read the new mail.',
  });

  const askingID = await seeder.childTask({
    parentID: inboxID,
    name: 'Check the sender',
    brief: 'Check who sent it.',
  });

  const readSequences = async () => {
    const entries = await readRecords(api.context.log, { afterSequence: 0, limit: 1000 });

    return entries.map((entry) => entry.record.sequence);
  };

  const sequencesBefore = await readSequences();

  await seeder.task({
    starter: step.claim,
    name: 'Plan the beds',
    brief: 'Plan the garden beds.',
  });

  const sequencesAfter = await readSequences();

  const askingRow = await api.context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('created_sequence')
    .where('task_id', '=', askingID)
    .executeTakeFirstOrThrow();

  // the records of the unrelated task: its creation record and its brief
  const unrelated = new Set(
    sequencesAfter.filter((sequence) => !sequencesBefore.includes(sequence)),
  );

  const sequencesRead: number[] = [];

  const readsPlugin: KyselyPlugin = {
    transformQuery: (args) => args.node,
    transformResult: (args) => {
      for (const row of args.result.rows) {
        if (typeof row === 'object' && row !== null && 'sequence' in row && 'kind' in row) {
          sequencesRead.push(Number(row['sequence']));
        }
      }

      return Promise.resolve(args.result);
    },
  };

  const watched = {
    ...api.context,
    log: {
      ...api.context.log,
      writer: { ...api.context.log.writer, db: api.context.log.writer.db.withPlugin(readsPlugin) },
    },
  };

  return {
    unrelated,
    sequencesRead,
    readChains: () =>
      readApprovalChains(watched, [
        {
          proposalID: 'proposal-1',
          taskID: askingID,
          createdSequence: askingRow.created_sequence + 1,
        },
      ]),
  };
}

test('#readApprovalChains reads no creation record or brief of a task outside the chain', async () => {
  const ctx = await setupTest();
  const chains = await ctx.readChains();

  expect(chains.get('proposal-1')?.map((step) => step.name)).toContain('Check the sender');
  expect(ctx.sequencesRead.length).toBeGreaterThan(0);
  expect(ctx.unrelated.size).toBeGreaterThan(0);
  expect(ctx.sequencesRead.filter((sequence) => ctx.unrelated.has(sequence))).toStrictEqual([]);
});
