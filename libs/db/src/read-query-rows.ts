import type { QueryExecutorProvider, RawBuilder } from 'kysely';
import { z } from 'zod';

// Kysely never checks a raw query's rows against the type the query names, so each row is parsed.
export async function readQueryRows<RowSchema extends z.ZodType>(
  query: RawBuilder<unknown>,
  executor: QueryExecutorProvider,
  rowSchema: RowSchema,
): Promise<z.output<RowSchema>[]> {
  const result = await query.execute(executor);

  return z.array(rowSchema).parse(result.rows);
}
