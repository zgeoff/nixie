import { requireDevice } from '../device/require-device';
// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { readHeadSequence } from '../utils/read-head-sequence';
import { streamLiveDevice } from './stream-live-device';
import { streamLivePage } from './stream-live-page';

export function createLiveProcedures(context: APIContext) {
  return {
    // HTTP sends the status before the stream's first event, so the handler checks the session
    // first to refuse a revoked session with a plain 401.
    follow: apiImplementer.live.follow.handler(async (options) => {
      const input = options.input;

      if ('device' in input) {
        const caller = await requireDevice(context, options.context.sessionToken, {
          buildUnauthorized: options.errors.UNAUTHORIZED,
          buildNotADevice: options.errors.NOT_A_DEVICE,
        });

        return streamLiveDevice(context, {
          device: caller.device,
          token: options.context.sessionToken,
          isKeptActive: caller.caller.scope === 'device',
          pixels: input.device.pixels,
          signal: options.signal,
        });
      }

      // The head is read before the session check, so a revoke that commits after the check lies
      // past the head, where the stream replays it.
      const head = await readHeadSequence(context);

      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      if (caller.scope === 'device') {
        throw options.errors.FORBIDDEN();
      }

      return streamLivePage(context, caller, {
        head,
        afterSequence: input.afterSequence,
        lastEventID: options.lastEventId,
        thread: input.thread,
        clipPayloads: input.clipPayloads,
        signal: options.signal,
        buildUnauthorized: options.errors.UNAUTHORIZED,
      });
    }),
  };
}
