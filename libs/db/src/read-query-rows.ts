import type { QueryExecutorProvider, RawBuilder } from 'kysely';
import { z } from 'zod';

// Runs a raw query and parses every row it returns, because the database never checks a row
// against the type a query names.
export async function readQueryRows<RowSchema extends z.ZodType>(
  query: RawBuilder<unknown>,
  executor: QueryExecutorProvider,
  rowSchema: RowSchema,
): Promise<z.output<RowSchema>[]> {
  const result = await query.execute(executor);

  return z.array(rowSchema).parse(result.rows);
}
