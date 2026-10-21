import type { Transaction } from 'kysely';
import { match } from 'ts-pattern';
import { canMoveSkillExport } from './can-move-skill-export';
import type { DefinitionsTables, PullRequestRef, SkillExportState } from './types';

// An opened export names its pull request and base. A closed one keeps the pull request it closed,
// and an export that closes before it recorded its pull request names the one it found, if any.
export type SkillExportMove =
  | { readonly approvalID: string; readonly to: 'exporting'; readonly at: number }
  | {
      readonly approvalID: string;
      readonly to: 'opened';
      readonly baseHash: string | null;
      readonly pullRequest: PullRequestRef;
      readonly at: number;
    }
  | {
      readonly approvalID: string;
      readonly to: 'closed';
      readonly pullRequest: PullRequestRef | null;
      readonly at: number;
    };

// Writes the export state of a skill that nixie wrote inside the caller's write transaction, and
// refuses a move the transition table lacks. An export in flight is a mark beside the export's row,
// so a run that stops between the write to your definitions repo and its record leaves the mark.
export async function writeSkillExportState(
  tx: Transaction<unknown>,
  move: SkillExportMove,
): Promise<void> {
  const current = await readSkillExportState(tx, move.approvalID);

  if (current !== null && !canMoveSkillExport(current, move.to)) {
    throw new Error(
      `the export of approval ${move.approvalID} is ${current}, so it cannot become ${move.to}`,
    );
  }

  await match(move)
    .with({ to: 'exporting' }, (exporting) => writeExporting(tx, exporting))
    .with({ to: 'opened' }, (opened) => writeOpened(tx, opened))
    .with({ to: 'closed' }, (closed) => writeClosed(tx, closed))
    .exhaustive();
}

// an export in flight, whatever its row holds, or the row's state, or null with neither
async function readSkillExportState(
  tx: Transaction<unknown>,
  approvalID: string,
): Promise<SkillExportState | null> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const attempt = await tables
    .selectFrom('skill_export_attempts')
    .select('approval_id')
    .where('approval_id', '=', approvalID)
    .executeTakeFirst();

  if (attempt !== undefined) {
    return 'exporting';
  }

  const row = await tables
    .selectFrom('skill_exports')
    .select('state')
    .where('approval_id', '=', approvalID)
    .executeTakeFirst();

  return row?.state ?? null;
}

async function writeExporting(
  tx: Transaction<unknown>,
  move: Extract<SkillExportMove, { to: 'exporting' }>,
): Promise<void> {
  await tx
    .$extendTables<DefinitionsTables>()
    .insertInto('skill_export_attempts')
    .values({ approval_id: move.approvalID, started_at: move.at })
    .onConflict((conflict) => conflict.column('approval_id').doUpdateSet({ started_at: move.at }))
    .execute();
}

async function writeOpened(
  tx: Transaction<unknown>,
  move: Extract<SkillExportMove, { to: 'opened' }>,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

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

  await removeAttempt(tx, move.approvalID);
}

async function removeAttempt(tx: Transaction<unknown>, approvalID: string): Promise<void> {
  await tx
    .$extendTables<DefinitionsTables>()
    .deleteFrom('skill_export_attempts')
    .where('approval_id', '=', approvalID)
    .execute();
}

// an export that closes before it recorded a pull request keeps a row only for one it found
async function writeClosed(
  tx: Transaction<unknown>,
  move: Extract<SkillExportMove, { to: 'closed' }>,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const updated = await tables
    .updateTable('skill_exports')
    .set({ state: 'closed', updated_at: move.at })
    .where('approval_id', '=', move.approvalID)
    .executeTakeFirst();

  if (updated.numUpdatedRows === 0n && move.pullRequest !== null) {
    await tables
      .insertInto('skill_exports')
      .values({
        approval_id: move.approvalID,
        state: 'closed',
        base_hash: null,
        pull_request_number: move.pullRequest.number,
        pull_request_url: move.pullRequest.url,
        updated_at: move.at,
      })
      .execute();
  }

  await removeAttempt(tx, move.approvalID);
}
