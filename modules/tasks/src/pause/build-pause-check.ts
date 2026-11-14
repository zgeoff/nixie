import type { ExpressionBuilder, ExpressionWrapper, SqlBool } from 'kysely';
import { sql } from 'kysely';

export function buildPauseCheck<Tables, Table extends keyof Tables>(
  eb: ExpressionBuilder<Tables, Table>,
  taskIDColumn: string,
): ExpressionWrapper<Tables, Table, SqlBool> {
  return eb.or([
    eb.not(eb.exists(sql`(select 1 from nixie_pause)`)),
    eb.exists(sql`(select 1 from pause_exemptions where task_id = ${sql.ref(taskIDColumn)})`),
  ]);
}
