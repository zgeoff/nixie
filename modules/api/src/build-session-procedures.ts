// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { apiImplementer } from './api-implementer';
import { readSessions } from './read-sessions';
import { renderSessionCookie } from './render-session-cookie';
import { requireCaller } from './require-caller';
import type { APIContext } from './types';
import { writeIssuedCode } from './write-issued-code';
import { writeSessionRevocation } from './write-session-revocation';

// Builds the procedures of a signed-in device over the sessions: issue a code for one more device,
// list every live session, and revoke one.
export function buildSessionProcedures(context: APIContext) {
  return {
    issueCode: apiImplementer.sessions.issueCode.handler(async (options) => {
      const caller = await requireCaller(context, options.context, options.errors.UNAUTHORIZED);
      const result = await writeIssuedCode(context, caller, options.input.clientActionID);

      if (result.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }
      return { code: result.code, expiresAt: new Date(result.expiresAt) };
    }),

    list: apiImplementer.sessions.list.handler(async (options) => {
      const caller = await requireCaller(context, options.context, options.errors.UNAUTHORIZED);
      const sessions = await readSessions(context, caller);

      return { sessions: [...sessions] };
    }),

    revoke: apiImplementer.sessions.revoke.handler(async (options) => {
      const caller = await requireCaller(context, options.context, options.errors.UNAUTHORIZED);
      const result = await writeSessionRevocation(context, caller, options.input);

      if (result.status === 'not_found') {
        throw options.errors.SESSION_NOT_FOUND();
      }
      if (result.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      // a browser that revokes its own session drops the cookie with it
      if (
        options.input.sessionID === caller.identityID &&
        options.context.tokenSource === 'cookie'
      ) {
        options.context.resHeaders?.append('set-cookie', renderSessionCookie(null));
      }
      return { revokedAt: new Date(result.revokedAt) };
    }),
  };
}
