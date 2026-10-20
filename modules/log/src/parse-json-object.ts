import { JSON_OBJECT_SCHEMA } from './json-object-schema';
import type { JSONObject } from './types';

export function parseJSONObject(text: string): JSONObject {
  return JSON_OBJECT_SCHEMA.parse(JSON.parse(text));
}
