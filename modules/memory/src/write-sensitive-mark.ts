import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import type { MemoryTables, SensitiveRequest, StoreParts, VersionRef } from './types';

export function writeSensitiveMark(
  parts: StoreParts,
  request: SensitiveRequest,
): Promise<VersionRef> {
  const log = parts.context.log;

  return parts.lock(() =>
    withWriteTransaction(log.writer, async (tx) => {
      await request.writeInTransaction?.(tx);

      const item = await tx
        .$extendTables<MemoryTables>()
        .selectFrom('memory_items')
        .select(['state', 'version'])
        .where('item_id', '=', request.itemID)
        .executeTakeFirst();

      if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
        throw new MemoryItemNotFoundError(request.itemID);
      }

      await writeRecordsInTransaction(tx, log, [
        {
          kind: 'memory.sensitive_marked',
          definitions: parts.context.definitions(),
          ...(request.provenance.thread === undefined ? {} : { thread: request.provenance.thread }),
          payload: { itemID: request.itemID, isSensitive: request.isSensitive },
        },
      ]);

      return { itemID: request.itemID, version: item.version };
    }),
  );
}
