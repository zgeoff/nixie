import type { Log } from '@heynixie/log';
import { readItemKeys } from '../item-key/read-item-keys';
import type { MemoryTables } from '../types';
import { decodeProposalText } from '../utils/decode-proposal-text';
import type { MomentTables } from '../utils/moment-context';
import { readViewItems } from '../view/read-view-items';
import { readPurgeSet } from './read-purge-set';

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
    .select(['item_id', 'proposal_id', 'sealed', 'created_sequence'])
    .where('item_id', 'in', pendingIDs)
    .where('is_new_item', '=', 1)
    .where('status', '=', 'pending')
    .orderBy('created_sequence')
    .execute();

  const keys = await readItemKeys(
    log,
    proposals.map((row) => ({
      value: 'proposal',
      itemID: row.item_id,
      sequence: row.created_sequence,
    })),
  );

  for (const [index, row] of proposals.entries()) {
    const opened = keys[index];

    if (opened?.status === 'readable' && !texts.has(row.item_id)) {
      const decoded = await decodeProposalText(opened.key, row.proposal_id, row.sealed).catch(
        () => null,
      );

      if (decoded !== null) {
        texts.set(row.item_id, decoded.text);
      }
    }
  }

  return texts;
}
