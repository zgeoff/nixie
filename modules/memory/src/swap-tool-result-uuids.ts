import { isRecordObject } from './is-record-object';
import { isUUIDShaped } from './is-uuid-shaped';
import type { ShortIDLookup } from './swapped-keys';
import { swappedKeys } from './swapped-keys';

// A stored result of an earlier release can hold the UUID of a moment, an item or a change. The
// model reads its short ID instead, and reads no key at all when no live row gives one.
export function swapToolResultUUIDs(result: unknown, lookup: ShortIDLookup): unknown {
  if (Array.isArray(result)) {
    return result.map((element) => swapToolResultUUIDs(element, lookup));
  }

  if (!isRecordObject(result)) {
    return result;
  }

  const swapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(result)) {
    const rule = Object.hasOwn(swappedKeys, key) ? swappedKeys[key] : undefined;

    if (rule === undefined) {
      swapped[key] = swapToolResultUUIDs(value, lookup);
    } else if (rule.isList && Array.isArray(value)) {
      swapped[key] = value.flatMap((element) => {
        if (!isUUIDShaped(element)) {
          return [element];
        }

        const shortID = lookup[rule.kind].get(element.toLowerCase());

        return shortID === undefined ? [] : [shortID];
      });
    } else if (!rule.isList && isUUIDShaped(value)) {
      const shortID = lookup[rule.kind].get(value.toLowerCase());

      if (shortID !== undefined) {
        swapped[key] = shortID;
      }
    } else {
      swapped[key] = value;
    }
  }

  return swapped;
}
