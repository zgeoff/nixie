import { renderSessionCookie } from '@heynixie/contract';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { sessionHooks } from '../utils/session-hooks';
import { writeSessionSignOut } from '../utils/write-session-revocation';

export function createSignOutProcedure(context: APIContext) {
  return apiImplementer.sessions.signOut.handler(async (options) => {
    const caller = await requireCaller(
      context,
      options.context.sessionToken,
      options.errors.UNAUTHORIZED,
    );

    for (const hook of sessionHooks.list()) {
      await hook.onSigningOut?.(context, caller.identityID);
    }

    const signedOutAt = await writeSessionSignOut(context, caller);

    if (options.context.tokenSource === 'cookie') {
      options.context.resHeaders?.append('set-cookie', renderSessionCookie(null));
    }

    return { signedOutAt: new Date(signedOutAt ?? context.clock.now()) };
  });
}
