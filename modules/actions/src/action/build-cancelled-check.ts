import type { ExpressionBuilder, ExpressionWrapper, SqlBool } from 'kysely';
import { sql } from 'kysely';

// A stop cancels an action that has not started an attempt by setting the stop's sequence on it, and
// the status stays as it was, because the release before reads the status check unchanged.
export function buildCancelledCheck<Tables, Table extends keyof Tables>(
  eb: ExpressionBuilder<Tables, Table>,
): ExpressionWrapper<Tables, Table, SqlBool> {
  return eb(sql.ref('actions.cancelled_sequence'), 'is not', null);
}
