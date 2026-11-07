import type { Log } from '@heynixie/log';
import { readMomentEntries } from './read-moment-entries';
import type { MomentIndexes } from './start-store-indexes';

// The index catches up on the moments projection before each search, so a moment kept or edited on
// one turn matches by meaning on the next, whichever path wrote it.
export function updateMomentIndex(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  moments: MomentIndexes,
): Promise<void> {
  const vectors = moments.vectors;

  if (vectors === null) {
    return Promise.resolve();
  }

  return moments.lock(async () => {
    const read = await readMomentEntries(log, moments.cursor.through);

    for (const entry of read.entries) {
      vectors.update(entry);
    }

    for (const momentID of read.removedIDs) {
      vectors.remove(momentID);
    }

    moments.cursor.through = read.through;

    if (read.entries.length > 0 && vectors.isReady()) {
      await vectors.waitForIdle();
    }
  });
}
