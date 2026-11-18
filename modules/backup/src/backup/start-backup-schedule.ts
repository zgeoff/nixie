import { subscribeToRecordCommits } from '@heynixie/log';
import { createActor, toPromise } from 'xstate';
import type { BackupContext } from '../types';
import { BackupPassError } from './backup-pass-error';
import type { BackupStageRequest } from './backup-schedule-machine';
import { backupScheduleMachine } from './backup-schedule-machine';
import { removeAbandonedSets } from './remove-abandoned-sets';
import type { BackupPass } from './run-backup-pass';
import { runBackupPass } from './run-backup-pass';
import type { BackupStageOutcome } from './run-backup-stage-pass';
import { runBackupStagePass } from './run-backup-stage-pass';

export interface BackupScheduleOptions {
  readonly context: BackupContext;
  readonly intervalMs: number;
  readonly onAbandoned: (sequences: readonly number[]) => void;
  readonly onPass: (pass: BackupPass) => void;
  readonly onError: (error: unknown) => void;
}

export interface BackupSchedule {
  readonly stage: () => Promise<BackupStageOutcome>;
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
      stage: () => runBackupStagePass(options.context, options.intervalMs),
      clock: options.context.writer.clock,
      pollMs,
      onPass: options.onPass,
      onError: (error) => {
        if (!(error instanceof BackupPassError)) {
          options.onError(error);

          return;
        }

        try {
          options.onPass(error.pass);
        } catch (passError) {
          options.onError(passError);
        }

        for (const failure of error.failures) {
          options.onError(failure);
        }
      },
    },
  });

  schedule.start();

  const unsubscribe = subscribeToRecordCommits(options.context.writer, () => {
    schedule.send({ type: 'wake' });
  });

  return {
    stage: () => {
      const stage = Promise.withResolvers<BackupStageOutcome>();
      const request: BackupStageRequest = { settle: stage.resolve, reject: stage.reject };

      if (schedule.getSnapshot().status === 'active') {
        schedule.send({ type: 'stage', request });
      } else {
        request.reject(new Error('the backup schedule stopped'));
      }

      return stage.promise;
    },
    stop: async () => {
      unsubscribe();

      if (schedule.getSnapshot().status === 'active') {
        schedule.send({ type: 'stop' });
      }

      await toPromise(schedule);
    },
  };
}
