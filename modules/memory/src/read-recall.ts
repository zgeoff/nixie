import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { waitAtFaultPoint } from '@heynixie/tasks';
import { InvalidCursorError } from './invalid-cursor-error';
import { readDeliverableItems } from './read-deliverable-items';
import type {
  MemoryState,
  MemoryTables,
  RecallRequest,
  RecallResult,
  RecalledItem,
  StoreParts,
  VersionRef,
} from './types';

// Returns stored items word for word. Candidates are ranked outside the delivery lock; under it each
// one's state, version and key are checked again, its text is decrypted, and a memory.recalled
// record lists what was delivered, so no text gets through after a forget began.
export async function readRecall(parts: StoreParts, request: RecallRequest): Promise<RecallResult> {
  const limit = Math.min(request.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const states: readonly MemoryState[] =
    request.includeRetired === true ? ['active', 'retired'] : ['active'];

  const candidates = await findCandidates(parts, { request, limit, states });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('memory.recall.ranked', { kind: 'memory', id: null });
  }

  return parts.lock(async () => {
    const deliverable = await readDeliverableItems(parts, {
      itemIDs: candidates.itemIDs,
      states,
      includeHistory: request.includeHistory === true,
    });

    const excluded = buildVersionKeys(request.excludedVersions ?? []);

    const items = deliverable.filter(
      (item) =>
        !(request.excludePinned === true && item.isPinned) &&
        !excluded.has(buildVersionKey(item)) &&
        isAtNamedVersion(item, request),
    );

    if (NIXIE_TEST_BUILD) {
      await waitAtFaultPoint('memory.recall.checked', { kind: 'memory', id: null });
    }

    await writeRecallRecord(parts, { request, items, scores: candidates.scores });

    return { items, next: candidates.next };
  });
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface CandidateQuery {
  readonly request: RecallRequest;
  readonly limit: number;
  readonly states: readonly MemoryState[];
}

interface Candidates {
  readonly itemIDs: readonly string[];
  readonly next: string | null;

  // each candidate's match score, for a query only
  readonly scores?: ReadonlyMap<string, number>;
}

async function findCandidates(parts: StoreParts, query: CandidateQuery): Promise<Candidates> {
  const request = query.request;

  if (request.query !== undefined) {
    return findQueryCandidates(parts, { ...query, request: { ...request, query: request.query } });
  }

  const named = request.versions?.map((ref) => ref.itemID) ?? request.itemIDs;

  if (named !== undefined) {
    return { itemIDs: [...new Set(named)].slice(0, query.limit), next: null };
  }

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'created_sequence'])
    .where('state', 'in', query.states)
    .where('created_sequence', '>', parseCursor(request.after))
    .orderBy('created_sequence')
    .limit(query.limit + 1)
    .execute();

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);

  return {
    itemIDs: page.map((row) => row.item_id),
    next: rows.length > query.limit && last !== undefined ? String(last.created_sequence) : null,
  };
}

interface QueryCandidates extends CandidateQuery {
  readonly request: RecallRequest & { readonly query: string };
}

// The ranking leaves pinned items and excluded versions out before the limit applies, so they never
// crowd out the next matches. The delivery drops an item pinned after the ranking, or one whose
// excluded version is still current after an edit the ranking saw.
async function findQueryCandidates(parts: StoreParts, query: QueryCandidates): Promise<Candidates> {
  const [pinned, held] = await Promise.all([
    query.request.excludePinned === true ? readPinnedItemIDs(parts) : [],
    readCurrentItemIDs(parts, query.request.excludedVersions ?? []),
  ]);

  const matches = await parts.index.findMatches(query.request.query, {
    limit: query.limit,
    excludedIDs: [...pinned, ...held],
    ...(query.request.excludedWords === undefined
      ? {}
      : { excludedWords: query.request.excludedWords }),
    ...(query.request.minScore === undefined ? {} : { minScore: query.request.minScore }),
  });

  return {
    itemIDs: matches.map((match) => match.itemID),
    next: null,
    scores: new Map(matches.map((match) => [match.itemID, match.score])),
  };
}

async function readPinnedItemIDs(parts: StoreParts): Promise<readonly string[]> {
  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('is_pinned', '=', 1)
    .execute();

  return rows.map((row) => row.item_id);
}

// an item a request named at a version is delivered only at that version, so its recall record
// never lists a version the caller did not ask for
function isAtNamedVersion(item: RecalledItem, request: RecallRequest): boolean {
  return (
    request.versions === undefined ||
    request.versions.some((ref) => ref.itemID === item.itemID && ref.version === item.version)
  );
}

// the items whose current version is one of the refs
async function readCurrentItemIDs(
  parts: StoreParts,
  refs: readonly VersionRef[],
): Promise<readonly string[]> {
  if (refs.length === 0) {
    return [];
  }

  const keys = buildVersionKeys(refs);

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'version'])
    .where('item_id', 'in', [...new Set(refs.map((ref) => ref.itemID))])
    .execute();

  return rows
    .filter((row) => keys.has(buildVersionKey({ itemID: row.item_id, version: row.version })))
    .map((row) => row.item_id);
}

function buildVersionKeys(refs: readonly VersionRef[]): ReadonlySet<string> {
  return new Set(refs.map((ref) => buildVersionKey(ref)));
}

function buildVersionKey(ref: VersionRef): string {
  return `${ref.itemID}@${ref.version}`;
}

// a cursor is the creation sequence of the last item on a page
function parseCursor(after: string | undefined): number {
  if (after === undefined) {
    return 0;
  }

  if (!/^\d+$/u.test(after) || !Number.isSafeInteger(Number(after))) {
    throw new InvalidCursorError(after);
  }

  return Number(after);
}

interface RecallRecord {
  readonly request: RecallRequest;
  readonly items: readonly RecalledItem[];
  readonly scores: ReadonlyMap<string, number> | undefined;
}

// The record holds references and no text, so a later forget leaves no readable copy of what the
// recall delivered. A query's record gives each item its match score, so retrieval can be tuned
// from what each turn was given.
async function writeRecallRecord(parts: StoreParts, recall: RecallRecord): Promise<void> {
  const log = parts.context.log;
  const request = recall.request;

  await withWriteTransaction(log.writer, (tx) =>
    writeRecordsInTransaction(tx, log, [
      {
        kind: 'memory.recalled',
        definitions: parts.context.definitions(),
        ...(request.thread === undefined ? {} : { thread: request.thread }),
        payload: {
          items: recall.items.flatMap((item) => {
            const score = recall.scores?.get(item.itemID);

            return (item.history ?? [item]).map((version) =>
              score === undefined
                ? { itemID: item.itemID, version: version.version }
                : { itemID: item.itemID, version: version.version, score },
            );
          }),
        },
      },
    ]),
  );
}
