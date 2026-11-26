import { hangUpCall, readRunningCall } from '@heynixie/calls';
import { renderSessionCookie } from '@heynixie/contract';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { writeSessionSignOut } from '../utils/write-session-revocation';

export function createSignOutProcedure(context: APIContext) {
  return apiImplementer.sessions.signOut.handler(async (options) => {
    const caller = await requireCaller(
      context,
      options.context.sessionToken,
      options.errors.UNAUTHORIZED,
    );

    // A hang-up request that never arrived must not leave the call running after its session is
    // gone, where it could block the next call until it times out.
    const running =
      context.calls === undefined ? null : await readRunningCall(context.log.writer.db);

    if (context.calls !== undefined && running?.carryingSession === caller.identityID) {
      await hangUpCall(context.calls, running.callID);
    }

    const signedOutAt = await writeSessionSignOut(context, caller);

    if (options.context.tokenSource === 'cookie') {
      options.context.resHeaders?.append('set-cookie', renderSessionCookie(null));
    }

    return { signedOutAt: new Date(signedOutAt ?? context.clock.now()) };
  });
}
