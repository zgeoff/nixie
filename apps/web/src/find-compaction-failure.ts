import type { LiveRecord } from './use-live-records';

const sessionKinds: ReadonlySet<string> = new Set([
  'model.compaction_failed',
  'model.session_summarized',
  'model.session_opened',
  'model.session_invalidated',
]);

export function findCompactionFailure(records: readonly LiveRecord[]): number | null {
  const last = records.findLast((record) => sessionKinds.has(record.kind));

  return last?.compactionFailure?.failures ?? null;
}
