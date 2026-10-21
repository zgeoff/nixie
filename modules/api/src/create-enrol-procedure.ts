// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { renderSessionCookie } from '@heynixie/contract';
import { apiImplementer } from './api-implementer';
import { claimEnrolmentCode } from './claim-enrolment-code';
import type { APIContext } from './types';

export function createEnrolProcedure(context: APIContext) {
  return apiImplementer.sessions.enrol.handler(async (options) => {
    const result = await claimEnrolmentCode(context, options.input);

    if (result.status === 'invalid') {
      throw options.errors.ENROLMENT_CODE_INVALID();
    }

    if (result.status === 'reused') {
      throw options.errors.CLIENT_ACTION_ID_REUSED();
    }

    if (options.input.tokenDelivery === 'bearer') {
      return { sessionID: result.sessionID, token: result.token };
    }

    options.context.resHeaders?.append('set-cookie', renderSessionCookie(result.token));

    return { sessionID: result.sessionID };
  });
}
