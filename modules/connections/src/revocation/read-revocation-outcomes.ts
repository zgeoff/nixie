import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { revocationRecordedCodec } from '../record/revocation-recorded-codec';

const pageSize = 500;

export type RecordedOutcome = 'confirmed' | 'refused' | 'unknown' | 'not_attempted';

// The outcome of each connection's one revocation, by connection ID.
export async function readRevocationOutcomes(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): Promise<ReadonlyMap<string, RecordedOutcome>> {
  const outcomes = new Map<string, RecordedOutcome>();

  let afterSequence = 0;

  for (;;) {
    const page = await readRecords(log, {
      afterSequence,
      kinds: [revocationRecordedCodec.kind],
      limit: pageSize,
    });

    for (const entry of page) {
      const recorded = revocationRecordedCodec.decode(entry.record.payload);

      outcomes.set(recorded.connection, recorded.outcome);

      afterSequence = entry.record.sequence;
    }

    if (page.length < pageSize) {
      return outcomes;
    }
  }
}
