import type { ItemKeyResolution } from './pick-item-key-resolution';
import type { ItemValueKey } from './types';

interface Picked {
  readonly resolution: ItemKeyResolution;

  // whether the marks read again, after the keys, say the value is removed
  readonly isRemovedAfter: boolean;
  readonly keys: ReadonlyMap<string, CryptoKey | null>;
}

// A key that is missing after a removal mark appeared reads removed, never shredded, because the
// purge deletes a key after it writes the mark.
export function pickItemValueKey(picked: Picked): ItemValueKey {
  const resolution = picked.resolution;

  if (resolution.kind === 'unresolved') {
    return { status: 'unreadable' };
  }

  if (resolution.isRemoved || picked.isRemovedAfter) {
    return { status: 'removed' };
  }

  const key = picked.keys.get(resolution.keyID);

  if (key === undefined) {
    return { status: 'shredded' };
  }

  if (key === null) {
    return { status: 'unreadable' };
  }

  if (resolution.recordKeyID === undefined) {
    return { status: 'readable', keyID: resolution.keyID, key };
  }

  const recordKey =
    resolution.recordKeyID === null ? undefined : picked.keys.get(resolution.recordKeyID);

  if (recordKey === undefined) {
    return { status: 'shredded' };
  }

  return recordKey === null
    ? { status: 'unreadable' }
    : { status: 'readable', keyID: resolution.keyID, key, recordKey };
}
