import type { JSONObject } from '@heynixie/log';

// Makes a memory tool's record form of its input, which leaves out the free-text arguments the
// model wrote. The model can copy an item's text into any of them, and the call's record sits under
// its own key, so a forget would leave that copy readable.
export function makeInputRecorder(
  freeTextKeys: readonly string[],
): (input: JSONObject) => JSONObject {
  return (input) =>
    Object.fromEntries(Object.entries(input).filter(([key]) => !freeTextKeys.includes(key)));
}
