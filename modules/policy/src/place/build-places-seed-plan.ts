import { createShortID } from '@heynixie/db';
import { formatPlaceKey } from './format-place-key';
import type { PlaceFileEntry } from './parse-place-file';
import type { PlaceKey, PlacesSeedAdd, PlacesSeedPlan, SeedPlaceRow } from './types';

// The seed sets and removes only the entries it added and nobody has changed since. An entry that
// you added or changed keeps its level and its name. A level or a name that the file changes
// replaces the entry, so the seed never writes a change record.
export function buildPlacesSeedPlan(
  file: readonly PlaceFileEntry[],
  rows: readonly SeedPlaceRow[],
): PlacesSeedPlan {
  const held = new Map(rows.map((row) => [keyOf(row.key), row]));
  const listed = new Set<string>();

  const adds: PlacesSeedAdd[] = [];
  const removes: string[] = [];

  for (const entry of file) {
    const key = entry.key;

    if (key.kind !== 'site' && key.kind !== 'mail_domain') {
      continue;
    }

    listed.add(keyOf(key));

    const row = held.get(keyOf(key));
    const add = { key, trust: entry.trust, name: entry.name };

    if (row === undefined) {
      adds.push(buildSeedAdd(add));
    } else if (isSeedOwned(row) && (row.trust !== entry.trust || row.name !== entry.name)) {
      removes.push(row.placeID);
      adds.push(buildSeedAdd(add));
    }
  }

  for (const row of rows) {
    if (isSeedOwned(row) && !listed.has(keyOf(row.key))) {
      removes.push(row.placeID);
    }
  }

  return { adds, removes };
}

function keyOf(key: PlaceKey): string {
  return `${key.kind}:${formatPlaceKey(key)}`;
}

function buildSeedAdd(add: Omit<PlacesSeedAdd, 'placeID' | 'shortID'>): PlacesSeedAdd {
  return { placeID: crypto.randomUUID(), shortID: createShortID(), ...add };
}

function isSeedOwned(row: SeedPlaceRow): boolean {
  return row.addedBy === 'seed' && !row.isChanged;
}
