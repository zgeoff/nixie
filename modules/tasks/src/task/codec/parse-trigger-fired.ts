import type { JSONObject } from '@heynixie/log';
import { triggerFiredCodec } from './trigger-fired-codec';

// A fire of a kind that this release's codec does not know, such as one a later release wrote
// before a rollback, parses as null.
export function parseTriggerFired(
  payload: JSONObject,
): ReturnType<typeof triggerFiredCodec.decode> | null {
  try {
    return triggerFiredCodec.decode(payload);
  } catch {
    return null;
  }
}
