import type { JSONObject } from '@heynixie/log';

export function makeInputRecorder(
  freeTextKeys: readonly string[],
): (input: JSONObject) => JSONObject {
  return (input) =>
    Object.fromEntries(Object.entries(input).filter(([key]) => !freeTextKeys.includes(key)));
}
