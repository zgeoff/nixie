import type { Log } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';

const chunkSize = 500;

// Finds which of the key IDs the key store still holds. It looks them up one chunk after another to
// stay inside the statement's parameter limit, because a start sweep passes a whole history of IDs.
export function readHeldRecordKeys(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  keyIDs: readonly string[],
): Promise<readonly string[]> {
  const chunks = Array.from({ length: Math.ceil(keyIDs.length / chunkSize) }, (_, index) =>
    keyIDs.slice(index * chunkSize, (index + 1) * chunkSize),
  );

  return chunks.reduce<Promise<readonly string[]>>(async (held, chunk) => {
    const before = await held;
    const keys = await readRecordKeys(log, chunk);

    return [...before, ...keys.keys()];
  }, Promise.resolve([]));
}
