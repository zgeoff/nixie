import type { Transaction } from 'kysely';
import { match } from 'ts-pattern';
import { canMoveSkillExport } from './can-move-skill-export';
import type { DefinitionsExportMove, DefinitionsTables, SkillExportState } from './types';

export async function writeSkillExportState(
  tx: Transaction<unknown>,
  move: DefinitionsExportMove,
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
  move: Extract<DefinitionsExportMove, { to: 'exporting' }>,
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
  move: Extract<DefinitionsExportMove, { to: 'opened' }>,
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

async function writeClosed(
  tx: Transaction<unknown>,
  move: Extract<DefinitionsExportMove, { to: 'closed' }>,
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
