import type { Expression, RawBuilder } from 'kysely';
import { sql } from 'kysely';
import type { TaskHoldReason } from '../types';

export const holdReasons: readonly TaskHoldReason[] = ['ended', 'spend', 'nixie', 'limit', 'task'];
const endedStates = ['done', 'stopped', 'failed', 'closed'] as const;

// One SQL check per reason, which the gate reads and every claim filter is built from. Each check
// is 1 when the hold stands and 0 when it does not. Each subquery takes an alias of its own, so the
// task ID of the calling query is never shadowed.
export function buildHoldChecks(
  taskID: Expression<unknown>,
): Readonly<Record<TaskHoldReason, RawBuilder<unknown>>> {
  return {
    ended: sql`exists (select 1 from tasks as gate_task where gate_task.task_id = ${taskID} and gate_task.state in (${sql.join(endedStates)}))`,
    spend: sql`(exists (select 1 from spend_stop) or exists (select 1 from spend_route_holds as gate_hold join spend_route_stops as gate_route on gate_route.route_id = gate_hold.route_id where gate_hold.task_id = ${taskID}))`,
    nixie: sql`(exists (select 1 from nixie_pause) and not exists (select 1 from pause_exemptions as gate_exempt where gate_exempt.task_id = ${taskID}))`,
    limit: sql`coalesce((select gate_limit.kind from records as gate_limit where gate_limit.thread = ${taskID} and gate_limit.kind in ('task.limit_reached', 'task.limits_raised') order by gate_limit.sequence desc limit 1) = 'task.limit_reached', 0)`,
    task: sql`exists (select 1 from tasks as gate_task where gate_task.task_id = ${taskID} and gate_task.state = 'paused')`,
  };
}
