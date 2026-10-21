import { buildShortIDFromUUID } from '@heynixie/db';
import { readRecordKeys, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { ConsolidationChangeClosedError } from './consolidation-change-closed-error';
import { ConsolidationChangeNotFoundError } from './consolidation-change-not-found-error';
import type {
  ChangeCommentRequest,
  ConsolidationChangeRow,
  ConsolidationTables,
} from './consolidation-types';
import { encodeChangeComment } from './encode-change-comment';
import { memoryConsolidatorTaskID } from './memory-consolidator-task-id';
import type { StoreParts } from './types';

export async function writeChangeComment(
  parts: StoreParts,
  request: ChangeCommentRequest,
): Promise<string> {
  const row = await requireOpenChange(
    parts.context.log.writer.db.$extendTables<ConsolidationTables>(),
    request.changeID,
    parts.context.gate.clock.now(),
  );

  const keys = await readRecordKeys(parts.context.log, [row.item_id]);

  const key = keys.get(row.item_id);

  if (key === null || key === undefined) {
    throw new ConsolidationChangeClosedError(request.changeID, 'forgotten');
  }

  const sealed = await encodeChangeComment(key, row.change_id, request.text);

  await withWriteTransaction(parts.context.log.writer, async (tx) => {
    await requireOpenChange(
      tx.$extendTables<ConsolidationTables>(),
      request.changeID,
      parts.context.gate.clock.now(),
    );

    await writeRecordsInTransaction(tx, parts.context.log, [
      {
        kind: 'memory.consolidation_commented',
        definitions: parts.context.definitions(),
        thread: memoryConsolidatorTaskID,
        payload: { changeID: row.change_id, runID: request.runID, sealed },
      },
    ]);
  });

  return row.short_id ?? buildShortIDFromUUID(row.change_id);
}

async function requireOpenChange(
  db: Kysely<ConsolidationTables>,
  changeID: string,
  now: number,
): Promise<ConsolidationChangeRow> {
  const row = await readChange(db, changeID);

  if (row === undefined) {
    throw new ConsolidationChangeNotFoundError(changeID);
  }

  if (row.status !== 'pending') {
    throw new ConsolidationChangeClosedError(changeID, row.status);
  }

  if (row.lapse_at <= now) {
    throw new ConsolidationChangeClosedError(changeID, 'lapsed');
  }

  return row;
}

// A build without the short_id column leaves it null, and the read path shows the derived short ID
// for such a change, so the lookup matches the derived ID too.
async function readChange(
  db: Kysely<ConsolidationTables>,
  changeID: string,
): Promise<ConsolidationChangeRow | undefined> {
  const row = await db
    .selectFrom('memory_consolidation_changes')
    .selectAll()
    .where((eb) => eb.or([eb('short_id', '=', changeID), eb('change_id', '=', changeID)]))
    .executeTakeFirst();

  if (row !== undefined) {
    return row;
  }

  const unaliased = await db
    .selectFrom('memory_consolidation_changes')
    .selectAll()
    .where('short_id', 'is', null)
    .where('status', '=', 'pending')
    .execute();

  return unaliased.find((change) => buildShortIDFromUUID(change.change_id) === changeID);
}
