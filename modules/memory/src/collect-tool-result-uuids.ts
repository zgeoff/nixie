import { isRecordObject } from './is-record-object';
import { isUUIDShaped } from './is-uuid-shaped';
import type { ShortIDKind } from './swapped-keys';
import { swappedKeys } from './swapped-keys';

export type ToolResultUUIDs = Record<ShortIDKind, Set<string>>;

// Adds each UUID that sits under a swapped key of a stored result, at any depth, to the sets.
export function collectToolResultUUIDs(result: unknown, found: ToolResultUUIDs): void {
  if (Array.isArray(result)) {
    for (const element of result) {
      collectToolResultUUIDs(element, found);
    }

    return;
  }

  if (!isRecordObject(result)) {
    return;
  }

  for (const [key, value] of Object.entries(result)) {
    const swapped = Object.hasOwn(swappedKeys, key) ? swappedKeys[key] : undefined;

    if (swapped === undefined) {
      collectToolResultUUIDs(value, found);
    } else if (swapped.isList && Array.isArray(value)) {
      for (const element of value) {
        if (isUUIDShaped(element)) {
          found[swapped.kind].add(element.toLowerCase());
        } else {
          collectToolResultUUIDs(element, found);
        }
      }
    } else if (isUUIDShaped(value)) {
      found[swapped.kind].add(value.toLowerCase());
    } else {
      collectToolResultUUIDs(value, found);
    }
  }
}
