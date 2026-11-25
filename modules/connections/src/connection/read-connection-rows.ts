import type { Log } from '@heynixie/log';
import type { ConnectionRow, ConnectionTables } from '../types';

// Every connection whose consent finished, forgotten ones too. A row with no fingerprint belongs to a
// consent that has not finished, and no part of nixie reads it as a connection.
export function readConnectionRows(log: Pick<Log, 'writer'>): Promise<ConnectionRow[]> {
  return log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('connections')
    .selectAll()
    .where('token_fingerprint', 'is not', null)
    .orderBy('created_at')
    .execute();
}

export async function readConnectionRowByShortID(
  log: Pick<Log, 'writer'>,
  shortID: string,
): Promise<ConnectionRow | null> {
  const row = await log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('connections')
    .selectAll()
    .where('short_id', '=', shortID)
    .where('token_fingerprint', 'is not', null)
    .executeTakeFirst();

  return row ?? null;
}

export async function readConnectionRowByID(
  log: Pick<Log, 'writer'>,
  connectionID: string,
): Promise<ConnectionRow | null> {
  const row = await log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('connections')
    .selectAll()
    .where('connection_id', '=', connectionID)
    .executeTakeFirst();

  return row ?? null;
}
