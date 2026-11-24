import type { JSONObject, Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';

export interface ScreenRecord {
  readonly payload: JSONObject;

  // the thread the record was written on, or null for a record on none
  readonly thread: string | null;

  // the erasable fields, or null once a forget removed them
  readonly fields: JSONObject | null;
}

// A device's show or idle scene, from the record its row points at. A record that a reset removed
// reads as null.
export async function readScreenRecord(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequence: number | null,
): Promise<ScreenRecord | null> {
  if (sequence === null) {
    return null;
  }

  const [found] = await readRecords(log, {
    afterSequence: sequence - 1,
    sequences: [sequence],
    limit: 1,
  });

  if (found === undefined) {
    return null;
  }

  const erasable = found.record.erasable;

  return {
    payload: found.record.payload,
    thread: found.record.thread,
    fields: erasable.status === 'readable' ? erasable.fields : null,
  };
}
