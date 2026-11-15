import type { JSONObject } from '@heynixie/log';

// hidden is stored only when the tool set it to an object with 1 key or more
export function buildHiddenFields(fields: JSONObject, hidden: JSONObject | undefined): JSONObject {
  return hidden !== undefined && Object.keys(hidden).length > 0 ? { ...fields, hidden } : fields;
}
