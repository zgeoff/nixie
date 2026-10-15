import { apiImplementer } from './api-implementer';
import { renderSessionCookie } from './render-session-cookie';
import { requireCaller } from './require-caller';
import type { APIContext } from './types';
import { writeSessionRevocation } from './write-session-revocation';

// Builds the revoke of a device session, a checked action of any signed-in device, its own session
// included.
export function buildRevokeProcedure(context: APIContext) {
  return apiImplementer.sessions.revoke.handler(async (options) => {
    const caller = await requireCaller(
      context,
      options.context.sessionToken,
      options.errors.UNAUTHORIZED,
    );

    const result = await writeSessionRevocation(context, caller, options.input);

    if (result.status !== 'revoked') {
      throw {
        not_found: options.errors.SESSION_NOT_FOUND,
        reused: options.errors.CLIENT_ACTION_ID_REUSED,
        unauthorized: options.errors.UNAUTHORIZED,
      }[result.status]();
    }

    // a browser that revokes its own session drops the cookie with it
    if (options.input.sessionID === caller.identityID && options.context.tokenSource === 'cookie') {
      options.context.resHeaders?.append('set-cookie', renderSessionCookie(null));
    }

    return { revokedAt: new Date(result.revokedAt) };
  });
}
