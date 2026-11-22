// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { match } from 'ts-pattern';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { buildWatchStreamURL } from './build-watch-stream-url';
import {
  writeCheckedComputerAction,
  writeComputerActionResult,
} from './write-checked-computer-action';
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

      const action = {
        procedure: 'computer.takeOver',
        clientActionID: options.input.clientActionID,
        result: {},
      };

      const checked = await writeCheckedComputerAction(context, caller, action);

      if (checked.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (checked.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      const stored = checked.earlier?.['takenOverAt'];

      if (typeof stored === 'number') {
        return { takenOverAt: stored };
      }

      const result = await takeover.start(caller.identityID);

      if (result.kind === 'busy_too_long') {
        throw options.errors.BUSY_TOO_LONG();
      }

      if (result.kind === 'held_elsewhere') {
        throw options.errors.HELD_ELSEWHERE();
      }

      await writeComputerActionResult(context, caller, {
        ...action,
        result: { takenOverAt: result.takenOverAt },
      });

      return { takenOverAt: result.takenOverAt };
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

      const action = {
        procedure: 'computer.handBack',
        clientActionID: options.input.clientActionID,
        result: {},
      };

      const checked = await writeCheckedComputerAction(context, caller, action);

      if (checked.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (checked.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      const stored = checked.earlier?.['durationSeconds'];

      if (typeof stored === 'number') {
        return { durationSeconds: stored };
      }

      const result = await takeover.end('user', caller.identityID);

      if (result.kind === 'not_taken_over') {
        throw options.errors.NOT_TAKEN_OVER();
      }

      await writeComputerActionResult(context, caller, {
        ...action,
        result: { durationSeconds: result.durationSeconds },
      });

      return { durationSeconds: result.durationSeconds };
    }),
  };
}
