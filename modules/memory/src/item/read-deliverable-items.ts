import type { Kysely } from 'kysely';
import { toReviewReason } from '../gate/to-review-reason';
import { findImageSource } from '../image/find-image-source';
import { isBridgeVersion, readBridgeMarks } from '../item-key/read-bridge-marks';
import { readItemKeys } from '../item-key/read-item-keys';
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
import type { VersionValue } from '../version/read-version-values';
import { readVersionValues } from '../version/read-version-values';

export interface DeliverableQuery {
  readonly itemIDs: readonly string[];
  readonly states: readonly MemoryState[];
  readonly includeHistory: boolean;

  // Only a recall and per-turn retrieval show how many notes dispute or supersede an item, so the
  // pinned core and the index never gain the counts.
  readonly includeLinkCounts?: boolean;

  readonly db?: Kysely<unknown>;
}

// The caller must hold the delivery lock, so no forget runs between this check and the delivery.
export async function readDeliverableItems(
  parts: StoreParts,
  query: DeliverableQuery,
): Promise<readonly RecalledItem[]> {
  if (query.itemIDs.length === 0) {
    return [];
  }

  const db = query.db ?? parts.context.log.writer.db;
  const now = parts.context.gate.clock.now();

  const storedStates: readonly MemoryState[] = query.states.includes('retired')
    ? [...query.states, 'active']
    : query.states;

  const stored = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .selectAll()
    .where('item_id', 'in', query.itemIDs)
    .where('state', 'in', storedStates)
    .execute();

  const rows = stored
    .map((row) => toDeliveredRow(row, now))
    .filter((row) => query.states.includes(row.state));

  const byID = new Map(rows.map((row) => [row.item_id, row]));

  const items = await Promise.all(
    query.itemIDs.map((itemID) => {
      const row = byID.get(itemID);

      return row === undefined
        ? Promise.resolve(null)
        : readItem(parts, db, { row, includeHistory: query.includeHistory, labels: parts.labels });
    }),
  );

  const delivered = items.filter((item) => item !== null);

  return query.includeLinkCounts === true ? addLinkCounts(parts, delivered) : delivered;
}

function toDeliveredRow(row: MemoryItemRow, now: number): MemoryItemRow {
  return isItemLapsed(row, now) ? { ...row, state: 'retired', is_pinned: 0 } : row;
}

interface ItemToRead {
  readonly row: MemoryItemRow;
  readonly includeHistory: boolean;

  readonly labels: LabelEntries;
}

async function readItem(
  parts: StoreParts,
  db: Kysely<unknown>,
  item: ItemToRead,
): Promise<RecalledItem | null> {
  const versions = await db
    .$extendTables<MemoryTables>()
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

  const values = await readVersionValues(parts.context.log, db, versions);
  const marks = await readBridgeMarks(db, [item.row.item_id]);

  try {
    const readable = versions.flatMap((version, index) => {
      const value = values[index];

      return value?.status === 'readable'
        ? [readVersion(version, value, isBridgeVersion(marks, version.item_id, version.version))]
        : [];
    });

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
        ? { history: readable, labelHistory: await readLabelHistory(parts, db, item) }
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

function readVersion(
  row: ApprovableVersionRow,
  value: Extract<VersionValue, { status: 'readable' }>,
  isBridge: boolean,
): RecalledVersion {
  const text = value.text;

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
    isBridge,
  };
}

function toApprovedProposal(row: ApprovableVersionRow): ApprovedProposal | null {
  return row.proposal_operation === null || row.review_reason === null
    ? null
    : { operation: row.proposal_operation, reason: toReviewReason(row.review_reason) };
}

async function readLabelHistory(
  parts: StoreParts,
  db: Kysely<unknown>,
  item: ItemToRead,
): Promise<readonly LabelRevision[]> {
  const rows = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_labels')
    .select(['revision', 'sealed', 'sequence'])
    .where('item_id', '=', item.row.item_id)
    .orderBy('sequence')
    .execute();

  const keys = await readItemKeys(
    parts.context.log,
    rows.map((row) => ({ value: 'labels', itemID: item.row.item_id, sequence: row.sequence })),
    db,
  );

  const revisions = await Promise.all(
    rows.map(async (row, index): Promise<LabelRevision | null> => {
      const key = keys[index];

      if (key?.status !== 'readable') {
        return null;
      }

      const labels = await itemLabelsCodec.decode(
        key.key,
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

  return revisions.filter((revision) => revision !== null);
}

// A count above 0 only, so an item no note argues with shows no field.
async function addLinkCounts(
  parts: StoreParts,
  items: readonly RecalledItem[],
): Promise<readonly RecalledItem[]> {
  const linkCounts = parts.context.linkCounts;

  if (linkCounts === undefined || items.length === 0) {
    return items;
  }

  const counts = await linkCounts.readCounts(items.map((item) => item.itemID));

  return items.map((item) => {
    const count = counts.get(item.itemID);

    return {
      ...item,
      ...(count === undefined || count.disputedBy === 0 ? {} : { disputedBy: count.disputedBy }),
      ...(count === undefined || count.supersededBy === 0
        ? {}
        : { supersededBy: count.supersededBy }),
    };
  });
}
