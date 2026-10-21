import type { WriteCaller } from './gate-types';

export interface WriteGroup {
  readonly capGroup: string;
  readonly noticeKey: string;
}

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
