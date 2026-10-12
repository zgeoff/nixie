import type { VersionRef } from './types';

// The key of a version's row, which the log's changed rows carry: the item ID and the version.
export function buildVersionKey(ref: VersionRef): string {
  return `${ref.itemID}/${String(ref.version)}`;
}
