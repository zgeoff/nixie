import type { JSONObject } from '@heynixie/log';

// The UUIDs behind the short IDs a tool's record shows, keyed by short ID. The model never reads
// them.
interface HiddenUUIDs {
  readonly uuids: Record<string, string>;
}

// A tool with nothing to map stores no hidden field.
export function buildHiddenUUIDs(
  pairs: readonly (readonly [shortID: string, uuid: string])[],
): { readonly hidden: JSONObject } | Record<string, never> {
  if (pairs.length === 0) {
    return {};
  }

  const uuids: HiddenUUIDs['uuids'] = Object.fromEntries(pairs);

  return { hidden: { uuids } };
}
