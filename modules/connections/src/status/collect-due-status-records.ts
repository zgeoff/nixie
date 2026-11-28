import type { StatusStep } from './collect-status-events';
import { pickBreakStartMs } from './pick-break-start-ms';
import type { AttentionStatus } from './types';

// A connection as the watch sees it.
export interface WatchedConnection {
  readonly connection: string;
  readonly status: AttentionStatus | null;
  readonly sinceMs: number;

  // where the grant ends, for a grant of limited time
  readonly endsAtMs: number | null;

  // whether the credential store wrote the status the clock reads, so a record of its change exists
  // already
  readonly isStored: boolean;
}

export type DueStatusRecord =
  | {
      readonly kind: 'reached';
      readonly key: {
        readonly connection: string;
        readonly status: 'expiring' | 'needs_consent';
        readonly endsAtMs: number;
      };
    }
  | {
      readonly kind: 'lasted';
      readonly key: { readonly connection: string; readonly sinceMs: number };
    };

interface DueOptions {
  readonly nowMs: number;
  readonly noticeMs: number;
}

// The records that the clock owes the log: each time the clock alone took a connection into
// `expiring` or `needs_consent`, and each break that passed `noticeMs`, once per break. A break
// begins at its earliest failing or consent step after the last return to `active`.
export function collectDueStatusRecords(
  connections: readonly WatchedConnection[],
  steps: readonly StatusStep[],
  options: DueOptions,
): DueStatusRecord[] {
  return connections.flatMap((watched): DueStatusRecord[] => {
    const own = steps.filter((step) => step.connection === watched.connection);
    const lastActive = own.findLastIndex((step) => step.step.kind === 'active');
    const current = own.slice(lastActive + 1);
    const due: DueStatusRecord[] = [];

    if (
      (watched.status === 'expiring' || watched.status === 'needs_consent') &&
      !watched.isStored &&
      watched.endsAtMs !== null &&
      !current.some((step) => step.step.kind === watched.status)
    ) {
      due.push({
        kind: 'reached',
        key: {
          connection: watched.connection,
          status: watched.status,
          endsAtMs: watched.endsAtMs,
        },
      });
    }

    const isBreak = watched.status === 'needs_consent' || watched.status === 'failing';
    const sinceMs = pickBreakStartMs(current) ?? watched.sinceMs;

    if (
      isBreak &&
      options.nowMs - sinceMs >= options.noticeMs &&
      !current.some((step) => step.step.kind === 'lasted')
    ) {
      due.push({ kind: 'lasted', key: { connection: watched.connection, sinceMs } });
    }

    return due;
  });
}
