import { readRecordKeys } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { ApprovedProposal } from './build-version-approval';
import { buildVersionApproval } from './build-version-approval';
import { decodeVersionText } from './decode-version-text';
import { getItemShortID } from './get-item-short-id';
import { getRowSubject } from './get-row-subject';
import { toReviewReason } from './to-review-reason';
import type {
  MemoryItemRow,
  MemoryState,
  MemoryTables,
  MemoryVersionRow,
  ProposalOperationKind,
  RecalledItem,
  RecalledVersion,
  StoreParts,
} from './types';

export interface DeliverableQuery {
  readonly itemIDs: readonly string[];
  readonly states: readonly MemoryState[];
  readonly includeHistory: boolean;

  readonly db?: Kysely<MemoryTables>;
}

// The caller must hold the delivery lock, so no forget runs between this check and the delivery.
export async function readDeliverableItems(
  parts: StoreParts,
  query: DeliverableQuery,
): Promise<readonly RecalledItem[]> {
  if (query.itemIDs.length === 0) {
    return [];
  }

  const db = query.db ?? parts.context.log.writer.db.$extendTables<MemoryTables>();
  const now = parts.context.gate.clock.now();

  const storedStates: readonly MemoryState[] = query.states.includes('retired')
    ? [...query.states, 'active']
    : query.states;

  const stored = await db
    .selectFrom('memory_items')
    .selectAll()
    .where('item_id', 'in', query.itemIDs)
    .where('state', 'in', storedStates)
    .execute();

  const rows = stored
    .map((row) => toDeliveredRow(row, now))
    .filter((row) => query.states.includes(row.state));

  const keys = await readRecordKeys(
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

function toDeliveredRow(row: MemoryItemRow, now: number): MemoryItemRow {
  const isLapsed = row.state === 'active' && row.until !== null && row.until <= now;

  return isLapsed ? { ...row, state: 'retired', is_pinned: 0 } : row;
}

interface ItemToRead {
  readonly row: MemoryItemRow;
  readonly key: CryptoKey;
  readonly includeHistory: boolean;

  readonly db?: Kysely<MemoryTables>;
}

async function readItem(db: Kysely<MemoryTables>, item: ItemToRead): Promise<RecalledItem | null> {
  const versions = await db
    .selectFrom('memory_versions')
    .leftJoin('memory_proposals', 'memory_proposals.proposal_id', 'memory_versions.proposal_id')
    .selectAll('memory_versions')
    .select(['memory_proposals.operation as proposal_operation', 'memory_proposals.review_reason'])
    .where('memory_versions.item_id', '=', item.row.item_id)
    .$if(!item.includeHistory, (query) =>
      query.where('memory_versions.version', '=', item.row.version),
    )
    .orderBy('memory_versions.version')
    .execute();

  try {
    const readable = await Promise.all(versions.map((version) => readVersion(item.key, version)));

    const current = readable.find((version) => version.version === item.row.version);

    if (current === undefined) {
      return null;
    }

    return {
      itemID: item.row.item_id,
      shortID: getItemShortID(item.row),
      isPinned: item.row.is_pinned === 1,
      subject: getRowSubject(item.row),
      ...current,
      ...(item.row.state === 'retired' ? { state: 'retired' as const } : {}),
      ...(item.includeHistory ? { history: readable } : {}),
    };
  } catch {
    return null;
  }
}

interface ApprovableVersionRow extends MemoryVersionRow {
  readonly proposal_operation: ProposalOperationKind | null;
  readonly review_reason: string | null;
}

async function readVersion(key: CryptoKey, row: ApprovableVersionRow): Promise<RecalledVersion> {
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
    evidenceQuote: text.evidenceQuote,
    model: row.model,
    approval: buildVersionApproval(row.proposal_id, toApprovedProposal(row)),
  };
}

function toApprovedProposal(row: ApprovableVersionRow): ApprovedProposal | null {
  return row.proposal_operation === null || row.review_reason === null
    ? null
    : { operation: row.proposal_operation, reason: toReviewReason(row.review_reason) };
}
