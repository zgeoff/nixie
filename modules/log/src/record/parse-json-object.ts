import type { JSONObject } from '../types';
import { JSON_OBJECT_SCHEMA } from '../utils/json-object-schema';

export function parseJSONObject(text: string): JSONObject {
  return JSON_OBJECT_SCHEMA.parse(JSON.parse(text));
}
