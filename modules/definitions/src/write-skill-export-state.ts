import type { Transaction } from 'kysely';
import { canMoveSkillExport } from './can-move-skill-export';
import type { DefinitionsTables, PullRequestRef } from './types';

// An opened export names its pull request and the base of the skill it was built for; a closed
// one keeps the pull request it closed.
export type SkillExportMove =
  | {
      readonly approvalID: string;
      readonly to: 'opened';
      readonly baseHash: string | null;
      readonly pullRequest: PullRequestRef;
      readonly at: number;
    }
  | { readonly approvalID: string; readonly to: 'closed'; readonly at: number };

// Writes the export state of a skill that nixie wrote inside the caller's write transaction, and
// refuses a move the transition table lacks. The first export of an approval opens its row.
export async function writeSkillExportState(
  tx: Transaction<unknown>,
  move: SkillExportMove,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const current = await tables
    .selectFrom('skill_exports')
    .select('state')
    .where('approval_id', '=', move.approvalID)
    .executeTakeFirst();

  if (current !== undefined && !canMoveSkillExport(current.state, move.to)) {
    throw new Error(
      `the export of approval ${move.approvalID} is ${current.state}, so it cannot become ${move.to}`,
    );
  }

  if (move.to === 'closed') {
    await tables
      .updateTable('skill_exports')
      .set({ state: 'closed', updated_at: move.at })
      .where('approval_id', '=', move.approvalID)
      .execute();

    return;
  }

  const values = {
    state: 'opened' as const,
    base_hash: move.baseHash,
    pull_request_number: move.pullRequest.number,
    pull_request_url: move.pullRequest.url,
    updated_at: move.at,
  };

  await tables
    .insertInto('skill_exports')
    .values({ approval_id: move.approvalID, ...values })
    .onConflict((conflict) => conflict.column('approval_id').doUpdateSet(values))
    .execute();
}
