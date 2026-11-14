import { expect, test } from 'bun:test';
import { startTestMemoryWriter } from '@heynixie/memory/test-utils';
import { startTestServer } from '@heynixie/server/test-utils';
import { sql } from 'kysely';
import { z } from 'zod';
import { runStubCheck, seedMemoryTaskData } from './seed-memory-task-data';

async function setupTest() {
  const server = await startTestServer(undefined, { fakeGuest: true });
  const memory = await startTestMemoryWriter(server, { check: runStubCheck });

  return { server, memory, log: memory.context.log };
}

test('it writes the records of both tasks, their proposals and their stored rows', async () => {
  const ctx = await setupTest();

  await seedMemoryTaskData(ctx);

  const kinds = await sql`select distinct kind from records
    where thread in ('memory-writer', 'memory-consolidator') order by kind`.execute(
    ctx.log.writer.db,
  );

  const approvals = await sql`select count(*) as count
    from prompt_approvals where prompt_id = 'writer'`.execute(ctx.log.writer.db);

  const names = z.object({ kind: z.string() }).array().parse(kinds.rows);

  expect(names.map((row) => row.kind)).toStrictEqual(
    expect.arrayContaining([
      'memory.batch_published',
      'memory.consolidation_approved',
      'memory.proposed',
      'task.created',
      'task_message',
    ]),
  );

  expect(approvals.rows).toStrictEqual([{ count: 1 }]);
});
