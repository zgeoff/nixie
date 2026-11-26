import type { RecordInput } from '@heynixie/log';
import { modelSessionSummarizedCodec } from '@heynixie/models';

// The dollars of the session summaries that a step's result writes. A compaction prices its own
// call and reports it to no budget, so a meter that prices calls adds them here.
export function collectCompactionDollars(records: readonly RecordInput[]): number {
  let dollars = 0;

  for (const record of records) {
    if (record.kind === modelSessionSummarizedCodec.kind) {
      const summarized = modelSessionSummarizedCodec.tryDecodePartial(record.payload ?? {});

      dollars += summarized?.dollars ?? 0;
    }
  }

  return dollars;
}
