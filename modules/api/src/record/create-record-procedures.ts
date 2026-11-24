import type { APIContext } from '../types';
import { createReadPayloadProcedure } from './create-read-payload-procedure';

export function createRecordProcedures(context: APIContext) {
  return { readPayload: createReadPayloadProcedure(context) };
}
