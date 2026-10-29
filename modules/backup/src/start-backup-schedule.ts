import { subscribeToRecordCommits } from '@heynixie/log';
import { createActor, toPromise } from 'xstate';
import { backupScheduleMachine } from './backup-schedule-machine';
import { removeAbandonedSets } from './remove-abandoned-sets';
import type { BackupPass } from './run-backup-pass';
import { runBackupPass } from './run-backup-pass';
import type { BackupContext } from './types';

export interface BackupScheduleOptions {
  readonly context: BackupContext;
  readonly intervalMs: number;
  readonly onAbandoned: (sequences: readonly number[]) => void;
  readonly onPass: (pass: BackupPass) => void;
  readonly onError: (error: unknown) => void;
}

export interface BackupSchedule {
  readonly stop: () => Promise<void>;
}

// A minute bounds how long a receipt waits to be recorded, and how long a forget waits for its set
// when no record commit wakes the schedule first.
const pollMs = 60_000;

export function startBackupSchedule(options: BackupScheduleOptions): BackupSchedule {
  const schedule = createActor(backupScheduleMachine, {
    input: {
      start: async () => {
        const abandoned = await removeAbandonedSets(options.context);

        if (abandoned.sequences.length > 0) {
          options.onAbandoned(abandoned.sequences);
        }
      },
      pass: () => runBackupPass(options.context, options.intervalMs),
      clock: options.context.writer.clock,
      pollMs,
      onPass: options.onPass,
      onError: options.onError,
    },
  });

  schedule.start();

  const unsubscribe = subscribeToRecordCommits(options.context.writer, () => {
    schedule.send({ type: 'wake' });
  });

  return {
    stop: async () => {
      unsubscribe();

      if (schedule.getSnapshot().status === 'active') {
        schedule.send({ type: 'stop' });
      }

      await toPromise(schedule);
    },
  };
}
