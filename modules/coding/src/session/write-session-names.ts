import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Definitions, Log } from '@heynixie/log';
import { codingSessionNamedCodec } from '../record/coding-session-named-codec';
import type { CodingTables } from '../types';

interface NamesContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
}

// Gives each session of the adapter that has no short ID one, and returns the short ID of every
// session asked for. A session keeps its short ID across listings, because the ID sits in the log.
export function writeSessionNames(
  context: NamesContext,
  adapter: string,
  sessionIDs: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const db = tx.$extendTables<CodingTables>();

    const named =
      sessionIDs.length === 0
        ? []
        : await db
            .selectFrom('coding_session_ids')
            .select(['short_id', 'session_id'])
            .where('adapter', '=', adapter)
            .where('session_id', 'in', [...sessionIDs])
            .execute();

    const names = new Map(named.map((row) => [row.session_id, row.short_id]));

    const unnamed = [...new Set(sessionIDs)].filter((sessionID) => !names.has(sessionID));
    const created = unnamed.map((sessionID) => ({ sessionID, shortID: createShortID() }));

    if (created.length > 0) {
      await writeRecordsInTransaction(
        tx,
        context.log,
        created.map((entry) => ({
          kind: codingSessionNamedCodec.kind,
          definitions: context.definitions(),
          payload: codingSessionNamedCodec.encode({
            adapter,
            sessionID: entry.sessionID,
            shortID: entry.shortID,
          }),
        })),
      );
    }

    for (const entry of created) {
      names.set(entry.sessionID, entry.shortID);
    }

    return names;
  });
}
