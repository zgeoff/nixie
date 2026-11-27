import { readSnapshotPolicy } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import type { PolicyPlace } from '@heynixie/policy';
import { readPlaces } from '@heynixie/policy';

// The places of the directory that a definitions snapshot holds, each at the level and with the
// name the snapshot gives it. A call decides under its snapshot, so a place you blocked, renamed or
// removed since changes nothing for it.
export async function readSnapshotPlaces(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  snapshotHash: string,
): Promise<readonly PolicyPlace[]> {
  const read = await readSnapshotPolicy(log.writer.db, snapshotHash);

  const stored = await readPlaces(log, {
    placeIDs: read.places.map((place) => place.placeID),
    nameSequences: new Map(read.places.map((place) => [place.placeID, place.nameSequence ?? null])),
  });

  const levels = new Map(read.places.map((place) => [place.placeID, place.trust]));

  return stored.map((place) => ({
    placeID: place.placeID,
    shortID: place.shortID,
    key: place.key,
    trust: levels.get(place.placeID) ?? place.trust,
    name: place.name,
  }));
}
