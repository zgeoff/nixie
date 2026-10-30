import type { APIContext, APITables } from './types';

export async function readHeadSequence(context: Pick<APIContext, 'log'>): Promise<number> {
  const head = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select((expressionBuilder) =>
      expressionBuilder.fn
        .coalesce(expressionBuilder.fn.max('sequence'), expressionBuilder.lit(0))
        .as('sequence'),
    )
    .executeTakeFirstOrThrow();

  return head.sequence;
}
