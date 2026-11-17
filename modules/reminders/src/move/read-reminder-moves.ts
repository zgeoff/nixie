import { triggerSchema } from '@heynixie/contract';
import type { Trigger } from '@heynixie/contract';
import type { Transaction } from 'kysely';
import type { RemindersTables } from '../types';

export interface ReminderMove {
  readonly definitionID: string;
  readonly name: string;
  readonly note: string;
  readonly trigger: Trigger;

  // the runtime change that held the definition in force, or null when the repo did
  readonly changeID: string | null;
}

// The conversation-target definitions that the migration staged, which the next start turns into
// reminders.
export async function readReminderMoves(
  tx: Transaction<unknown>,
): Promise<readonly ReminderMove[]> {
  const rows = await tx
    .$extendTables<RemindersTables>()
    .selectFrom('reminder_moves')
    .selectAll()
    .orderBy('definition_id')
    .execute();

  return rows.map((row) => ({
    definitionID: row.definition_id,
    name: row.name,
    note: row.note,
    trigger: triggerSchema.parse(JSON.parse(row.trigger)),
    changeID: row.change_id,
  }));
}
