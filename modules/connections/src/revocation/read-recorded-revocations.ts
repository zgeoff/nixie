import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { revocationRecordedCodec } from '../record/revocation-recorded-codec';

const pageSize = 500;

// The connections whose revocation has an outcome in the log.
export async function readRecordedRevocations(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): Promise<ReadonlySet<string>> {
  const recorded = new Set<string>();

  let afterSequence = 0;

  for (;;) {
    const page = await readRecords(log, {
      afterSequence,
      kinds: [revocationRecordedCodec.kind],
      limit: pageSize,
    });

    for (const entry of page) {
      recorded.add(revocationRecordedCodec.decode(entry.record.payload).connection);

      afterSequence = entry.record.sequence;
    }

    if (page.length < pageSize) {
      return recorded;
    }
  }
}
