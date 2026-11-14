import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { seedDriftedThread } from './seed-drifted-thread';
import { startTestLog } from './start-test-log';

test('it leaves a thread whose record count disagrees with its records', async () => {
  const ctx = await startTestLog();

  await seedDriftedThread(ctx, { kind: 'owner_message', thread: 'garden' });

  const rows = await sql`
    select thread, record_count from threads`.execute(ctx.writer.db);

  expect(rows.rows).toStrictEqual([{ thread: 'garden', record_count: 9 }]);
});
