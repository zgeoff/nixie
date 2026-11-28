import type { AttentionStatus } from './types';

// A connection as the watch sees it.
export interface WatchedConnection {
  readonly connection: string;
  readonly status: AttentionStatus | null;
  readonly sinceMs: number;

  // where the grant ends, for a grant of limited time
  readonly endsAtMs: number | null;

  // whether the credential store wrote the status, so a record of its change exists already
  readonly isStored: boolean;
}

interface ReachedKey {
  readonly connection: string;
  readonly status: 'expiring' | 'needs_consent';
  readonly endsAtMs: number;
}

interface LastedKey {
  readonly connection: string;
  readonly sinceMs: number;
}

export type DueStatusRecord =
  | { readonly kind: 'reached'; readonly key: ReachedKey }
  | { readonly kind: 'lasted'; readonly key: LastedKey };

interface Written {
  readonly reached: readonly ReachedKey[];
  readonly lasted: readonly LastedKey[];
}

interface DueOptions {
  readonly nowMs: number;
  readonly noticeMs: number;
}

// The records that the clock owes the log: each time the clock alone took a connection into
// `expiring` or `needs_consent`, and each break that passed `noticeMs`, once per break.
export function collectDueStatusRecords(
  connections: readonly WatchedConnection[],
  written: Written,
  options: DueOptions,
): DueStatusRecord[] {
  return connections.flatMap((watched): DueStatusRecord[] => {
    const due: DueStatusRecord[] = [];

    const reached =
      (watched.status === 'expiring' || watched.status === 'needs_consent') &&
      !watched.isStored &&
      watched.endsAtMs !== null
        ? { connection: watched.connection, status: watched.status, endsAtMs: watched.endsAtMs }
        : null;

    if (reached !== null && !written.reached.some((key) => isSameReached(key, reached))) {
      due.push({ kind: 'reached', key: reached });
    }

    const isBreak = watched.status === 'needs_consent' || watched.status === 'failing';
    const lasted = { connection: watched.connection, sinceMs: watched.sinceMs };

    if (
      isBreak &&
      options.nowMs - watched.sinceMs >= options.noticeMs &&
      !written.lasted.some((key) => isSameLasted(key, lasted))
    ) {
      due.push({ kind: 'lasted', key: lasted });
    }

    return due;
  });
}

function isSameReached(left: ReachedKey, right: ReachedKey): boolean {
  return (
    left.connection === right.connection &&
    left.status === right.status &&
    left.endsAtMs === right.endsAtMs
  );
}

function isSameLasted(left: LastedKey, right: LastedKey): boolean {
  return left.connection === right.connection && left.sinceMs === right.sinceMs;
}
