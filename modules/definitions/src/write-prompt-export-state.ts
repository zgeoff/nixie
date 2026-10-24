import type { Transaction } from 'kysely';
import { match } from 'ts-pattern';
import { canMoveDefinitionsExport } from './can-move-definitions-export';
import type { DefinitionsExportMove, DefinitionsExportState, DefinitionsTables } from './types';

export async function writePromptExportState(
  tx: Transaction<unknown>,
  move: DefinitionsExportMove,
): Promise<void> {
  const current = await readPromptExportState(tx, move.approvalID);

  if (current !== null && !canMoveDefinitionsExport(current, move.to)) {
    throw new Error(
      `the export of prompt approval ${move.approvalID} is ${current}, so it cannot become ${move.to}`,
    );
  }

  await match(move)
    .with({ to: 'exporting' }, (exporting) => writeExporting(tx, exporting))
    .with({ to: 'opened' }, (opened) => writeOpened(tx, opened))
    .with({ to: 'closed' }, (closed) => writeClosed(tx, closed))
    .exhaustive();
}

async function readPromptExportState(
  tx: Transaction<unknown>,
  approvalID: string,
): Promise<DefinitionsExportState | null> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const attempt = await tables
    .selectFrom('prompt_export_attempts')
    .select('approval_id')
    .where('approval_id', '=', approvalID)
    .executeTakeFirst();

  if (attempt !== undefined) {
    return 'exporting';
  }

  const row = await tables
    .selectFrom('prompt_exports')
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
    .insertInto('prompt_export_attempts')
    .values({ approval_id: move.approvalID, started_at: move.at })
    .onConflict((conflict) => conflict.column('approval_id').doUpdateSet({ started_at: move.at }))
    .execute();
}

async function writeOpened(
  tx: Transaction<unknown>,
  move: Extract<DefinitionsExportMove, { to: 'opened' }>,
): Promise<void> {
  const values = {
    state: 'opened' as const,
    pull_request_number: move.pullRequest.number,
    pull_request_url: move.pullRequest.url,
    updated_at: move.at,
  };

  await tx
    .$extendTables<DefinitionsTables>()
    .insertInto('prompt_exports')
    .values({ approval_id: move.approvalID, ...values })
    .onConflict((conflict) => conflict.column('approval_id').doUpdateSet(values))
    .execute();

  await removeAttempt(tx, move.approvalID);
}

async function removeAttempt(tx: Transaction<unknown>, approvalID: string): Promise<void> {
  await tx
    .$extendTables<DefinitionsTables>()
    .deleteFrom('prompt_export_attempts')
    .where('approval_id', '=', approvalID)
    .execute();
}

async function writeClosed(
  tx: Transaction<unknown>,
  move: Extract<DefinitionsExportMove, { to: 'closed' }>,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  const updated = await tables
    .updateTable('prompt_exports')
    .set({ state: 'closed', updated_at: move.at })
    .where('approval_id', '=', move.approvalID)
    .executeTakeFirst();

  if (updated.numUpdatedRows === 0n && move.pullRequest !== null) {
    await tables
      .insertInto('prompt_exports')
      .values({
        approval_id: move.approvalID,
        state: 'closed',
        pull_request_number: move.pullRequest.number,
        pull_request_url: move.pullRequest.url,
        updated_at: move.at,
      })
      .execute();
  }

  await removeAttempt(tx, move.approvalID);
}
