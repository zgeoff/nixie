import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';

const retiredPromptIDs = ['writer', 'consolidator'];
const recordSchema = z.record(z.string(), z.unknown());

export async function removeRetiredPrompts(tx: Transaction<unknown>): Promise<void> {
  const ids = sql.join(retiredPromptIDs);
  const approvals = sql`(select approval_id from prompt_approvals where prompt_id in (${ids}))`;

  await sql`delete from prompt_export_attempts where approval_id in ${approvals}`.execute(tx);
  await sql`delete from prompt_exports where approval_id in ${approvals}`.execute(tx);

  await sql`delete from proposals where proposal_id in
    (select proposal_id from prompt_approvals where prompt_id in (${ids}))`.execute(tx);

  await sql`delete from prompt_approvals where prompt_id in (${ids})`.execute(tx);

  const rows = await readQueryRows(
    sql`select snapshot_hash, form from definition_snapshots
      where form like ${'%"writer"%'} or form like ${'%"consolidator"%'}`,
    tx,
    z.object({ snapshot_hash: z.string(), form: z.string() }),
  );

  for (const row of rows) {
    const form = recordSchema.safeParse(JSON.parse(row.form));
    const prompts = recordSchema.safeParse(form.data?.['prompts']);

    if (!form.success || !prompts.success) {
      continue;
    }

    await sql`update definition_snapshots
      set form = ${JSON.stringify({
        ...form.data,
        prompts: Object.fromEntries(
          Object.entries(prompts.data).filter(([promptID]) => !retiredPromptIDs.includes(promptID)),
        ),
      })}
      where snapshot_hash = ${row.snapshot_hash}`.execute(tx);
  }
}
