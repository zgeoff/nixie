import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { mandateProposedCodec } from './mandate-proposed-codec';

const recordLimit = 500;

// Who wrote each mandate that a recent proposal names: 'you' for a mandate you proposed and
// 'nixie' for one nixie proposed. A mandate that no recent proposal names is missing, and reads as
// yours, because the label only says whose note it is.
export async function readMandateAuthors(log: Log): Promise<ReadonlyMap<string, 'you' | 'nixie'>> {
  const authors = new Map<string, 'you' | 'nixie'>();

  const records = await readRecords(log, {
    afterSequence: 0,
    kinds: [mandateProposedCodec.kind],
    order: 'newest',
    limit: recordLimit,
  });

  for (const entry of records) {
    const proposed = mandateProposedCodec.decode(entry.record.payload);
    const author = proposed.proposedBy === 'nixie' ? 'nixie' : 'you';

    // a mandate has one proposal, so the order of the records changes nothing
    authors.set(proposed.mandateID, author);
  }

  return authors;
}
