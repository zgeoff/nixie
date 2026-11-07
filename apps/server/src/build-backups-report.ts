import type { BackupHealth } from '@heynixie/backup';
import type { PartReport } from '@heynixie/ops';
import { match } from 'ts-pattern';

export type BackupWatch =
  | { readonly state: 'not_started' }
  | { readonly state: 'off' }
  | {
      readonly state: 'on';
      readonly intervalMs: number;
      readonly startedAt: number;
      readonly health: BackupHealth | null;
    };

// A deployment with no published set yet counts from the schedule's start, so a new deployment is
// ready while its first set ships.
export function buildBackupsReport(watch: BackupWatch, now: number): PartReport {
  return match(watch)
    .returnType<PartReport>()
    .with({ state: 'not_started' }, () => ({
      isReady: false,
      reason: 'the backup schedule has not started',
    }))
    .with({ state: 'off' }, () => ({ isReady: true, reason: null }))
    .with({ state: 'on' }, (on) => {
      const lastUploadAt = on.health?.lastUploadAt ?? null;
      const newestSetAt = on.health?.newestSetAt ?? null;
      const limitMs = 2 * on.intervalMs;
      const isReady = now - (lastUploadAt ?? on.startedAt) < limitMs;

      return {
        isReady,
        reason: isReady
          ? null
          : `no backup set has published in the last ${formatMinutes(limitMs)}`,
        details: {
          newest_set_age_seconds:
            newestSetAt === null ? null : Math.floor((now - newestSetAt) / 1000),
          last_upload_at: lastUploadAt === null ? null : new Date(lastUploadAt).toISOString(),
        },
      };
    })
    .exhaustive();
}

function formatMinutes(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000);

  return minutes === 1 ? '1 minute' : `${String(minutes)} minutes`;
}
