import type { McpOverrides } from '@heynixie/policy';
import { mcpOverridesFormSchema } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DefinitionsTables } from '../types';

const formSchema = z.object({ mcp: mcpOverridesFormSchema.default({}) });

// The override files of the MCP proxy that a snapshot held, by server ID. A snapshot the database
// lacks holds none.
export async function readSnapshotMcpOverrides(
  db: Kysely<unknown>,
  snapshotHash: string,
): Promise<McpOverrides> {
  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('definition_snapshots')
    .select('form')
    .where('snapshot_hash', '=', snapshotHash)
    .executeTakeFirst();

  return row === undefined ? {} : formSchema.parse(JSON.parse(row.form)).mcp;
}
