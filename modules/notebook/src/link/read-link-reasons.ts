import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';

const chunkSize = 400;

// The reason each record holds, by sequence. A record that holds none, or whose key is gone, has no
// entry.
export async function readLinkReasons(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequences: readonly number[],
): Promise<ReadonlyMap<number, string>> {
  const reasons = new Map<number, string>();

  for (let start = 0; start < sequences.length; start += chunkSize) {
    const part = sequences.slice(start, start + chunkSize);

    const entries = await readRecords(log, {
      afterSequence: 0,
      sequences: part,
      limit: part.length,
    });

    for (const entry of entries) {
      const record = entry.record;

      const reason =
        record.erasable.status === 'readable' ? record.erasable.fields['reason'] : null;

      if (typeof reason === 'string') {
        reasons.set(record.sequence, reason);
      }
    }
  }

  return reasons;
}
