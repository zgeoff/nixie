import type { Kysely } from 'kysely';

type RecordsTables = Readonly<{ records: { readonly sequence: number } }>;

// The sequence of the newest record, or 0 for an empty log.
export async function readHeadSequence(db: Kysely<unknown>): Promise<number> {
  const head = await db
    .$extendTables<RecordsTables>()
    .selectFrom('records')
    .select((expressionBuilder) =>
      expressionBuilder.fn
        .coalesce(expressionBuilder.fn.max('sequence'), expressionBuilder.lit(0))
        .as('sequence'),
    )
    .executeTakeFirstOrThrow();

  return head.sequence;
}
