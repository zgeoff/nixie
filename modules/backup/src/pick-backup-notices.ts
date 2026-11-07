import type { BackupNoticeCause, BackupSetState } from './types';

export interface NoticeSet {
  readonly sequence: number;
  readonly state: BackupSetState;
  readonly staged_at: number;
}

export interface RaisedNotice {
  readonly sequence: number;
  readonly cause: BackupNoticeCause;
}

export function pickBackupNotices(
  sets: readonly NoticeSet[],
  raised: readonly RaisedNotice[],
  now: number,
  intervalMs: number,
): RaisedNotice[] {
  const lastPublished = sets.reduce(
    (newest, set) => (set.state === 'published' ? Math.max(newest, set.sequence) : newest),
    0,
  );

  return sets
    .filter((set) => set.sequence > lastPublished)
    .flatMap((set) => {
      const cause = pickNoticeCause(set, now, intervalMs);

      return cause === null ? [] : [{ sequence: set.sequence, cause }];
    })
    .filter(
      (notice) =>
        !raised.some(
          (earlier) => earlier.sequence === notice.sequence && earlier.cause === notice.cause,
        ),
    );
}

function pickNoticeCause(
  set: NoticeSet,
  now: number,
  intervalMs: number,
): BackupNoticeCause | null {
  if (set.state === 'failed') {
    return 'failed';
  }

  if (set.state === 'staged' && now - set.staged_at >= intervalMs) {
    return 'missing';
  }

  return null;
}
