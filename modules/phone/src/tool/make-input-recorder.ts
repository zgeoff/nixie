import type { JSONObject } from '@heynixie/log';

// The call record leaves out the arguments that name a sender or quote a body, so a forget of a text
// leaves no readable copy of them in a tool's records.
export function makeInputRecorder(textKeys: readonly string[]): (input: JSONObject) => JSONObject {
  return (input) =>
    Object.fromEntries(Object.entries(input).filter(([key]) => !textKeys.includes(key)));
}
