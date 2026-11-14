import type { Writer } from '@heynixie/log';
import type { ActionRow, ActionsTables } from '../types';

export function readTestAction(writer: Pick<Writer, 'db'>, actionID: string): Promise<ActionRow> {
  return writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .selectAll()
    .where('action_id', '=', actionID)
    .executeTakeFirstOrThrow();
}
