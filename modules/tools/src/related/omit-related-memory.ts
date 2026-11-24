import type { JSONObject } from '@heynixie/log';

// A result without `related`. The step keeps an approved call's reply until a later turn reads it,
// and a forget in that time must leave no copy of an item's text for that turn to show.
export function omitRelatedMemory(result: JSONObject): JSONObject {
  const { related: _, ...rest } = result;

  return rest;
}
