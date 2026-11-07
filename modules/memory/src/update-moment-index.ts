import type { Log } from '@heynixie/log';
import { readMomentEntries } from './read-moment-entries';
import type { MomentIndexes } from './start-store-indexes';

// The index reads its changes from the moments projection, so a keep, an edit or a destroy reaches
// it whether a tool, the API or the store's start wrote the record.
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

    if (vectors.isReady()) {
      await vectors.waitForIdle();
    }
  });
}
