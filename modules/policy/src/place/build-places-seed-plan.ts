import { createShortID } from '@heynixie/db';
import type { Definitions, RecordInput } from '@heynixie/log';
import { formatPlaceKey } from './format-place-key';
import type { PlaceFileEntry } from './parse-place-file';
import { placesAddedCodec } from './places-added-codec';
import { placesRemovedCodec } from './places-removed-codec';
import type { PlaceRef } from './read-place-refs';
import type { PlaceKey, Trust } from './types';

// A site or mail domain entry of the directory that the seed may have added.
export interface SeedPlaceRow {
  readonly placeID: string;
  readonly key: Extract<PlaceKey, { kind: 'site' | 'mail_domain' }>;
  readonly trust: Trust;
  readonly addedBy: string;

  // true when a places.changed record named the entry since it was added
  readonly isChanged: boolean;
}

export interface PlacesSeedAdd {
  readonly placeID: string;
  readonly shortID: string;
  readonly key: Extract<PlaceKey, { kind: 'site' | 'mail_domain' }>;
  readonly trust: Exclude<Trust, 'self'>;
  readonly name: string | null;
}

export interface PlacesSeedPlan {
  readonly adds: readonly PlacesSeedAdd[];
  readonly removes: readonly string[];
}

// The seed sets and removes only the entries it added and nobody has changed since. An entry that
// you added or changed keeps its level. A level that the file changes replaces the entry, so the
// seed never writes a change record.
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

    if (row === undefined) {
      adds.push({
        placeID: crypto.randomUUID(),
        shortID: createShortID(),
        key,
        trust: entry.trust,
        name: entry.name,
      });
    } else if (isSeedOwned(row) && row.trust !== entry.trust) {
      removes.push(row.placeID);

      adds.push({
        placeID: crypto.randomUUID(),
        shortID: createShortID(),
        key,
        trust: entry.trust,
        name: entry.name,
      });
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

// The entries of the directory after the plan, by ID and level.
export function applyPlacesSeedPlan(
  refs: readonly PlaceRef[],
  plan: PlacesSeedPlan,
): readonly PlaceRef[] {
  const removed = new Set(plan.removes);

  return [
    ...refs.filter((ref) => !removed.has(ref.placeID)),
    ...plan.adds.map((add) => ({ placeID: add.placeID, trust: add.trust })),
  ];
}

export function buildPlacesSeedRecords(
  plan: PlacesSeedPlan,
  definitions: Definitions,
): readonly RecordInput[] {
  return [
    ...plan.removes.map((placeID): RecordInput => ({
      kind: 'places.removed',
      definitions,
      payload: placesRemovedCodec.encode({ placeID }),
    })),
    ...plan.adds.map((add): RecordInput => ({
      kind: 'places.added',
      definitions,
      payload: placesAddedCodec.encode({
        placeID: add.placeID,
        shortID: add.shortID,
        kind: add.key.kind,
        trust: add.trust,
        addedBy: 'seed',
        domain: add.key.domain,
        subdomains: add.key.subdomains,
        name: add.name,
      }),
    })),
  ];
}

function isSeedOwned(row: SeedPlaceRow): boolean {
  return row.addedBy === 'seed' && !row.isChanged;
}
