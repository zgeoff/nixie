import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { codeRunToolName } from './code-run-tool-name';

// The sequence of each code call on the thread. Only a code call can own a code sandbox, and a
// thread holds far more calls of other tools.
export async function readCodeRunSequences(
  db: Kysely<unknown>,
  thread: string,
): Promise<readonly number[]> {
  const rows = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('thread', '=', thread)
    .where('kind', '=', 'tool_called')
    .where(sql`json_extract(payload, '$.tool')`, '=', codeRunToolName)
    .orderBy('sequence')
    .execute();

  return rows.map((row) => row.sequence);
}
