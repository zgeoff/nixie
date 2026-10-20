import type { Transaction } from 'kysely';
import { match } from 'ts-pattern';
import { canMoveSkillExport } from './can-move-skill-export';
import type { DefinitionsTables, PullRequestRef } from './types';

// An export in flight names the base it builds on, an opened one its pull request too, and a closed
// one keeps the pull request it closed.
export type SkillExportMove =
  | {
      readonly approvalID: string;
      readonly to: 'exporting';
      readonly baseHash: string | null;
      readonly at: number;
    }
  | {
      readonly approvalID: string;
      readonly to: 'opened';
      readonly baseHash: string | null;
      readonly pullRequest: PullRequestRef;
      readonly at: number;
    }
  | { readonly approvalID: string; readonly to: 'closed'; readonly at: number };

// Writes the export state of a skill that nixie wrote inside the caller's write transaction, and
// refuses a move the transition table lacks. The first export of an approval writes its row before
// it writes to your definitions repo.
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

  await match(move)
    .with({ to: 'exporting' }, (exporting) => writeExporting(tx, exporting))
    .with({ to: 'opened' }, (opened) => writeOpened(tx, opened))
    .with({ to: 'closed' }, (closed) => writeClosed(tx, closed))
    .exhaustive();
}

// an export again on a new base keeps the pull request it will update
async function writeExporting(
  tx: Transaction<unknown>,
  move: Extract<SkillExportMove, { to: 'exporting' }>,
): Promise<void> {
  const values = { state: 'exporting' as const, base_hash: move.baseHash, updated_at: move.at };

  await tx
    .$extendTables<DefinitionsTables>()
    .insertInto('skill_exports')
    .values({
      approval_id: move.approvalID,
      ...values,
      pull_request_number: null,
      pull_request_url: null,
    })
    .onConflict((conflict) => conflict.column('approval_id').doUpdateSet(values))
    .execute();
}

async function writeOpened(
  tx: Transaction<unknown>,
  move: Extract<SkillExportMove, { to: 'opened' }>,
): Promise<void> {
  const values = {
    state: 'opened' as const,
    base_hash: move.baseHash,
    pull_request_number: move.pullRequest.number,
    pull_request_url: move.pullRequest.url,
    updated_at: move.at,
  };

  await tx
    .$extendTables<DefinitionsTables>()
    .insertInto('skill_exports')
    .values({ approval_id: move.approvalID, ...values })
    .onConflict((conflict) => conflict.column('approval_id').doUpdateSet(values))
    .execute();
}

async function writeClosed(
  tx: Transaction<unknown>,
  move: Extract<SkillExportMove, { to: 'closed' }>,
): Promise<void> {
  await tx
    .$extendTables<DefinitionsTables>()
    .updateTable('skill_exports')
    .set({ state: 'closed', updated_at: move.at })
    .where('approval_id', '=', move.approvalID)
    .execute();
}
