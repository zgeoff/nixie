import { buildShortIDFromUUID } from '@heynixie/db';
import { isRecordObject } from '../record/is-record-object';
import type { ShortIDKind, ShortIDLookup } from '../utils/key/swapped-keys';
import { swappedKeys } from '../utils/key/swapped-keys';
import { isUUIDShaped } from './is-uuid-shaped';

// A stored result of an earlier release can hold the UUID of a moment, an item or a proposal. The
// model reads its short ID instead, and reads no key at all when no live row gives one.
// A proposal's short ID derives from its UUID, so it needs no row.
const proposalIDKey = 'proposalID';

export function swapToolResultUUIDs(result: unknown, lookup: ShortIDLookup): unknown {
  if (Array.isArray(result)) {
    return result.map((element) => swapToolResultUUIDs(element, lookup));
  }

  if (!isRecordObject(result)) {
    return result;
  }

  // fromEntries defines each field as an own property, so a field named __proto__ survives.
  return Object.fromEntries(
    Object.entries(result).flatMap(([key, value]): [string, unknown][] => {
      if (key === proposalIDKey && isUUIDShaped(value)) {
        return [[key, buildShortIDFromUUID(value.toLowerCase())]];
      }

      const rule = Object.hasOwn(swappedKeys, key) ? swappedKeys[key] : undefined;

      if (rule === undefined) {
        return [[key, swapToolResultUUIDs(value, lookup)]];
      }

      if (rule.isList && Array.isArray(value)) {
        return [[key, value.flatMap((element) => swapListElement(element, rule.kind, lookup))]];
      }

      if (isUUIDShaped(value)) {
        const shortID = lookup[rule.kind].get(value.toLowerCase());

        return shortID === undefined ? [] : [[key, shortID]];
      }

      return [[key, swapToolResultUUIDs(value, lookup)]];
    }),
  );
}

function swapListElement(element: unknown, kind: ShortIDKind, lookup: ShortIDLookup): unknown[] {
  if (!isUUIDShaped(element)) {
    return [swapToolResultUUIDs(element, lookup)];
  }

  const shortID = lookup[kind].get(element.toLowerCase());

  return shortID === undefined ? [] : [shortID];
}
