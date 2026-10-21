// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { createEnrolmentCode } from './create-enrolment-code';
import { hostImplementer } from './host-implementer';
import { readSessions } from './read-sessions';
import type { APIContext } from './types';
import { updateSessionLabel } from './update-session-label';

export function createHostSessionProcedures(context: APIContext) {
  const sessions = hostImplementer.sessions;

  return {
    issueCode: sessions.issueCode.handler(async () => {
      const issued = await createEnrolmentCode(context);

      return { code: issued.code, expiresAt: issued.expiresAt };
    }),

    list: sessions.list.handler(async () => {
      const live = await readSessions(context, null);

      return live.map((session) => ({
        sessionID: session.sessionID,
        deviceName: session.deviceName,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
      }));
    }),

    label: sessions.label.handler(async (options) => {
      const result = await updateSessionLabel(context, options.input);

      if (result.status === 'not_found') {
        throw options.errors.SESSION_NOT_FOUND();
      }

      if (result.status === 'invalid_label') {
        throw options.errors.LABEL_INVALID();
      }

      return { sessionID: result.sessionID, label: result.label };
    }),
  };
}
