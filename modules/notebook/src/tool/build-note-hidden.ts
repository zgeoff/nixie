import type { JSONObject } from '@heynixie/log';

// The UUIDs behind the short IDs a record shows, which the model never reads. A tool with nothing to
// map stores no hidden field.
export function buildNoteHidden(
  uuids: Readonly<Record<string, string>>,
): { readonly hidden: JSONObject } | Record<string, never> {
  return Object.keys(uuids).length === 0 ? {} : { hidden: { uuids } };
}
