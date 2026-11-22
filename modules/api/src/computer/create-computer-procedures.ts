// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { match } from 'ts-pattern';
import { z } from 'zod';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { buildWatchStreamURL } from './build-watch-stream-url';
import { runComputerAction } from './run-computer-action';
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
          streamURL: buildWatchStreamURL(minted.ticket),
        }))
        .with({ status: 'reused' }, () => {
          throw options.errors.CLIENT_ACTION_ID_REUSED();
        })
        .with({ status: 'unauthorized' }, () => {
          throw options.errors.UNAUTHORIZED();
        })
        .exhaustive();
    }),

    takeOver: apiImplementer.computer.takeOver.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      // only a signed-in session of the full scope takes over: it can type into a signed-in account
      if (caller.scope !== 'full') {
        throw options.errors.UNAUTHORIZED();
      }

      const takeover = context.computerWatch?.readTakeover();

      if (takeover === null || takeover === undefined) {
        throw options.errors.COMPUTER_UNAVAILABLE();
      }

      const run = await runComputerAction(
        context,
        caller,
        { procedure: 'computer.takeOver', clientActionID: options.input.clientActionID },
        async () => {
          const result = await takeover.start(caller.identityID);

          return match(result)
            .with({ kind: 'started' }, (started) => ({ takenOverAt: started.takenOverAt }))
            .with({ kind: 'busy_too_long' }, () => ({ refused: 'BUSY_TOO_LONG' }))
            .with({ kind: 'held_elsewhere' }, () => ({ refused: 'HELD_ELSEWHERE' }))
            .exhaustive();
        },
      );

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.result['refused'] === 'BUSY_TOO_LONG') {
        throw options.errors.BUSY_TOO_LONG();
      }

      if (run.result['refused'] === 'HELD_ELSEWHERE') {
        throw options.errors.HELD_ELSEWHERE();
      }

      return { takenOverAt: z.number().parse(run.result['takenOverAt']) };
    }),

    handBack: apiImplementer.computer.handBack.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      if (caller.scope !== 'full') {
        throw options.errors.UNAUTHORIZED();
      }

      const takeover = context.computerWatch?.readTakeover();

      if (takeover === null || takeover === undefined) {
        throw options.errors.COMPUTER_UNAVAILABLE();
      }

      const run = await runComputerAction(
        context,
        caller,
        { procedure: 'computer.handBack', clientActionID: options.input.clientActionID },
        async () => {
          const result = await takeover.end('user', caller.identityID);

          return result.kind === 'ended'
            ? { durationSeconds: result.durationSeconds }
            : { refused: 'NOT_TAKEN_OVER' };
        },
      );

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.result['refused'] === 'NOT_TAKEN_OVER') {
        throw options.errors.NOT_TAKEN_OVER();
      }

      return { durationSeconds: z.number().parse(run.result['durationSeconds']) };
    }),
  };
}
