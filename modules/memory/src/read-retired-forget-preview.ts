import type { Log } from '@heynixie/log';
import { readEvidenceSequences } from './read-evidence-sequences';
import { readViewItems } from './read-view-items';
import type { MemoryTables } from './types';
import type { ForgetLoss, RetiredForgetPreview, ViewItem } from './view-types';

const previewLimit = 100;

export async function readRetiredForgetPreview(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): Promise<RetiredForgetPreview> {
  const db = log.writer.db.$extendTables<MemoryTables>();

  const rows = await db
    .selectFrom('memory_items')
    .select('item_id')
    .where('state', '=', 'retired')
    .orderBy('created_sequence')
    .limit(previewLimit + 1)
    .execute();

  const itemIDs = rows.slice(0, previewLimit).map((row) => row.item_id);

  const [items, proposals, evidence] = await Promise.all([
    readViewItems(log, itemIDs),
    itemIDs.length === 0
      ? []
      : db
          .selectFrom('memory_proposals')
          .select((eb) => ['item_id', eb.fn.countAll<number>().as('count')])
          .where('item_id', 'in', itemIDs)
          .groupBy('item_id')
          .execute(),
    Promise.all(itemIDs.map((itemID) => readEvidenceSequences(db, itemID))),
  ]);

  const proposalCounts = new Map(proposals.map((row) => [row.item_id, row.count]));
  const evidenceCounts = new Map(itemIDs.map((itemID, index) => [itemID, evidence[index]]));

  return {
    items: items.map((item) =>
      toPreviewItem(item, {
        evidenceMessages: evidenceCounts.get(item.itemID)?.length ?? 0,
        proposals: proposalCounts.get(item.itemID) ?? 0,
      }),
    ),
    hasMore: rows.length > previewLimit,
  };
}

function toPreviewItem(item: ViewItem, lost: ForgetLoss): RetiredForgetPreview['items'][number] {
  return { ...item, lost };
}
