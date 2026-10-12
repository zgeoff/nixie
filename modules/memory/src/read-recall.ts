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
    const items =
      request.excludePinned === true ? deliverable.filter((item) => !item.isPinned) : deliverable;

    if (NIXIE_TEST_BUILD) {
      await waitAtFaultPoint('memory.recall.checked', { kind: 'memory', id: null });
    }
    await writeRecallRecord(parts, request, items);
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
}

async function findCandidates(parts: StoreParts, query: CandidateQuery): Promise<Candidates> {
  const request = query.request;

  if (request.query !== undefined) {
    return findQueryCandidates(parts, { ...query, request: { ...request, query: request.query } });
  }
  if (request.itemIDs !== undefined) {
    return { itemIDs: [...new Set(request.itemIDs)].slice(0, query.limit), next: null };
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

// The ranking leaves pinned items out before the limit applies, so pinned matches never crowd out
// the unpinned ones. The delivery drops an item pinned after the ranking.
async function findQueryCandidates(parts: StoreParts, query: QueryCandidates): Promise<Candidates> {
  const pinned = query.request.excludePinned === true ? await readPinnedItemIDs(parts) : [];
  const itemIDs = await parts.index.findItemIDs(query.request.query, {
    limit: query.limit,
    excludedIDs: pinned,
    ...(query.request.minScore === undefined ? {} : { minScore: query.request.minScore }),
  });

  return { itemIDs, next: null };
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

// The record holds references and no text, so a later forget leaves no readable copy of what the
// recall delivered.
async function writeRecallRecord(
  parts: StoreParts,
  request: RecallRequest,
  items: readonly RecalledItem[],
): Promise<void> {
  const log = parts.context.log;

  await withWriteTransaction(log.writer, (tx) =>
    writeRecordsInTransaction(tx, log, [
      {
        kind: 'memory.recalled',
        definitions: parts.context.definitions(),
        ...(request.thread === undefined ? {} : { thread: request.thread }),
        payload: {
          items: items.flatMap((item) =>
            (item.history ?? [item]).map((version) => ({
              itemID: item.itemID,
              version: version.version,
            })),
          ),
        },
      },
    ]),
  );
}
