import type { Log } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { ItemKeyResolution } from './pick-item-key-resolution';
import { pickItemKeyResolution } from './pick-item-key-resolution';
import { pickItemValueKey } from './pick-item-value-key';
import { readItemKeyFacts } from './read-item-key-facts';
import type { ItemValueKey, ItemValueRef } from './types';

// The one lookup for every key that seals an item's values. It reads the key rows, then the keys,
// then the removal marks again. Pass the transaction as `db` from inside a write transaction.
export async function readItemKeys(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  refs: readonly ItemValueRef[],
  db: Kysely<unknown> = log.writer.db,
): Promise<readonly ItemValueKey[]> {
  if (refs.length === 0) {
    return [];
  }

  const before = await readItemKeyFacts(db, refs);

  const resolved = refs.map((ref) => ({ ref, resolution: pickItemKeyResolution(before, ref) }));

  const keys = await readRecordKeys(log, collectKeyIDs(resolved.map((one) => one.resolution)));
  const after = await readItemKeyFacts(db, refs);

  return resolved.map((one) => {
    const later = pickItemKeyResolution(after, one.ref);

    return pickItemValueKey({
      resolution: one.resolution,
      isRemovedAfter: later.kind === 'resolved' && later.isRemoved,
      keys,
    });
  });
}

function collectKeyIDs(resolutions: readonly ItemKeyResolution[]): readonly string[] {
  return [
    ...new Set(
      resolutions.flatMap((resolution) =>
        resolution.kind === 'resolved'
          ? [resolution.keyID, ...collectRecordKeyID(resolution.recordKeyID)]
          : [],
      ),
    ),
  ];
}

function collectRecordKeyID(recordKeyID: string | null | undefined): readonly string[] {
  return typeof recordKeyID === 'string' ? [recordKeyID] : [];
}
