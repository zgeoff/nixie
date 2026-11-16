// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { readRecordPayload } from './read-record-payload';

export function createReadPayloadProcedure(context: APIContext) {
  return apiImplementer.records.readPayload.handler(async (options) => {
    await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

    const payload = await readRecordPayload(context, options.input);

    if (payload.status === 'not_found') {
      throw options.errors.RECORD_NOT_FOUND();
    }

    return payload;
  });
}
