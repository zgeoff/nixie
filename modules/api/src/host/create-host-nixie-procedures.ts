import {
  pauseNixieInTransaction,
  readPauseSince,
  resumeNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import { toPauseResponse } from '../pause/to-pause-response';
import { toPauseState } from '../pause/to-pause-state';
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
