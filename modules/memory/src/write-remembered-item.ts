import { planRememberedVersion } from './plan-remembered-version';
import type { RememberRequest, StoreParts, VersionRef } from './types';
import { writeMemoryVersion } from './write-memory-version';

// Creates an item with its first version, or adds an edited version to the item the caller read.
// An edit keeps the item's state, and fails as stale once the item has moved past the version the
// caller read.
export function writeRememberedItem(
  parts: StoreParts,
  request: RememberRequest,
): Promise<VersionRef> {
  return writeMemoryVersion(parts, planRememberedVersion(request));
}
