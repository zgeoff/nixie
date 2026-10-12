import type { WriteCaller } from './gate-types';

// The group a gated write belongs to: the group the proposal cap counts in, and the notice its
// entry joins.
export interface WriteGroup {
  readonly capGroup: string;
  readonly noticeKey: string;
}

// A writer batch groups by its batch. A conversation turn begins at your newest message in the
// thread, so its writes group by that message's record. A task run, or a thread with no message
// of yours, groups by the run.
export function buildWriteGroup(caller: WriteCaller, newestMessage: number | null): WriteGroup {
  if (caller.batchID !== undefined) {
    const key = `batch/${caller.batchID}`;

    return { capGroup: key, noticeKey: key };
  }
  if (caller.origin === 'conversation' && newestMessage !== null) {
    const key = `turn/${caller.thread}/${String(newestMessage)}`;

    return { capGroup: key, noticeKey: key };
  }
  const key = `run/${caller.runID}`;

  return { capGroup: key, noticeKey: key };
}
