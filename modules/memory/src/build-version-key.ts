import type { VersionRef } from './types';

export function buildVersionKey(ref: VersionRef): string {
  return `${ref.itemID}/${String(ref.version)}`;
}
