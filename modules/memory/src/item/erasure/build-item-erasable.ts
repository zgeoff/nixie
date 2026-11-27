import type { Erasable, ErasureStart, WriteTransaction } from '@heynixie/log';
import { ErasureRefusedError } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import type { Kysely } from 'kysely';
import { readOrphanFoldOrderKeyIDs } from '../../fold/read-orphan-fold-order-key-ids';
import { readForgetFloor } from '../../forget/read-forget-floor';
import { readRetopicCardKeyIDs } from '../../retopic/read-retopic-card-key-ids';
import type { ItemErasureRequest, MemoryTables, StoreParts } from '../../types';
import { requireItem } from '../../utils/item/require-item';
import { readLegacyOpenItemForgets } from './read-legacy-open-item-forgets';

// The memory item's runner methods. A forget captures every key of the item's family, of the retopic
// cards that name it and of the fold orders that only it keeps alive. It takes the item out of
// search, labels, vectors and triggers, and has no child.
export function buildItemErasable(parts: StoreParts): Erasable<ItemErasureRequest> {
  const hide = async (itemID: string) => {
    await parts.index.remove(itemID);

    parts.labels.remove(itemID);
    parts.vectors?.remove(itemID);

    await parts.triggers.remove(itemID);
  };

  return {
    start: (tx, request) => startItemErasure(parts, tx, request),
    hide: (target) => hide(target.targetID),
    readChildren: () => Promise.resolve([]),
    toRequest: (target) => ({
      itemID: target.targetID,
      revision: null,
      states: ['active', 'retired'],
    }),
    cleanIndexes: (target) => hide(target.targetID),
    readLegacyOpen: () => readLegacyOpenItemForgets(parts.context),
  };
}

async function startItemErasure(
  parts: StoreParts,
  tx: WriteTransaction,
  request: ItemErasureRequest,
): Promise<ErasureStart> {
  const db = tx.$extendTables<MemoryTables>();

  const item =
    request.isResuming === true
      ? await readForgettingItem(db, request.itemID)
      : await requireItem(db, {
          target: { itemID: request.itemID, version: await readRevision(db, request) },
          operation: 'forget',
          states: request.states,
        });

  if (item === undefined) {
    throw new ErasureRefusedError('not_found');
  }

  const log = { ...parts.context.log, writer: { ...parts.context.log.writer, db: tx } };

  return {
    target: { kind: 'memory_item', targetID: item.item_id, version: item.version },
    shortID: item.short_id,
    capture: {
      keys: { family: item.item_id },

      // the retopic cards that name the item, and the fold orders that keep the name of a topic
      // that the item holds last
      cleanupKeys: [
        ...(await readRetopicCardKeyIDs(log, item.item_id)),
        ...(await readOrphanFoldOrderKeyIDs(
          { context: { ...parts.context, log }, labels: parts.labels },
          item.item_id,
        )),
      ],
      sandboxCallIDs: [],
      purges: [],
      sessionCause: { itemID: item.item_id },

      // an item's text can sit in the conversation's requests, and in those of each cleaned session
      turnInputs: {
        threads: [conversationTaskID],
        cleaned: true,
        floor: await readForgetFloor(log, { itemID: item.item_id }),
      },
    },
  };
}

function readForgettingItem(db: Kysely<MemoryTables>, itemID: string) {
  return db
    .selectFrom('memory_items')
    .selectAll()
    .where('item_id', '=', itemID)
    .where('state', '=', 'forgetting')
    .executeTakeFirst();
}

// The revision the caller saw, or the item's current one for a forget that takes the item as it
// stands.
async function readRevision(db: Kysely<MemoryTables>, request: ItemErasureRequest) {
  if (request.revision !== null) {
    return request.revision;
  }

  const row = await db
    .selectFrom('memory_items')
    .select(['version', 'label_edits'])
    .where('item_id', '=', request.itemID)
    .executeTakeFirst();

  return row === undefined ? 0 : row.version + row.label_edits;
}
