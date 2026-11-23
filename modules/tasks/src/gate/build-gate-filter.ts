import type { Expression, ExpressionBuilder, ExpressionWrapper, SqlBool } from 'kysely';
import { match } from 'ts-pattern';
import type { GateCaller } from '../types';
import { buildHoldChecks, holdReasons } from './build-hold-checks';
import { pickGateRule } from './pick-gate-rule';

export interface GateFilterWork {
  // the column that holds the task's ID in the query that applies the filter
  readonly taskID: Expression<unknown>;

  // 1 when the work has started, such as an action with an attempt, else 0
  readonly isStarted: Expression<unknown>;
}

// The SQL form of isGateBarring, inverted: true for the work that the caller may claim. A claim
// query applies it so a held task at the head of the order never hides another task's work.
export function buildGateFilter<Tables, Table extends keyof Tables>(
  eb: ExpressionBuilder<Tables, Table>,
  caller: GateCaller,
  work: GateFilterWork,
): ExpressionWrapper<Tables, Table, SqlBool> {
  const checks = buildHoldChecks(work.taskID);

  const barred = holdReasons.flatMap((reason) =>
    match(pickGateRule(caller, reason))
      .with('skip', () => [eb(checks[reason], '=', 1)])
      .with('skip_unstarted', () => [
        eb.and([eb(checks[reason], '=', 1), eb(work.isStarted, '=', 0)]),
      ])
      .with('pass', () => [])
      .exhaustive(),
  );

  return eb.not(eb.or(barred));
}
