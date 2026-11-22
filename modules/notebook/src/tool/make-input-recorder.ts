import type { JSONObject } from '@heynixie/log';

// The call record leaves out the free-text fields, so a note's forget leaves no readable copy of
// them in a tool's records.
export function makeInputRecorder(
  freeTextKeys: readonly string[],
): (input: JSONObject) => JSONObject {
  return (input) =>
    Object.fromEntries(Object.entries(input).filter(([key]) => !freeTextKeys.includes(key)));
}
