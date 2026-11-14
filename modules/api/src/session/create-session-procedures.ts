import { writeIssuedCode } from '../enrolment/write-issued-code';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { apiImplementer } from '../utils/api-implementer';
import { readSessions } from '../utils/read-sessions';

export function createSessionProcedures(context: APIContext) {
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
