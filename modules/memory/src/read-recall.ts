import { findRecordKeys, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { waitAtFaultPoint } from '@heynixie/tasks';
import type { Kysely } from 'kysely';
import { decodeVersionText } from './decode-version-text';
import type {
  MemoryItemRow,
  MemoryState,
  MemoryTables,
  MemoryVersionRow,
  RecallRequest,
  RecallResult,
  RecalledItem,
  RecalledVersion,
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
    const items = await readDeliverable(parts, {
      itemIDs: candidates.itemIDs,
      states,
      includeHistory: request.includeHistory === true,
    });

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
    return { itemIDs: await parts.index.findItemIDs(request.query, query.limit), next: null };
  }
  if (request.itemIDs !== undefined) {
    return { itemIDs: [...new Set(request.itemIDs)].slice(0, query.limit), next: null };
  }
  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'created_sequence'])
    .where('state', 'in', query.states)
    .where('created_sequence', '>', Number(request.after ?? 0))
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

interface DeliverableQuery {
  readonly itemIDs: readonly string[];
  readonly states: readonly MemoryState[];
  readonly includeHistory: boolean;
}

async function readDeliverable(
  parts: StoreParts,
  query: DeliverableQuery,
): Promise<readonly RecalledItem[]> {
  if (query.itemIDs.length === 0) {
    return [];
  }
  const db = parts.context.log.writer.db.$extendTables<MemoryTables>();
  const rows = await db
    .selectFrom('memory_items')
    .selectAll()
    .where('item_id', 'in', query.itemIDs)
    .where('state', 'in', query.states)
    .execute();
  const keys = await findRecordKeys(
    parts.context.log,
    rows.map((row) => row.item_id),
  );
  const byID = new Map(rows.map((row) => [row.item_id, row]));
  const items = await Promise.all(
    query.itemIDs.map((itemID) => {
      const row = byID.get(itemID);
      const key = keys.get(itemID);

      return row === undefined || key === undefined || key === null
        ? Promise.resolve(null)
        : readItem(db, { row, key, includeHistory: query.includeHistory });
    }),
  );

  return items.filter((item) => item !== null);
}

interface ItemToRead {
  readonly row: MemoryItemRow;
  readonly key: CryptoKey;
  readonly includeHistory: boolean;
}

// an item whose text fails to decrypt is left out, never delivered as a gap
async function readItem(db: Kysely<MemoryTables>, item: ItemToRead): Promise<RecalledItem | null> {
  const versions = await db
    .selectFrom('memory_versions')
    .selectAll()
    .where('item_id', '=', item.row.item_id)
    .$if(!item.includeHistory, (query) => query.where('version', '=', item.row.version))
    .orderBy('version')
    .execute();

  try {
    const readable = await Promise.all(versions.map((version) => readVersion(item.key, version)));
    const current = readable.find((version) => version.version === item.row.version);

    if (current === undefined) {
      return null;
    }
    return {
      itemID: item.row.item_id,
      isPinned: item.row.is_pinned === 1,
      ...current,
      ...(item.includeHistory ? { history: readable } : {}),
    };
  } catch {
    return null;
  }
}

async function readVersion(key: CryptoKey, row: MemoryVersionRow): Promise<RecalledVersion> {
  const text = await decodeVersionText(
    key,
    { itemID: row.item_id, version: row.version },
    row.sealed,
  );

  return {
    version: row.version,
    change: row.change,
    state: row.state,
    origin: row.origin,
    source: row.source,
    recordedAt: row.recorded_at,
    text: text.text,
  };
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
          items: items.map((item) => ({ itemID: item.itemID, version: item.version })),
        },
      },
    ]),
  );
}
