import { readRecordKeys } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { toReviewReason } from '../gate/to-review-reason';
import { findImageSource } from '../image/find-image-source';
import { buildDerivedLabels } from '../label/build-derived-labels';
import { itemLabelsCodec } from '../label/item-labels-codec';
import type { LabelEntries } from '../label/make-label-entries';
import type {
  LabelRevision,
  MemoryItemRow,
  MemoryState,
  MemoryTables,
  MemoryVersionRow,
  ProposalOperationKind,
  RecalledItem,
  RecalledVersion,
  StoreParts,
} from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import { getItemShortID } from '../utils/item/get-item-short-id';
import { isItemLapsed } from '../utils/item/is-item-lapsed';
import { parseChecks } from '../utils/parse-checks';
import type { ApprovedProposal } from '../version/build-version-approval';
import { buildVersionApproval } from '../version/build-version-approval';
import { decodeVersionText } from '../version/decode-version-text';

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
        : readItem(db, { row, key, includeHistory: query.includeHistory, labels: parts.labels });
    }),
  );

  return items.filter((item) => item !== null);
}

function toDeliveredRow(row: MemoryItemRow, now: number): MemoryItemRow {
  return isItemLapsed(row, now) ? { ...row, state: 'retired', is_pinned: 0 } : row;
}

interface ItemToRead {
  readonly row: MemoryItemRow;
  readonly key: CryptoKey;
  readonly includeHistory: boolean;

  readonly labels: LabelEntries;

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

    const subject = getRowSubject(item.row);
    const labels = item.labels.find(item.row.item_id) ?? buildDerivedLabels(current.text, subject);

    return {
      itemID: item.row.item_id,
      shortID: getItemShortID(item.row),
      isPinned: item.row.is_pinned === 1,
      subject,
      revision: item.row.version + item.row.label_edits,
      gist: labels.gist,
      topic: labels.topic,
      triggers: [...labels.triggers],
      ...current,
      ...(item.row.state === 'retired' ? { state: 'retired' as const } : {}),
      ...(item.includeHistory
        ? { history: readable, labelHistory: await readLabelHistory(db, item) }
        : {}),
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
    image: row.checks === null ? null : findImageSource(parseChecks(row.checks)),
    model: row.model,
    approval: buildVersionApproval(toApprovedProposal(row)),
  };
}

function toApprovedProposal(row: ApprovableVersionRow): ApprovedProposal | null {
  return row.proposal_operation === null || row.review_reason === null
    ? null
    : { operation: row.proposal_operation, reason: toReviewReason(row.review_reason) };
}

async function readLabelHistory(
  db: Kysely<MemoryTables>,
  item: ItemToRead,
): Promise<readonly LabelRevision[]> {
  const rows = await db
    .selectFrom('memory_labels')
    .select(['revision', 'sealed'])
    .where('item_id', '=', item.row.item_id)
    .orderBy('sequence')
    .execute();

  return Promise.all(
    rows.map(async (row) => {
      const labels = await itemLabelsCodec.decode(
        item.key,
        { itemID: item.row.item_id, revision: row.revision },
        row.sealed,
      );

      return {
        revision: row.revision,
        gist: labels.gist,
        topic: labels.topic,
        triggers: labels.triggers,
      };
    }),
  );
}
