import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

const answerKinds = [
  'policy.action_answered',
  'memory.approval_recorded',
  'memory.proposal_rejected',
  'skills.write_approved',
  'skills.write_rejected',
  'rules.change_approved',
  'rules.change_rejected',
];

const answerSchema = z.object({
  proposal_id: z.string(),
  identity_id: z.string(),
});

// The column holds the identity whose answer closed the row. The backfill reads it from the
// closing records, as the proposals projection folds it from each new one.
export const proposalAnsweredByMigration: Migration = {
  name: 'record who answered each proposal',
  up: async (tx) => {
    const columns = await readQueryRows(
      sql`select name from pragma_table_info('proposals') where name = 'answered_by'`,
      tx,
      z.object({ name: z.string() }),
    );

    if (columns.length === 0) {
      await sql`alter table proposals add column answered_by text`.execute(tx);
    }

    const answers = await readQueryRows(
      sql`select json_extract(payload, '$.proposalID') as proposal_id,
          json_extract(payload, '$.identityID') as identity_id
        from records
        where kind in (${sql.join(answerKinds)})
          and json_extract(payload, '$.identityID') is not null
        order by sequence`,
      tx,
      answerSchema,
    );

    for (const answer of answers) {
      await sql`update proposals set answered_by = ${answer.identity_id}
        where proposal_id = ${answer.proposal_id}
          and answered_by is null and state in ('approved', 'declined')`.execute(tx);
    }
  },
};
