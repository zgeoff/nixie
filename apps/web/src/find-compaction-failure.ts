import type { LiveRecord } from './use-live-records';

// Finds the conversation's compaction failing: the newest record that closed or opened its session
// is a failed compaction. A summary, a forget's invalidation or a session that opened since ends
// the failure.
export function findCompactionFailure(records: readonly LiveRecord[]): number | null {
  const last = records.findLast((record) => sessionKinds.has(record.kind));

  return last?.compactionFailure?.failures ?? null;
}

const sessionKinds: ReadonlySet<string> = new Set([
  'model.compaction_failed',
  'model.session_summarized',
  'model.session_opened',
  'model.session_invalidated',
]);
