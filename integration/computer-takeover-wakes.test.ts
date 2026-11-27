import { expect, test } from 'bun:test';
import { makeTakeoverRecords } from '@heynixie/connectors';
import { createConversationTask } from '@heynixie/tasks';
import { sql } from 'kysely';
import { z } from 'zod';
import { startTestComputer } from './test-utils/start-test-computer';

async function setupTest() {
  const api = await startTestComputer();

  await createConversationTask(api.context);

  const records = makeTakeoverRecords({
    log: api.context.log,
    definitions: () => api.context.definitions(),
  });

  return {
    records,
    readInbox: async () => {
      const result = await sql`
        select last_inbox_sequence from tasks where task_id = 'conversation'
      `.execute(api.writer.db);

      const [row] = z
        .array(z.object({ last_inbox_sequence: z.number().nullable() }))
        .parse(result.rows);

      return row?.last_inbox_sequence ?? null;
    },
  };
}

test('it wakes the conversation when a hold ends, and not when it starts', async () => {
  const ctx = await setupTest();
  const before = await ctx.readInbox();

  await ctx.records.writeStarted({ device: 'laptop' });

  const afterStart = await ctx.readInbox();

  await ctx.records.writeEnded({ by: 'user', durationSeconds: 5, read: null });

  const afterEnd = await ctx.readInbox();

  expect([afterStart === before, afterEnd !== null && afterEnd !== afterStart]).toStrictEqual([
    true,
    true,
  ]);
});
