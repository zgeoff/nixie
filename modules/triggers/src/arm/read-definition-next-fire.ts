import type { Kysely } from 'kysely';
import type { ReadZone } from '../types';
import { readDefinitionNextFires } from './read-definition-next-fires';

// The next slot of a definition in force as an ISO instant in UTC, also when the slot is already
// past, or null when no slot is left. A snooze moves it to the end of its hold.
export async function readDefinitionNextFire(
  db: Kysely<unknown>,
  readZone: ReadZone,
  definitionID: string,
): Promise<string | null> {
  const next = await readDefinitionNextFires(db, readZone, definitionID, 1);

  const first = next?.fires[0];

  return first === undefined ? null : new Date(first.atMs).toISOString();
}
