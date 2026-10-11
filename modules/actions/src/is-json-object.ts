// a JSON value that is an object, not a list or a scalar
import type { JSONObject, JSONValue } from '@heynixie/log';

export function isJSONObject(value: JSONValue | undefined): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
