import { renderSessionCookie } from '@heynixie/contract';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { writeSessionRevocation } from '../utils/write-session-revocation';

export function createRevokeProcedure(context: APIContext) {
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

    if (options.input.sessionID === caller.identityID && options.context.tokenSource === 'cookie') {
      options.context.resHeaders?.append('set-cookie', renderSessionCookie(null));
    }

    return { revokedAt: new Date(result.revokedAt) };
  });
}
