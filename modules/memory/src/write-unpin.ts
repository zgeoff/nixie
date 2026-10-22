import type { UnpinRequest, WriteOutcome } from './gate-types';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { NotPinnedError } from './not-pinned-error';
import type { MemoryTables, StoreParts } from './types';
import { writePin } from './write-pin';

export async function writeUnpin(parts: StoreParts, request: UnpinRequest): Promise<WriteOutcome> {
  const item = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['state', 'version', 'is_pinned'])
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

  return { status: 'applied', itemID: request.itemID, version: item.version };
}
