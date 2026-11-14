import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

export interface CapCallQuery {
  readonly thread: string;
  readonly taskRunID: string;
  readonly tool: string;
  readonly beforeSequence: number;
}

const countSchema = z.object({ count: z.number() });

// A call counts when its result is result, queued or unknown, or while it has returned none. A call
// counts only against the calls recorded before it, so two calls made together never deny each other.
export async function countCapCalls(
  tx: Transaction<unknown>,
  query: CapCallQuery,
): Promise<number> {
  const result = await sql`select count(*) as count from records as called
    where called.thread = ${query.thread}
      and called.kind = 'tool_called'
      and called.sequence < ${query.beforeSequence}
      and json_extract(called.payload, '$.taskRunID') = ${query.taskRunID}
      and json_extract(called.payload, '$.tool') = ${query.tool}
      and not exists (
        select 1 from records as returned
        where returned.thread = ${query.thread}
          and returned.kind = 'tool_result'
          and returned.parent = called.sequence
          and json_extract(returned.payload, '$.outcome') in ('invalid', 'denied', 'error', 'failed')
      )`.execute(tx);

  return countSchema.parse(result.rows[0]).count;
}
