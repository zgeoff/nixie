import type { JSONObject, Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import type { PolicyTables } from '../policy/policy-tables';
import { parsePlace } from './parse-place';
import type { Place, PlaceKey } from './types';
import { placeAddedByValues, trustLevels } from './types';

export interface StoredPlace extends Place {
  readonly isRemoved: boolean;
  readonly addedSequence: number;
  readonly lastUsedAt: number | null;
}

export interface ReadPlacesOptions {
  // only these places, whether or not they were removed since: a call decides under its snapshot
  readonly placeIDs?: readonly string[];

  readonly isRemovedIncluded?: boolean;

  // The change record each place's name comes from in place of the latest, or null for the name the
  // place was added with: a snapshot keeps the names it was built with. It covers the names in
  // erasable fields, and a site keeps its latest name.
  readonly nameSequences?: ReadonlyMap<string, number | null>;
}

const trustSchema = z.enum(trustLevels);
const addedBySchema = z.enum(placeAddedByValues);

// Reads the directory. A place whose erasable key a forget removed has no key, so it covers
// nothing and is left out. A known contact's key comes from its destination: an address, a number or
// a handle that no other place holds, else a raw key of the exact string.
export async function readPlaces(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  options: ReadPlacesOptions = {},
): Promise<readonly StoredPlace[]> {
  const rows = await readRows(log, options);
  const erasable = await readErasableFields(log, rows);

  const held = new Set<string>();

  return rows.flatMap((row) => {
    const resolved = resolveRow(row, erasable, held);

    if (resolved === null) {
      return [];
    }

    held.add(JSON.stringify(resolved.key));

    return [
      {
        placeID: row.place_id,
        shortID: row.short_id,
        key: resolved.key,
        trust: trustSchema.parse(row.trust),
        name: resolved.name,
        addedBy: addedBySchema.parse(row.added_by),
        isRemoved: row.removed_sequence !== null,
        addedSequence: row.added_sequence,
        lastUsedAt: row.last_used_at,
      },
    ];
  });
}

type PlaceRow = PolicyTables['places'];

async function readRows(
  log: Pick<Log, 'writer'>,
  options: ReadPlacesOptions,
): Promise<readonly PlaceRow[]> {
  const ids = options.placeIDs;
  const db = log.writer.db.$extendTables<PolicyTables>();

  const rows = await db
    .selectFrom('places')
    .leftJoin('place_removals', 'place_removals.place_id', 'places.place_id')
    .selectAll('places')
    .select('place_removals.removed_sequence as personal_removed_sequence')
    .$if(ids !== undefined, (query) => query.where('places.place_id', 'in', ids ?? []))
    .$if(options.isRemovedIncluded !== true && ids === undefined, (query) =>
      query
        .where('places.removed_sequence', 'is', null)
        .where('place_removals.removed_sequence', 'is', null),
    )
    .orderBy('places.added_sequence')
    .execute();

  const named = rows.map((row) => pinNameSequence(toPlaceRow(row), options.nameSequences));

  // an added place claims its key before a contact does
  return [
    ...named.filter((row) => row.origin === 'added'),
    ...named.filter((row) => row.origin === 'contact'),
  ];
}

function pinNameSequence(
  row: PlaceRow,
  pins: ReadonlyMap<string, number | null> | undefined,
): PlaceRow {
  const pinned = pins?.get(row.place_id);

  return pinned === undefined ? row : { ...row, name_sequence: pinned };
}

interface JoinedPlaceRow extends PlaceRow {
  readonly personal_removed_sequence: number | null;
}

function toPlaceRow(joined: JoinedPlaceRow): PlaceRow {
  const { personal_removed_sequence: personalRemovedSequence, ...row } = joined;

  return { ...row, removed_sequence: row.removed_sequence ?? personalRemovedSequence };
}

async function readErasableFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  rows: readonly PlaceRow[],
): Promise<ReadonlyMap<number, JSONObject | null>> {
  const sequences = [
    ...new Set(
      rows.flatMap((row) =>
        isPersonal(row.kind) || row.origin === 'contact'
          ? [row.added_sequence, ...(row.name_sequence === null ? [] : [row.name_sequence])]
          : [],
      ),
    ),
  ];

  if (sequences.length === 0) {
    return new Map();
  }

  const entries = await readRecords(log, {
    afterSequence: 0,
    sequences,
    limit: sequences.length,
  });

  return new Map(
    entries.map((entry) => [
      entry.record.sequence,
      entry.record.erasable.status === 'readable' ? entry.record.erasable.fields : null,
    ]),
  );
}

function isPersonal(kind: string): boolean {
  return kind === 'address' || kind === 'phone' || kind === 'handle';
}

interface ResolvedKey {
  readonly key: PlaceKey;
  readonly name: string | null;
}

const personalKeySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('address'), address: z.string() }),
  z.object({ kind: z.literal('phone'), e164: z.string() }),
  z.object({ kind: z.literal('handle'), channel: z.string(), id: z.string() }),
]);

const addedFieldsSchema = z.object({ key: personalKeySchema, name: z.string().nullable() });
const changedFieldsSchema = z.object({ name: z.string().nullable() });

function resolveRow(
  row: PlaceRow,
  erasable: ReadonlyMap<number, JSONObject | null>,
  held: ReadonlySet<string>,
): ResolvedKey | null {
  if (row.origin === 'contact') {
    return resolveContact(row, erasable, held);
  }

  if (row.kind === 'site' || row.kind === 'mail_domain') {
    return row.domain === null
      ? null
      : {
          key: { kind: row.kind, domain: row.domain, subdomains: row.subdomains === 1 },
          name: row.name,
        };
  }

  const added = addedFieldsSchema.safeParse(erasable.get(row.added_sequence));

  if (!added.success) {
    return null;
  }

  const changed =
    row.name_sequence === null
      ? null
      : changedFieldsSchema.safeParse(erasable.get(row.name_sequence));

  return {
    key: added.data.key,
    name: changed?.success === true ? changed.data.name : added.data.name,
  };
}

const contactFieldsSchema = z.object({ name: z.string().nullable(), destination: z.string() });

function resolveContact(
  row: PlaceRow,
  erasable: ReadonlyMap<number, JSONObject | null>,
  held: ReadonlySet<string>,
): ResolvedKey | null {
  const details = contactFieldsSchema.safeParse(erasable.get(row.added_sequence));

  if (!details.success) {
    return null;
  }

  const parsed = parsePlace(details.data.destination);
  const rawKey: PlaceKey = { kind: 'raw', value: details.data.destination };
  const parsedKey: PlaceKey | null = parsed === null || parsed.kind === 'site' ? null : parsed;
  const key = parsedKey === null || held.has(JSON.stringify(parsedKey)) ? rawKey : parsedKey;

  const changed =
    row.name_sequence === null
      ? null
      : changedFieldsSchema.safeParse(erasable.get(row.name_sequence));

  return { key, name: changed?.success === true ? changed.data.name : details.data.name };
}
