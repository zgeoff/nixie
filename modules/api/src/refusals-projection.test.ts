import { expect, test } from 'bun:test';
import { runProjectionRebuild } from '@heynixie/log';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';
import { writeRefusal } from './write-refusal';

function setupTest() {
  return startTestAPI();
}

test('it keeps the last refusal time for each external ID', async () => {
  const ctx = await setupTest();

  await writeRefusal(ctx.context, { channel: 'client', externalID: 'ab12' });

  ctx.clock.advance(60 * 60 * 1000);

  await writeRefusal(ctx.context, { channel: 'client', externalID: 'ab12' });

  const rows = await ctx.writer.db
    .$extendTables<APITables>()
    .selectFrom('refusals')
    .select(['refusal_key', 'refused_at'])
    .execute();

  expect(rows).toStrictEqual([
    { refusal_key: 'client:ab12', refused_at: 1_000_000 + 60 * 60 * 1000 },
  ]);
});

test('it gives the live rows again after a rebuild', async () => {
  const ctx = await setupTest();

  await writeRefusal(ctx.context, { channel: 'client', externalID: 'ab12' });
  await writeRefusal(ctx.context, { channel: 'client', externalID: 'cd34' });

  const db = ctx.writer.db.$extendTables<APITables>();

  const live = await db.selectFrom('refusals').selectAll().orderBy('refusal_key').execute();

  await runProjectionRebuild(ctx.context.log);

  const result = await db.selectFrom('refusals').selectAll().orderBy('refusal_key').execute();

  expect(result).toStrictEqual(live);
});
