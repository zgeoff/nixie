// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { match } from 'ts-pattern';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { buildWatchStreamURL } from './build-watch-stream-url';
import { writeCheckedComputerWatch } from './write-checked-computer-watch';

export function createComputerProcedures(context: APIContext) {
  return {
    watch: apiImplementer.computer.watch.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      // only a signed-in session of the full scope watches: the screen can show a signed-in account
      if (caller.scope !== 'full') {
        throw options.errors.UNAUTHORIZED();
      }

      const watch = context.computerWatch;

      if (watch === undefined || watch.readWatch() === null) {
        throw options.errors.COMPUTER_UNAVAILABLE();
      }

      const result = await writeCheckedComputerWatch(
        context,
        watch.tickets,
        caller,
        options.input.clientActionID,
      );

      return match(result)
        .with({ status: 'minted' }, (minted) => ({
          streamURL: buildWatchStreamURL(options.context.origin, minted.ticket),
        }))
        .with({ status: 'reused' }, () => {
          throw options.errors.CLIENT_ACTION_ID_REUSED();
        })
        .with({ status: 'unauthorized' }, () => {
          throw options.errors.UNAUTHORIZED();
        })
        .exhaustive();
    }),
  };
}
