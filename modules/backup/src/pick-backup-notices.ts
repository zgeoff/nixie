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

// A set that a newer set's publish covers raises nothing, so the first pass of a release that adds
// notices stays quiet about failures the backups have since recovered from.
export function pickBackupNotices(
  sets: readonly NoticeSet[],
  raised: readonly RaisedNotice[],
  now: number,
  intervalMs: number,
): RaisedNotice[] {
  const lastPublished = Math.max(
    0,
    ...sets.filter((set) => set.state === 'published').map((set) => set.sequence),
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
