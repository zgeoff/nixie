import type { JSONObject, JSONValue } from '@heynixie/log';
import { recallPageLimitBytes } from '@heynixie/wire';

// Cuts a result to fit the tool output limit by dropping entries from the end of its longest list,
// one at a time. The totals the result carries beside each list still give what was there.
export function cutResultLists(
  result: JSONObject,
  keys: readonly string[],
  limitBytes: number = recallPageLimitBytes,
): JSONObject {
  const lists = new Map<string, JSONValue[]>(
    keys.flatMap((key) => {
      const value = result[key];

      return Array.isArray(value) ? [[key, [...value]] as const] : [];
    }),
  );

  const build = (): JSONObject => ({ ...result, ...Object.fromEntries(lists) });

  for (;;) {
    const current = build();

    if (Buffer.byteLength(JSON.stringify(current)) <= limitBytes) {
      return current;
    }

    const longest = [...lists.entries()]
      .toSorted((first, second) => second[1].length - first[1].length)
      .at(0);

    if (longest === undefined || longest[1].length === 0) {
      return current;
    }

    longest[1].pop();
  }
}
