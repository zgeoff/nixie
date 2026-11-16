import { readMessageTimeZone } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import type { ReadZone } from '@heynixie/triggers';

// Resolves 'owner' to the zone of the newest owner message, or to the configured default when the
// owner has sent none, and returns any other zone as it is. The database handle is the one that
// the caller reads with, so a read inside a transaction sees that transaction.
export function makeReadZone(
  writer: Log['writer'],
  db: Log['writer']['db'],
  defaultZone: string,
): ReadZone {
  return async (zone) => {
    if (zone !== 'owner') {
      return zone;
    }

    const messageZone = await readMessageTimeZone({ writer: { ...writer, db } });

    return messageZone ?? defaultZone;
  };
}
