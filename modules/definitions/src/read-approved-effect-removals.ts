import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { readRuleProposals } from './read-rule-proposals';

// `tool:effect` for each effect removal that a proposal named and you approved after the seed in
// force was written. A seed that follows an approval has applied it, so a later removal of the same
// effect, after the effect came back, is held for a new approval.
export async function readApprovedEffectRemovals(
  db: Kysely<unknown>,
  afterSequence: number | null,
): Promise<ReadonlySet<string>> {
  if (afterSequence === null) {
    return new Set();
  }

  const approvals = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(sql`json_extract(payload, '$.proposalID')`.as('proposal_id'))
    .where('kind', '=', 'rules.change_approved')
    .where('sequence', '>', afterSequence)
    .execute();

  const approved = new Set(approvals.map((row) => row.proposal_id));

  const proposals = await readRuleProposals(db);

  return new Set(
    proposals
      .filter((entry) => approved.has(entry.proposal.proposalID))
      .flatMap((entry) =>
        entry.proposal.effectChanges.flatMap((change) =>
          change.remove.map((effect) => `${change.tool}:${effect}`),
        ),
      ),
  );
}
