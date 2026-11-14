import { expect, test } from 'bun:test';
import { nixieSchema } from '@heynixie/db';
import { ruleFiresProjection } from '@heynixie/definitions';
import {
  logProjections,
  runProjectionRebuild,
  withWriteTransaction,
  writeRecords,
} from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';

async function setupTest() {
  const base = await startTestLog();

  const log = { ...base.log, projections: [...logProjections, ruleFiresProjection] };

  const migration = nixieSchema.migrations.find(
    (candidate) => candidate.name === 'remove the retired read-only rule ID',
  );

  invariant(migration);

  return {
    log,
    runMigration: () => withWriteTransaction(log.writer, (tx) => migration.up(tx)),
    readStored: async () => {
      const decisions = await sql`select sequence, decision from records
        where decision is not null order by sequence`.execute(log.writer.db);

      const fires = await sql`select rule_id, last_fired_at from rule_fires
        order by rule_id`.execute(log.writer.db);

      const changes = await sql`select sequence, projection, row_key from projection_changes
        where projection = 'rule_fires' order by sequence, row_key`.execute(log.writer.db);

      return { decisions: decisions.rows, fires: fires.rows, changes: changes.rows };
    },
  };
}

test('it gives the same rows after a projection rebuild as it left, with no row naming the ID', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:aa11', personaVersion: 'p1' };

  await writeRecords(ctx.log, [
    {
      kind: 'tool_called',
      definitions,
      thread: 'conversation',
      decision: { outcome: 'allow', stage: 3, rule: { id: 'slice1.read-only', revision: 1 } },
    },
    {
      kind: 'tool_called',
      definitions,
      thread: 'conversation',
      decision: { outcome: 'deny', stage: 3, rule: { id: 'slice1.read-only', revision: 1 } },
    },
    {
      kind: 'tool_called',
      definitions,
      thread: 'conversation',
      decision: { outcome: 'allow', stage: 3, rule: { id: 'allow-sends', revision: 2 } },
    },
  ]);

  const before = await ctx.readStored();

  await ctx.runMigration();

  const migrated = await ctx.readStored();

  await runProjectionRebuild(ctx.log);

  const rebuilt = await ctx.readStored();

  expect(before.fires).toStrictEqual([
    { rule_id: 'allow-sends', last_fired_at: expect.any(Number) },
    { rule_id: 'slice1.read-only', last_fired_at: expect.any(Number) },
  ]);

  expect(migrated.decisions).toStrictEqual([
    { sequence: 1, decision: '{"outcome":"allow","stage":3,"rule":null}' },
    { sequence: 2, decision: '{"outcome":"deny","stage":3,"rule":null}' },
    {
      sequence: 3,
      decision: '{"outcome":"allow","stage":3,"rule":{"id":"allow-sends","revision":2}}',
    },
  ]);

  expect(rebuilt).toStrictEqual(migrated);
  expect(JSON.stringify(rebuilt)).not.toContain('slice1.read-only');
});
