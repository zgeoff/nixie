import type { Definitions, Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import type { KeptSession } from './read-kept-sessions';
import type { APITables } from './types';

interface KeptSessions {
  readonly sessions: readonly KeptSession[];
  readonly definitions: Definitions;
}

export async function writeKeptSessions(
  tx: Transaction<unknown>,
  log: Log,
  kept: KeptSessions,
): Promise<void> {
  const db = tx.$extendTables<APITables>();
  const keptIDs = kept.sessions.map((session) => session.identityID);

  await db
    .deleteFrom('identities')
    .$if(keptIDs.length > 0, (query) => query.where('identity_id', 'not in', keptIDs))
    .execute();

  const records = await writeRecordsInTransaction(
    tx,
    log,
    kept.sessions.map((session) => ({
      kind: 'session_kept',
      definitions: kept.definitions,
      payload: {
        sessionID: session.identityID,
        channel: session.channel,
        pairedAt: session.pairedAt,
      },
      erasable: { label: session.label },
    })),
  );

  for (const [index, session] of kept.sessions.entries()) {
    const record = records[index];

    invariant(record);

    await db
      .updateTable('identities')
      .set({ paired_sequence: record.sequence })
      .where('identity_id', '=', session.identityID)
      .execute();
  }
}
