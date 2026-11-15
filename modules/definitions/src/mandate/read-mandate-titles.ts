import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import { mandateEndedCodec } from './mandate-ended-codec';
import { mandateProposedCodec } from './mandate-proposed-codec';

const titleSchema = z.object({ title: z.string() });
const recordLimit = 500;

// The title of each mandate that a recent proposal names. A title a record forget removed reads as
// null.
export async function readMandateTitles(
  log: Log,
  mandateIDs: readonly string[],
): Promise<ReadonlyMap<string, string | null>> {
  const titles = new Map<string, string | null>();

  if (mandateIDs.length === 0) {
    return titles;
  }

  const records = await readRecords(log, {
    afterSequence: 0,
    kinds: [mandateProposedCodec.kind],
    order: 'newest',
    limit: recordLimit,
  });

  for (const entry of records) {
    const proposed = mandateProposedCodec.decode(entry.record.payload);

    if (mandateIDs.includes(proposed.mandateID)) {
      const erasable = entry.record.erasable;

      const title =
        erasable.status === 'readable' ? titleSchema.parse(erasable.fields).title : null;

      titles.set(proposed.mandateID, title);
    }
  }

  return titles;
}

// How the latest end of a mandate came about, or null when it never ended.
export async function readMandateEndReason(
  log: Log,
  mandateID: string,
): Promise<'ended' | 'expired' | null> {
  const records = await readRecords(log, {
    afterSequence: 0,
    kinds: [mandateEndedCodec.kind],
    order: 'newest',
    limit: recordLimit,
  });

  for (const entry of records) {
    const ended = mandateEndedCodec.decode(entry.record.payload);

    if (ended.mandateID === mandateID) {
      return ended.reason;
    }
  }

  return null;
}
