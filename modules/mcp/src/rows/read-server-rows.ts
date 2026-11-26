import type { Kysely, Transaction } from 'kysely';
import type { McpServerRow, McpTables } from './mcp-tables';

type Reader = Kysely<unknown> | Transaction<unknown>;

// Every server the log has held, removed ones included, in the order of their IDs.
export function readServerRows(db: Reader): Promise<McpServerRow[]> {
  return db
    .$extendTables<McpTables>()
    .selectFrom('mcp_servers')
    .selectAll()
    .orderBy('server_id')
    .execute();
}

export async function readServerRow(db: Reader, serverID: string): Promise<McpServerRow | null> {
  const row = await db
    .$extendTables<McpTables>()
    .selectFrom('mcp_servers')
    .selectAll()
    .where('server_id', '=', serverID)
    .executeTakeFirst();

  return row ?? null;
}
