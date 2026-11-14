import {
  pauseNixieInTransaction,
  readPauseSince,
  resumeNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import { readLatestRecovery, readTaskDirectory } from '@heynixie/tasks';
import { toPauseResponse, toPauseState } from '../pause/to-pause-state';
import { toRecoveryResponse } from '../pause/to-recovery-response';
import type { APIContext } from '../types';
import { hostImplementer } from './host-implementer';

export function createHostNixieProcedures(context: APIContext) {
  const nixie = hostImplementer.nixie;

  return {
    pause: nixie.pause.handler(() =>
      withWriteTransaction(context.log.writer, async (tx) => {
        await pauseNixieInTransaction(tx, context.log, {
          cause: 'owner',
          recoveryID: null,
          by: 'host',
          definitions: context.definitions(),
        });

        const pause = await readPauseSince(tx);

        return { paused: toPauseResponse(toPauseState(pause)) };
      }),
    ),

    resume: nixie.resume.handler(() =>
      withWriteTransaction(context.log.writer, async (tx) => {
        await resumeNixieInTransaction(tx, context.log, {
          by: 'host',
          definitions: context.definitions(),
        });

        const pause = await readPauseSince(tx);

        return { paused: toPauseResponse(toPauseState(pause)) };
      }),
    ),
  };
}

export function createHostRecoveryProcedures(context: APIContext) {
  return {
    read: hostImplementer.recovery.read.handler(async () => {
      const started = await withWriteTransaction(context.log.writer, (tx) =>
        readLatestRecovery(tx),
      );

      if (started === null) {
        return { recovery: null };
      }

      const messaging = await readTaskDirectory(context, {
        directory: context.settings.taskDirectory,
      });

      return { recovery: toRecoveryResponse(started, messaging.directory) };
    }),
  };
}
