import type { Transaction } from 'kysely';
import { match } from 'ts-pattern';
import { canMoveDefinitionsExport } from './can-move-definitions-export';
import type { DefinitionsExportMove, DefinitionsExportState, DefinitionsTables } from './types';

export async function writeRuleExportState(
  tx: Transaction<unknown>,
  move: DefinitionsExportMove,
): Promise<void> {
  const current = await readRuleExportState(tx, move.approvalID);

  if (current !== null && !canMoveDefinitionsExport(current, move.to)) {
    throw new Error(
      `the rule export ${move.approvalID} is ${current}, so it cannot become ${move.to}`,
    );
  }

  const tables = tx.$extendTables<DefinitionsTables>();

  const values = match(move)
    .with({ to: 'exporting' }, (exporting) => ({ attempt_started_at: exporting.at }))
    .with({ to: 'opened' }, (opened) => ({
      state: 'opened' as const,
      pull_request_number: opened.pullRequest.number,
      pull_request_url: opened.pullRequest.url,
      attempt_started_at: null,
    }))
    .with({ to: 'closed' }, (closed) => ({
      state: 'closed' as const,
      attempt_started_at: null,
      ...(closed.pullRequest === null
        ? {}
        : {
            pull_request_number: closed.pullRequest.number,
            pull_request_url: closed.pullRequest.url,
          }),
    }))
    .exhaustive();

  await tables
    .insertInto('rule_exports')
    .values({ export_id: move.approvalID, ...values, updated_at: move.at })
    .onConflict((conflict) =>
      conflict.column('export_id').doUpdateSet({ ...values, updated_at: move.at }),
    )
    .execute();
}

async function readRuleExportState(
  tx: Transaction<unknown>,
  exportID: string,
): Promise<DefinitionsExportState | null> {
  const row = await tx
    .$extendTables<DefinitionsTables>()
    .selectFrom('rule_exports')
    .select(['state', 'attempt_started_at'])
    .where('export_id', '=', exportID)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  return row.attempt_started_at === null ? row.state : 'exporting';
}
