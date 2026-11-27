import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { formatPlaceKey } from '../place/format-place-key';
import { readPlaces } from '../place/read-places';
import type { PolicyTables } from '../policy/policy-tables';
import type { KnownContact } from '../types';

export interface KnownContactEntry extends KnownContact {
  readonly markedAt: number;
}

export async function readKnownContactIDs(db: Kysely<unknown>): Promise<readonly string[]> {
  const rows = await db
    .$extendTables<PolicyTables>()
    .selectFrom('known_contacts')
    .select('contact_id')
    .where('unmarked_sequence', 'is', null)
    .orderBy('contact_id')
    .execute();

  return rows.map((row) => row.contact_id);
}

// Every entry of the directory at known, whether a contact marked it or the places did, with its
// key in the canonical form. An entry whose erasable record a forget removed covers nothing and is
// not listed.
export async function readKnownContacts(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): Promise<readonly KnownContactEntry[]> {
  const places = await readPlaces(log);

  const known = places.filter((place) => place.trust === 'known');

  if (known.length === 0) {
    return [];
  }

  const entries = await readRecords(log, {
    afterSequence: 0,
    sequences: known.map((place) => place.addedSequence),
    limit: known.length,
  });

  const recordedAt = new Map(
    entries.map((entry) => [entry.record.sequence, entry.record.recordedAt.getTime()]),
  );

  return known.map((place) => ({
    contactID: place.placeID,
    name: place.name,
    destination: formatPlaceKey(place.key),
    markedAt: recordedAt.get(place.addedSequence) ?? 0,
  }));
}
