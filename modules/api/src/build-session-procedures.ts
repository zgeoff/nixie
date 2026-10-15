// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { apiImplementer } from './api-implementer';
import { readSessions } from './read-sessions';
import { requireCaller } from './require-caller';
import type { APIContext } from './types';
import { writeIssuedCode } from './write-issued-code';

// Builds the procedures of a signed-in device over the sessions: issue a code for one more device,
// and list every live session.
export function buildSessionProcedures(context: APIContext) {
  return {
    issueCode: apiImplementer.sessions.issueCode.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await writeIssuedCode(context, caller, options.input.clientActionID);

      if (result.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (result.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      return { code: result.code, expiresAt: new Date(result.expiresAt) };
    }),

    list: apiImplementer.sessions.list.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const sessions = await readSessions(context, caller);

      return { sessions: [...sessions] };
    }),
  };
}
