import type { Log } from '@heynixie/log';
import { findRecordKeys } from '@heynixie/log';

const chunkSize = 500;

// Finds which of the key IDs the key store still holds. It looks them up a chunk at a time to stay
// inside the statement's parameter limit, because a start sweep passes a whole history of IDs.
export async function findHeldRecordKeys(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  keyIDs: readonly string[],
): Promise<readonly string[]> {
  const chunks = Array.from({ length: Math.ceil(keyIDs.length / chunkSize) }, (_, index) =>
    keyIDs.slice(index * chunkSize, (index + 1) * chunkSize),
  );

  const found = await Promise.all(chunks.map((chunk) => findRecordKeys(log, chunk)));

  return found.flatMap((keys) => keys.keys().toArray());
}
