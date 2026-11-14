import type { Log } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import { decodeProposalText } from './decode-proposal-text';
import type { MomentTables } from './moment-context';
import { readPurgeSet } from './read-purge-set';
import { readViewItems } from './read-view-items';
import type { MemoryTables } from './types';

export interface RecordForgetTarget {
  readonly thread: string;
  readonly sequence: number;
}

export interface RecordForgetPreview {
  readonly momentCount: number;
  readonly memoryItems: readonly { readonly itemID: string; readonly text: string }[];
}

export async function readRecordForgetPreview(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  target: RecordForgetTarget,
): Promise<RecordForgetPreview> {
  const [momentCount, itemIDs] = await Promise.all([
    readMomentCount(log, target),
    readPurgeSet(log.writer.db, target.sequence),
  ]);

  const texts = await readPurgeTexts(log, itemIDs);

  return {
    momentCount,
    memoryItems: itemIDs.flatMap((itemID) => {
      const text = texts.get(itemID);

      return text === undefined ? [] : [{ itemID, text }];
    }),
  };
}

async function readMomentCount(
  log: Pick<Log, 'writer'>,
  target: RecordForgetTarget,
): Promise<number> {
  const row = await log.writer.db
    .$extendTables<MomentTables>()
    .selectFrom('moments')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('thread', '=', target.thread)
    .where('first_sequence', '<=', target.sequence)
    .where('last_sequence', '>=', target.sequence)
    .where('state', 'in', ['active', 'retired'])
    .executeTakeFirstOrThrow();

  return row.count;
}

async function readPurgeTexts(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  itemIDs: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const texts = new Map<string, string>();

  for (const item of await readViewItems(log, itemIDs)) {
    if (item.status === 'readable') {
      texts.set(item.itemID, item.text);
    }
  }

  const pendingIDs = itemIDs.filter((itemID) => !texts.has(itemID));

  if (pendingIDs.length === 0) {
    return texts;
  }

  const proposals = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['item_id', 'proposal_id', 'sealed'])
    .where('item_id', 'in', pendingIDs)
    .where('is_new_item', '=', 1)
    .where('status', '=', 'pending')
    .orderBy('created_sequence')
    .execute();

  const keys = await readRecordKeys(
    log,
    proposals.map((row) => row.item_id),
  );

  for (const row of proposals) {
    const key = keys.get(row.item_id);

    if (key !== null && key !== undefined && !texts.has(row.item_id)) {
      const decoded = await decodeProposalText(key, row.proposal_id, row.sealed).catch(() => null);

      if (decoded !== null) {
        texts.set(row.item_id, decoded.text);
      }
    }
  }

  return texts;
}
