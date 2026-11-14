import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { memoryRecalledCodec } from '@heynixie/sessions';
import { waitAtFaultPoint } from '@heynixie/tasks';
import { getRowSubject } from './get-row-subject';
import type { MatchScores } from './merge-rankings';
import { parseItemCursor } from './parse-item-cursor';
import { readDeliverableItems } from './read-deliverable-items';
import type { RankQuery, RankedMatches } from './read-ranked-matches';
import { readRankedMatches } from './read-ranked-matches';
import { recallLimits } from './recall-limits';
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

export async function readRecall(parts: StoreParts, request: RecallRequest): Promise<RecallResult> {
  const limit = Math.min(request.limit ?? recallLimits.default, recallLimits.max);

  const states: readonly MemoryState[] =
    request.includeRetired === true ? ['active', 'retired'] : ['active'];

  const lapsedBefore = request.includeRetired === true ? null : parts.context.gate.clock.now();

  const candidates = await readCandidates(parts, { request, limit, states, lapsedBefore });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('memory.recall.ranked', { kind: 'memory', id: null });
  }

  return parts.lock(async () => {
    const includeHistory = request.includeHistory === true;

    const [deliverable, pastLimit] = await Promise.all([
      readDeliverableItems(parts, { itemIDs: candidates.itemIDs, states, includeHistory }),
      readDeliverableItems(parts, {
        itemIDs: candidates.pastLimitIDs,
        states,
        includeHistory: false,
      }),
    ]);

    const excluded = buildVersionKeys(request.excludedVersions ?? []);

    const sensitiveIDs =
      request.excludeSensitive === true
        ? await readSensitiveItemIDs(
            parts,
            [...deliverable, ...pastLimit].map((item) => item.itemID),
          )
        : [];

    const sensitive = new Set(sensitiveIDs);

    const isDelivered = (item: RecalledItem): boolean =>
      !(request.excludePinned === true && item.isPinned) &&
      !sensitive.has(item.itemID) &&
      !excluded.has(buildVersionKey(item)) &&
      isAtNamedVersion(item, request) &&
      (request.subjects === undefined || request.subjects.includes(item.subject));

    const items = deliverable.filter((item) => isDelivered(item));

    if (NIXIE_TEST_BUILD) {
      await waitAtFaultPoint('memory.recall.checked', { kind: 'memory', id: null });
    }

    const cut = await cutToBudget(request, items);

    if (cut.kept.length > 0) {
      await writeRecallRecord(parts, { request, items: cut.kept, candidates });
    }

    const omittedItems = [...cut.dropped, ...pastLimit.filter((item) => isDelivered(item))];

    return {
      items: cut.kept,
      next: pickNext(candidates, cut),
      omitted: {
        items:
          candidates.sequences === undefined
            ? omittedItems.map((item) => ({ itemID: item.itemID, shortID: item.shortID }))
            : [],
        count: candidates.sequences === undefined ? omittedItems.length : cut.dropped.length,
        versions: cut.versions,
      },
      ...(candidates.searchMode === undefined ? {} : { searchMode: candidates.searchMode }),
    };
  });
}

interface CandidateQuery {
  readonly request: RecallRequest;
  readonly limit: number;
  readonly states: readonly MemoryState[];

  readonly lapsedBefore: number | null;
}

interface Candidates {
  readonly itemIDs: readonly string[];

  // The named IDs past the limit, which the recall does not return or record.
  readonly pastLimitIDs: readonly string[];
  readonly next: string | null;

  // The cursor of each item, for the plain list only.
  readonly sequences?: ReadonlyMap<string, number>;

  readonly scores?: ReadonlyMap<string, MatchScores>;

  readonly searchMode?: SearchMode;
}

async function readCandidates(parts: StoreParts, query: CandidateQuery): Promise<Candidates> {
  const request = query.request;

  if (request.query !== undefined) {
    return readQueryCandidates(parts, { ...query, request: { ...request, query: request.query } });
  }

  const named = request.versions?.map((ref) => ref.itemID) ?? request.itemIDs;

  if (named !== undefined) {
    const kept = await readNamedSubjectIDs(parts, [...new Set(named)], request.subjects);

    return {
      itemIDs: kept.slice(0, query.limit),
      pastLimitIDs: kept.slice(query.limit),
      next: null,
    };
  }

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'created_sequence'])
    .where('state', 'in', query.states)
    .$if(query.lapsedBefore !== null, (listed) =>
      listed.where((row) =>
        row.or([row('until', 'is', null), row('until', '>', query.lapsedBefore ?? 0)]),
      ),
    )
    .where('created_sequence', '>', parseItemCursor(request.after))
    .$if(request.excludeSensitive === true, (listed) => listed.where('is_sensitive', '=', 0))
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
    pastLimitIDs: [],
    sequences: new Map(page.map((row) => [row.item_id, row.created_sequence])),
    next: rows.length > query.limit && last !== undefined ? String(last.created_sequence) : null,
  };
}

interface QueryCandidates extends CandidateQuery {
  readonly request: RecallRequest & { readonly query: string };
}

async function readQueryCandidates(parts: StoreParts, query: QueryCandidates): Promise<Candidates> {
  const request = query.request;

  const [pinned, sensitive, held, others, lapsed] = await Promise.all([
    request.excludePinned === true ? readPinnedItemIDs(parts) : [],
    request.excludeSensitive === true ? readSensitiveItemIDs(parts, null) : [],
    readCurrentItemIDs(parts, request.excludedVersions ?? []),
    request.subjects === undefined ? [] : readOtherSubjectIDs(parts, request.subjects),
    query.lapsedBefore === null ? [] : readLapsedItemIDs(parts, query.lapsedBefore),
  ]);

  const excludedIDs = [...pinned, ...sensitive, ...held, ...others, ...lapsed];
  const selfLimit = request.selfNoteLimit;

  const ranked =
    selfLimit === undefined
      ? await readRankedMatches(parts, buildRankQuery(request, query.limit, excludedIDs))
      : await readSubjectRankedMatches(parts, {
          request,
          limits: { others: query.limit, self: Math.min(selfLimit, recallLimits.max) },
          excludedIDs,
        });

  return {
    itemIDs: ranked.matches.map((match) => match.itemID),
    pastLimitIDs: [],
    next: null,
    scores: new Map(ranked.matches.map((match) => [match.itemID, match])),
    searchMode: ranked.searchMode,
  };
}

async function readPinnedItemIDs(parts: StoreParts): Promise<readonly string[]> {
  const now = parts.context.gate.clock.now();

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('is_pinned', '=', 1)
    .where((row) => row.or([row('until', 'is', null), row('until', '>', now)]))
    .execute();

  return rows.map((row) => row.item_id);
}

async function readSensitiveItemIDs(
  parts: StoreParts,
  itemIDs: readonly string[] | null,
): Promise<readonly string[]> {
  if (itemIDs?.length === 0) {
    return [];
  }

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('is_sensitive', '=', 1)
    .$if(itemIDs !== null, (query) => query.where('item_id', 'in', itemIDs ?? []))
    .execute();

  return rows.map((row) => row.item_id);
}

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

async function readLapsedItemIDs(parts: StoreParts, now: number): Promise<readonly string[]> {
  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('state', '=', 'active')
    .where('until', '<=', now)
    .execute();

  return rows.map((row) => row.item_id);
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

  readonly limits: { readonly others: number; readonly self: number };
  readonly excludedIDs: readonly string[];
}

async function readSubjectRankedMatches(
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
    readRankedMatches(parts, othersQuery),
    selfQuery.limit === 0 ? null : readRankedMatches(parts, selfQuery),
  ]);

  return {
    matches: [...facts.matches, ...(notes?.matches ?? [])],
    searchMode: facts.searchMode,
  };
}

async function readNamedSubjectIDs(
  parts: StoreParts,
  named: readonly string[],
  subjects: readonly MemorySubject[] | undefined,
): Promise<readonly string[]> {
  if (subjects === undefined || named.length === 0) {
    return named;
  }

  if (subjects.length === 0) {
    return [];
  }

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('item_id', 'in', named)
    .where(subjectColumn, 'in', subjects)
    .execute();

  const kept = new Set(rows.map((row) => row.item_id));

  return named.filter((itemID) => kept.has(itemID));
}

function isAtNamedVersion(item: RecalledItem, request: RecallRequest): boolean {
  return (
    request.versions === undefined ||
    request.versions.some((ref) => ref.itemID === item.itemID && ref.version === item.version)
  );
}

interface Cut {
  readonly kept: readonly RecalledItem[];
  readonly dropped: readonly RecalledItem[];
  readonly versions: number;
}

async function cutToBudget(request: RecallRequest, items: readonly RecalledItem[]): Promise<Cut> {
  const byteBudget = request.byteBudget;
  const measureItem = request.measureItem;

  if (byteBudget === undefined || measureItem === undefined) {
    return { kept: items, dropped: [], versions: 0 };
  }

  const kept: RecalledItem[] = [];
  let used = 0;

  for (const item of items) {
    // oxlint-disable-next-line no-await-in-loop -- each item's room depends on the items before it
    const size = await measureItem(item);

    if (used + kept.length + size > byteBudget) {
      if (kept.length === 0) {
        // oxlint-disable-next-line no-await-in-loop -- runs once, for the first item
        const trimmed = await trimFirstItem(item, { byteBudget, measureItem });

        return { kept: [trimmed.item], dropped: items.slice(1), versions: trimmed.versions };
      }

      break;
    }

    used += size;

    kept.push(item);
  }

  return { kept, dropped: items.slice(kept.length), versions: 0 };
}

interface Budget {
  readonly byteBudget: number;
  readonly measureItem: (item: RecalledItem) => Promise<number>;
}

interface TrimmedItem {
  readonly item: RecalledItem;
  readonly versions: number;
}

// Keeps the current version and the newest past versions that fit. The current version stays even
// when it alone passes the budget.
async function trimFirstItem(item: RecalledItem, budget: Budget): Promise<TrimmedItem> {
  const history = item.history ?? [];
  const past = history.filter((version) => version.version !== item.version);
  const current = history.find((version) => version.version === item.version);

  if (current === undefined || past.length === 0) {
    return { item, versions: 0 };
  }

  let lastTried: TrimmedItem = { item, versions: 0 };

  for (let dropped = 1; dropped <= past.length; dropped += 1) {
    lastTried = {
      item: { ...item, history: [...past.slice(dropped), current] },
      versions: dropped,
    };

    // oxlint-disable-next-line no-await-in-loop -- each try drops one more version than the last
    if ((await budget.measureItem(lastTried.item)) <= budget.byteBudget) {
      return lastTried;
    }
  }

  return lastTried;
}

interface RecallRecord {
  readonly request: RecallRequest;
  readonly items: readonly RecalledItem[];
  readonly candidates: Candidates;
}

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

function buildRecalledRef(ref: VersionRef, scores: MatchScores | undefined): RecalledRef {
  return {
    itemID: ref.itemID,
    version: ref.version,
    ...(scores?.score === undefined ? {} : { score: scores.score }),
    ...(scores?.similarity === undefined ? {} : { similarity: scores.similarity }),
  };
}

function pickNext(candidates: Candidates, cut: Cut): string | null {
  const last = cut.kept.at(-1);

  if (cut.dropped.length === 0 || last === undefined || candidates.sequences === undefined) {
    return candidates.next;
  }

  const sequence = candidates.sequences.get(last.itemID);

  return sequence === undefined ? candidates.next : String(sequence);
}
