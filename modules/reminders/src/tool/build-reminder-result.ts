import type { JSONObject } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';

export function buildReminderResult(value: unknown): JSONObject {
  return parseJSONObject(JSON.stringify(value));
}
