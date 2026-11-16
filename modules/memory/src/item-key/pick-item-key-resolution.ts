import type { ItemKeyFacts, ItemKeyRow } from './read-item-key-facts';
import type { ItemValueRef } from './types';

export type ItemKeyResolution =
  | { readonly kind: 'unresolved' }
  | {
      readonly kind: 'resolved';
      readonly keyID: string;

      // the quoted record's key ID, for a quote; null when that record has no key
      readonly recordKeyID?: string | null;
      readonly isRemoved: boolean;
    };

// The key that sealed a record's value is the item's generation key with the greatest
// from_sequence below the record's sequence. Generation 0, the item's own ID, has no row until a
// purge deletes it.
export function pickGenerationKeyID(facts: ItemKeyFacts, itemID: string, sequence: number): string {
  const generations = (facts.keyRows.get(itemID) ?? [])
    .filter((row) => row.kind === 'generation' && row.from_sequence < sequence)
    .toSorted((first, second) => second.from_sequence - first.from_sequence);

  return generations[0]?.key_id ?? itemID;
}

export function pickItemKeyResolution(facts: ItemKeyFacts, ref: ItemValueRef): ItemKeyResolution {
  const rows = facts.keyRows.get(ref.itemID) ?? [];
  const isPurging = facts.purging.has(ref.itemID);
  const item = facts.items.get(ref.itemID);

  if (ref.value === 'version') {
    const versionRow = findVersionRow(rows, ref.version);
    const keyID = versionRow?.key_id ?? pickGenerationKeyID(facts, ref.itemID, ref.sequence);
    const isCurrent = item?.version === ref.version;

    return {
      kind: 'resolved',
      keyID,
      isRemoved: isMarkedRemoved(rows, keyID) || (isPurging && !isCurrent),
    };
  }

  if (ref.value === 'version-quote') {
    const versionRow = findVersionRow(rows, ref.version);

    if (versionRow === undefined) {
      return { kind: 'unresolved' };
    }

    const isCurrent = item?.version === ref.version;

    return {
      kind: 'resolved',
      keyID: versionRow.key_id,
      recordKeyID: facts.quotedKeyIDs.get(ref.recordSequence) ?? null,
      isRemoved:
        isMarkedRemoved(rows, versionRow.key_id) ||
        (isPurging && !isCurrent) ||
        facts.forgettingSequences.has(ref.recordSequence),
    };
  }

  const keyID = pickGenerationKeyID(facts, ref.itemID, ref.sequence);

  if (ref.value === 'proposal') {
    return { kind: 'resolved', keyID, isRemoved: isMarkedRemoved(rows, keyID) || isPurging };
  }

  const revision = facts.labelRevisions.get(ref.sequence);

  if (revision === undefined) {
    return { kind: 'unresolved' };
  }

  const isCurrent = item?.revision === revision;

  return {
    kind: 'resolved',
    keyID,
    isRemoved: isMarkedRemoved(rows, keyID) || (isPurging && !isCurrent),
  };
}

function findVersionRow(rows: readonly ItemKeyRow[], version: number): ItemKeyRow | undefined {
  return rows.find((row) => row.kind === 'version' && row.version === version);
}

function isMarkedRemoved(rows: readonly ItemKeyRow[], keyID: string): boolean {
  return rows.some((row) => row.key_id === keyID && row.removed_sequence !== null);
}
