import { budgetPeriods, storedBudgetCountsSchema } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DefinitionBudget, DefinitionsInForce } from '../types';

const repoBudgetSchema = z.object({
  id: z.string(),
  counts: storedBudgetCountsSchema,
  limitMicros: z.number(),
  period: z.enum(budgetPeriods),
  hash: z.string(),
});

const repoBudgetsSchema = z.object({ repoBudgets: z.array(repoBudgetSchema).optional() });

type SeedRecordTables = Readonly<{
  records: { readonly sequence: number; readonly payload: string };
}>;

// The budgets that the repo held at the last accepted seed, which a raised limit may still wait on.
// A seed record from before budgets holds none.
export async function readRepoBudgets(
  db: Kysely<unknown>,
  inForce: DefinitionsInForce,
): Promise<readonly DefinitionBudget[]> {
  const record = await db
    .$extendTables<SeedRecordTables>()
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', inForce.recordSequence)
    .executeTakeFirstOrThrow();

  return repoBudgetsSchema.parse(JSON.parse(record.payload)).repoBudgets ?? [];
}
