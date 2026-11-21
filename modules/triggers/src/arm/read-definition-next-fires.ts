import { triggerSchema } from '@heynixie/contract';
import type { Kysely } from 'kysely';
import { collectNextFires } from '../time/collect-next-fires';
import type { ReadZone, TriggersTables } from '../types';
import { readSpentOneShots } from './read-spent-one-shots';

export interface DefinitionNextFire {
  // the slot of the schedule, epoch milliseconds
  readonly slotMs: number;

  // when it fires: the end of its hold when a snooze holds it, else the slot
  readonly atMs: number;
}

export interface DefinitionNextFires {
  // the IANA zone the schedule reads in
  readonly zone: string;
  readonly fires: readonly DefinitionNextFire[];
}

// The next `count` fires of a definition in force after its watermark, also those already past, and
// none when no slot is left. A snooze moves the first fire to the end of its hold.
export async function readDefinitionNextFires(
  db: Kysely<unknown>,
  readZone: ReadZone,
  definitionID: string,
  count: number,
): Promise<DefinitionNextFires | null> {
  const row = await db
    .$extendTables<TriggersTables>()
    .selectFrom('trigger_definitions')
    .select(['definition_hash', 'trigger', 'after', 'hold_slot', 'hold_until'])
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

  const zoneName = 'at' in trigger ? 'owner' : trigger.schedule.zone;

  const zone = await readZone(zoneName);

  const fires = collectNextFires(definitionID, trigger, { afterMs: row.after, zone, count }).map(
    (fire) => ({
      slotMs: fire.scheduledFor,
      atMs:
        fire.scheduledFor === row.hold_slot && row.hold_until !== null
          ? row.hold_until
          : fire.scheduledFor,
    }),
  );

  return { zone, fires };
}
