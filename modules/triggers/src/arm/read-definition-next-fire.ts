import { triggerSchema } from '@heynixie/contract';
import type { Kysely } from 'kysely';
import { pickNextFire } from '../time/pick-next-fire';
import type { ReadZone, TriggersTables } from '../types';
import { readSpentOneShots } from './read-spent-one-shots';

// The next slot of a definition in force as an ISO instant in UTC, also when the slot is already
// past, or null when no slot is left.
export async function readDefinitionNextFire(
  db: Kysely<unknown>,
  readZone: ReadZone,
  definitionID: string,
): Promise<string | null> {
  const row = await db
    .$extendTables<TriggersTables>()
    .selectFrom('trigger_definitions')
    .select(['definition_hash', 'trigger', 'after'])
    .where('definition_id', '=', definitionID)
    .executeTakeFirst();

  if (row === undefined || row.definition_hash === null) {
    return null;
  }

  const trigger = triggerSchema.parse(JSON.parse(row.trigger));

  const spent = await readSpentOneShots(db, [{ definitionID, trigger }]);

  if (spent.has(definitionID)) {
    return null;
  }

  const scheduleZone = 'at' in trigger ? 'owner' : trigger.schedule.zone;

  const zone = await readZone(scheduleZone);

  const fire = pickNextFire(definitionID, trigger, row.after, zone);

  return fire === null ? null : new Date(fire.scheduledFor).toISOString();
}
