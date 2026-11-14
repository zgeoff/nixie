import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { withTriggersDropped } from '../database/with-triggers-dropped';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

const retiredRuleID = 'slice1.read-only';

// Each stored row that named the ID loses it, and the snapshot hashes stay, because records and
// copies outside the database name a snapshot by hash. No expand step rewrites append-only rows, so
// the schema's oldest reader rises to this migration.
export const retiredRuleIDMigration: Migration = {
  name: 'remove the retired read-only rule ID',
  up: async (tx) => {
    await withTriggersDropped(tx, async () => {
      await rewriteDecisions(tx);

      await sql`delete from rule_fires where rule_id = ${retiredRuleID}`.execute(tx);

      await sql`delete from projection_changes
        where projection = 'rule_fires' and row_key = ${retiredRuleID}`.execute(tx);

      await rewriteSnapshotForms(tx);
    });
  },
};

// A parse with named keys moves them ahead of the others, which would reorder a canonical form. Each
// value is parsed as a plain record instead, and only the keys this migration changes are replaced.
const recordSchema = z.record(z.string(), z.unknown());
const ruleSchema = z.object({ id: z.string() });

async function rewriteDecisions(tx: Transaction<unknown>): Promise<void> {
  const rows = await readQueryRows(
    sql`select sequence, decision from records where decision like ${`%${retiredRuleID}%`}`,
    tx,
    z.object({ sequence: z.number(), decision: z.string() }),
  );

  for (const row of rows) {
    const decision = recordSchema.safeParse(JSON.parse(row.decision));

    if (!decision.success) {
      continue;
    }

    const rule = ruleSchema.safeParse(decision.data['rule']);
    const others = z.array(z.string()).safeParse(decision.data['ruleOthers']);

    const rewritten = {
      ...decision.data,
      ...(rule.success && rule.data.id === retiredRuleID ? { rule: null } : {}),
      ...(others.success ? { ruleOthers: others.data.filter((id) => id !== retiredRuleID) } : {}),
    };

    await sql`update records set decision = ${JSON.stringify(rewritten)}
      where sequence = ${row.sequence}`.execute(tx);
  }
}

async function rewriteSnapshotForms(tx: Transaction<unknown>): Promise<void> {
  const rows = await readQueryRows(
    sql`select snapshot_hash, form from definition_snapshots
      where form like ${`%${retiredRuleID}%`}`,
    tx,
    z.object({ snapshot_hash: z.string(), form: z.string() }),
  );

  for (const row of rows) {
    const form = recordSchema.safeParse(JSON.parse(row.form));
    const policy = recordSchema.safeParse(form.data?.['policy']);
    const rules = z.array(recordSchema).safeParse(policy.data?.['rules']);

    if (!form.success || !policy.success || !rules.success) {
      continue;
    }

    const rewritten = {
      ...form.data,
      policy: {
        ...policy.data,
        rules: rules.data.filter((rule) => rule['id'] !== retiredRuleID),
      },
    };

    await sql`update definition_snapshots set form = ${JSON.stringify(rewritten)}
      where snapshot_hash = ${row.snapshot_hash}`.execute(tx);
  }
}
