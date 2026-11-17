import { triggerSchema } from '@heynixie/contract';
import type { ArmedDefinition } from '@heynixie/triggers';
import { buildReminderTriggerID } from '@heynixie/triggers';
import type { Transaction } from 'kysely';
import type { RemindersTables } from '../types';

// The triggers of the active reminders, which the seed hands the arming hook beside the definitions
// in force, because the hook withdraws every trigger it is not handed.
export async function readArmedReminders(
  tx: Transaction<unknown>,
): Promise<readonly ArmedDefinition[]> {
  const rows = await tx
    .$extendTables<RemindersTables>()
    .selectFrom('reminders')
    .select(['reminder_id', 'reminder_hash', 'trigger'])
    .where('state', '=', 'active')
    .orderBy('set_sequence')
    .execute();

  return rows.map((row) => ({
    definitionID: buildReminderTriggerID(row.reminder_id),
    definitionHash: row.reminder_hash,
    source: 'schedule' as const,
    target: 'conversation' as const,
    trigger: triggerSchema.parse(JSON.parse(row.trigger)),
  }));
}
