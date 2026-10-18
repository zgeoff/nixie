import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { memoryRecalledCodec } from '@heynixie/sessions';
import { waitAtFaultPoint } from '@heynixie/tasks';
import type { RankQuery, RankedMatches } from './find-ranked-matches';
import { findRankedMatches } from './find-ranked-matches';
import { getRowSubject } from './get-row-subject';
import type { MatchScores } from './merge-rankings';
import { parseItemCursor } from './parse-item-cursor';
import { readDeliverableItems } from './read-deliverable-items';
import { subjectColumn } from './subject-column';
import type {
  MemoryState,
  MemorySubject,
  MemoryTables,
  RecallRequest,
  RecallResult,
  RecalledItem,
  SearchMode,
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
        isAtNamedVersion(item, request) &&
        (request.subjects === undefined || request.subjects.includes(item.subject)),
    );

    if (NIXIE_TEST_BUILD) {
      await waitAtFaultPoint('memory.recall.checked', { kind: 'memory', id: null });
    }

    await writeRecallRecord(parts, { request, items, candidates });

    return {
      items,
      next: candidates.next,
      ...(candidates.searchMode === undefined ? {} : { searchMode: candidates.searchMode }),
    };
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

  // each candidate's keyword score and similarity, for a query only
  readonly scores?: ReadonlyMap<string, MatchScores>;

  // how a query searched, for a query only
  readonly searchMode?: SearchMode;
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
    .where('created_sequence', '>', parseItemCursor(request.after))
    .$if(request.subjects !== undefined, (listed) =>
      listed.where(subjectColumn, 'in', request.subjects ?? []),
    )
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
// crowd out the next matches; the delivery drops an item pinned or edited after the ranking. Each
// index ranks above its own floor, and the keyword matches stand alone while the vectors rebuild.
async function findQueryCandidates(parts: StoreParts, query: QueryCandidates): Promise<Candidates> {
  const request = query.request;

  const [pinned, held, others] = await Promise.all([
    request.excludePinned === true ? readPinnedItemIDs(parts) : [],
    readCurrentItemIDs(parts, request.excludedVersions ?? []),
    request.subjects === undefined ? [] : readOtherSubjectIDs(parts, request.subjects),
  ]);

  const excludedIDs = [...pinned, ...held, ...others];
  const selfLimit = request.selfNoteLimit;

  const ranked =
    selfLimit === undefined
      ? await findRankedMatches(parts, buildRankQuery(request, query.limit, excludedIDs))
      : await findSubjectRankedMatches(parts, {
          request,
          limits: { others: query.limit, self: Math.min(selfLimit, MAX_LIMIT) },
          excludedIDs,
        });

  return {
    itemIDs: ranked.matches.map((match) => match.itemID),
    next: null,
    scores: new Map(ranked.matches.map((match) => [match.itemID, match])),
    searchMode: ranked.searchMode,
  };
}

function buildRankQuery(
  request: QueryCandidates['request'],
  limit: number,
  excludedIDs: readonly string[],
): RankQuery {
  return {
    query: request.query,
    limit,
    excludedIDs,
    ...(request.excludedWords === undefined ? {} : { excludedWords: request.excludedWords }),
    ...(request.minScore === undefined ? {} : { minScore: request.minScore }),
    ...(request.minSimilarity === undefined ? {} : { minSimilarity: request.minSimilarity }),
  };
}

interface SubjectRanking {
  readonly request: QueryCandidates['request'];

  // the limit of self-notes, and of the owner's and the shared items together
  readonly limits: { readonly others: number; readonly self: number };
  readonly excludedIDs: readonly string[];
}

// Ranks self-notes apart from the owner's and the shared items, each up to its own limit, so a run
// of matches of one never pushes the other past the cut. Each ranking leaves out the other's items.
async function findSubjectRankedMatches(
  parts: StoreParts,
  ranking: SubjectRanking,
): Promise<RankedMatches> {
  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'kind', 'subject'])
    .where('state', '=', 'active')
    .execute();

  const selfIDs = rows.filter((row) => getRowSubject(row) === 'self').map((row) => row.item_id);
  const otherIDs = rows.filter((row) => getRowSubject(row) !== 'self').map((row) => row.item_id);

  const othersQuery = buildRankQuery(ranking.request, ranking.limits.others, [
    ...ranking.excludedIDs,
    ...selfIDs,
  ]);

  const selfQuery = buildRankQuery(ranking.request, ranking.limits.self, [
    ...ranking.excludedIDs,
    ...otherIDs,
  ]);

  const [facts, notes] = await Promise.all([
    findRankedMatches(parts, othersQuery),
    selfQuery.limit === 0 ? null : findRankedMatches(parts, selfQuery),
  ]);

  return {
    matches: [...facts.matches, ...(notes?.matches ?? [])],
    searchMode: facts.searchMode,
  };
}

// the active items of every subject but these, which leave the ranking before its limit applies
async function readOtherSubjectIDs(
  parts: StoreParts,
  subjects: readonly MemorySubject[],
): Promise<readonly string[]> {
  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('state', '=', 'active')
    .$if(subjects.length > 0, (query) => query.where(subjectColumn, 'not in', subjects))
    .execute();

  return rows.map((row) => row.item_id);
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

interface RecallRecord {
  readonly request: RecallRequest;
  readonly items: readonly RecalledItem[];
  readonly candidates: Candidates;
}

// The record holds references and no text, so a later forget leaves no readable copy of what the
// recall delivered. A query's scores and search mode let retrieval be tuned from what each turn was
// given. A turn note's record says so, so a rating binds past it.
async function writeRecallRecord(parts: StoreParts, recall: RecallRecord): Promise<void> {
  const log = parts.context.log;
  const request = recall.request;

  await withWriteTransaction(log.writer, (tx) =>
    writeRecordsInTransaction(tx, log, [
      {
        kind: memoryRecalledCodec.kind,
        definitions: parts.context.definitions(),
        ...(request.thread === undefined ? {} : { thread: request.thread }),
        payload: memoryRecalledCodec.encode({
          items: recall.items.flatMap((item) => {
            const scores = recall.candidates.scores?.get(item.itemID);

            return (item.history ?? [item]).map((version) =>
              buildRecalledRef({ itemID: item.itemID, version: version.version }, scores),
            );
          }),
          ...(recall.candidates.searchMode === undefined
            ? {}
            : { searchMode: recall.candidates.searchMode }),
          ...(request.isTurnNote === true ? { isTurnNote: true } : {}),
        }),
      },
    ]),
  );
}

type RecalledRef = ReturnType<typeof memoryRecalledCodec.decode>['items'][number];

// the delivered version with each score an index gave its item, leaving out an index that did not
// place it
function buildRecalledRef(ref: VersionRef, scores: MatchScores | undefined): RecalledRef {
  return {
    itemID: ref.itemID,
    version: ref.version,
    ...(scores?.score === undefined ? {} : { score: scores.score }),
    ...(scores?.similarity === undefined ? {} : { similarity: scores.similarity }),
  };
}
