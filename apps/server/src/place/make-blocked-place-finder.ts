import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { PolicyPlace } from '@heynixie/policy';
import { findPlace, parsePlace } from '@heynixie/policy';
import invariant from 'tiny-invariant';
import { readSnapshotPlaces } from '../utils/read-snapshot-places';

// Finds the short ID of the place that the call's snapshot blocks and that covers a URL's host, for
// a fetch no decision point sees, such as a redirect hop. It reads the snapshot once per call.
export function makeBlockedPlaceFinder(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): (callSequence: number) => (url: string) => Promise<string | null> {
  return (callSequence) => {
    let held: Promise<readonly PolicyPlace[]> | null = null;

    return async (url) => {
      const parsed = URL.parse(url);

      if (parsed === null) {
        return null;
      }

      held ??= readCallPlaces(log, callSequence);

      const host = parsed.hostname;

      const callPlaces = await held;

      const found = findPlace(callPlaces, { parsed: parsePlace(host), raw: host });

      return found?.trust === 'blocked' ? found.shortID : null;
    };
  };
}

async function readCallPlaces(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  callSequence: number,
): Promise<readonly PolicyPlace[]> {
  const [entry] = await readRecords(log, { afterSequence: callSequence - 1, limit: 1 });

  invariant(entry?.record.sequence === callSequence, 'the call has its record before it runs');

  return readSnapshotPlaces(log, entry.record.definitions.snapshotHash);
}
