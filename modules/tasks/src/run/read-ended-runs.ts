import { sql } from 'kysely';
import type { TasksContext, TasksTables } from '../types';
import type { RunEndCause } from './run-end-cause';
import { toTaskRun } from './to-task-run';
import type { TaskRun } from './types';

interface EndedRunsQuery {
  readonly definitionID?: string;
  readonly taskID?: string;

  // keeps the runs that ended with one of these causes; unknown matches any stored cause that
  // lies outside the known ones
  readonly causes?: readonly RunEndCause[];

  // keeps the runs that ended at or after this time, in epoch milliseconds
  readonly sinceMs?: number;

  // keeps the runs of a started task, of a definition's task and of a definition whose target is
  // the conversation, and leaves out the rest
  readonly isListedOnly?: boolean;

  // pages by the sequence of the end, newest first
  readonly beforeSequence?: number;
  readonly limit: number;
}

const knownCauses: readonly RunEndCause[] = [
  'reported',
  'limit',
  'stopped',
  'closed',
  'failed',
  'no_work',
  'no_report',
];

export async function readEndedRuns(
  context: Pick<TasksContext, 'log'>,
  query: EndedRunsQuery,
): Promise<readonly TaskRun[]> {
  const definitionID = query.definitionID;
  const taskID = query.taskID;
  const beforeSequence = query.beforeSequence;
  const causes = query.causes;
  const sinceMs = query.sinceMs;

  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('task_runs')
    .selectAll()
    .where('ended_sequence', 'is not', null)
    .$if(definitionID !== undefined, (builder) =>
      builder.where('definition_id', '=', definitionID ?? ''),
    )
    .$if(taskID !== undefined, (builder) => builder.where('task_id', '=', taskID ?? ''))
    .$if(beforeSequence !== undefined, (builder) =>
      builder.where('ended_sequence', '<', beforeSequence ?? 0),
    )
    .$if(sinceMs !== undefined, (builder) => builder.where('ended_at', '>=', sinceMs ?? 0))
    .$if(causes !== undefined, (builder) =>
      builder.where((expression) => {
        const stored = sql`json_extract(ended, '$.cause')`;
        const named = (causes ?? []).filter((cause) => cause !== 'unknown');
        const alternatives = [];

        if (named.length > 0) {
          alternatives.push(expression(stored, 'in', named));
        }

        if (causes?.includes('unknown') === true) {
          alternatives.push(expression(stored, 'not in', knownCauses));
        }

        return expression.or(alternatives);
      }),
    )
    .$if(query.isListedOnly === true, (builder) =>
      builder.where((expression) =>
        expression.or([
          expression('definition_id', 'is not', null),
          expression(
            'task_id',
            'in',
            expression.selectFrom('tasks').select('task_id').where('started_by', 'is not', null),
          ),
        ]),
      ),
    )
    .orderBy('ended_sequence', 'desc')
    .limit(query.limit)
    .execute();

  return rows.map((row) => toTaskRun(row));
}
