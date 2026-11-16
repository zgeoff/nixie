import type { Trigger } from '@heynixie/contract';
import { isTimeZone } from '@heynixie/contract';
import type { Log } from '@heynixie/log';
import { readMessageTimeZone } from './read-message-time-zone';

// The zone a fire's times show in: a schedule's own IANA zone, else the zone of the owner's newest
// message recorded before the fire, else the default. Reading before the fire keeps a rebuilt
// session's text equal to the first step's.
export async function readTriggerZone(
  log: Pick<Log, 'writer'>,
  trigger: Trigger | null,
  fireSequence: number,
  defaultZone: string,
): Promise<string> {
  if (trigger !== null && 'schedule' in trigger && trigger.schedule.zone !== 'owner') {
    return trigger.schedule.zone;
  }

  const ownerZone = await readMessageTimeZone(log, fireSequence);

  return ownerZone !== null && isTimeZone(ownerZone) ? ownerZone : defaultZone;
}
