import type { Kysely, Transaction } from 'kysely';
import type { McpTables, McpToolRow } from './mcp-tables';

type Reader = Kysely<unknown> | Transaction<unknown>;

// Every tool a listing of the server has held, in the order of their names. Without a server ID,
// every tool of every server.
export function readToolRows(db: Reader, serverID?: string): Promise<McpToolRow[]> {
  const tables = db.$extendTables<McpTables>().selectFrom('mcp_tools').selectAll();
  const scoped = serverID === undefined ? tables : tables.where('server_id', '=', serverID);

  return scoped.orderBy('tool').execute();
}

export async function readToolRow(db: Reader, tool: string): Promise<McpToolRow | null> {
  const row = await db
    .$extendTables<McpTables>()
    .selectFrom('mcp_tools')
    .selectAll()
    .where('tool', '=', tool)
    .executeTakeFirst();

  return row ?? null;
}
