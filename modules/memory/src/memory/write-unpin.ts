import type { UnpinRequest, WriteOutcome } from '../gate/gate-context';
import { writePin } from '../pin/write-pin';
import type { MemoryTables, StoreParts } from '../types';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { NotPinnedError } from '../utils/error/not-pinned-error';

export async function writeUnpin(parts: StoreParts, request: UnpinRequest): Promise<WriteOutcome> {
  const item = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['state', 'version', 'label_edits', 'is_pinned'])
    .where('item_id', '=', request.itemID)
    .executeTakeFirst();

  if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
    throw new MemoryItemNotFoundError(request.itemID);
  }

  if (item.is_pinned !== 1) {
    throw new NotPinnedError(request.itemID);
  }

  const caller = request.caller;

  await writePin(parts, {
    itemID: request.itemID,
    isPinned: false,
    provenance: {
      origin: caller.origin,
      source: 'untrusted',
      taskID: caller.taskID,
      proposalID: null,
      checks: null,
      thread: caller.thread,
      model: caller.model,
    },
  });

  return { status: 'applied', itemID: request.itemID, version: item.version + item.label_edits };
}
