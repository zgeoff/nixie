import type { JSONObject } from '@heynixie/log';
import type { RunStep, TaskRunnerDefinition, TasksContext } from '@heynixie/tasks';
import { defineRunnerStart } from '@heynixie/tasks';
import { codingDeclarations } from '../connector/coding-declarations';
import { runRelease } from '../end/run-release';
import { buildCodingStartInput } from '../start/build-coding-start-input';
import { buildCodingStartSchema } from '../start/build-coding-start-schema';
import { codingOptionsSchema } from '../start/coding-options-schema';
import { planCodingStart } from '../start/plan-coding-start';
import { makeCodingStep } from '../step/make-coding-step';
import type { CodingAdapter, CodingContext, CodingTables } from '../types';

export interface CodingRunner {
  readonly definition: TaskRunnerDefinition;
  readonly runStep: RunStep;
}

// The runner of the adapter's coding tasks. Its key is the adapter's ID, it calls no model, and no
// meter limits its task runs.
export function buildCodingRunner(context: CodingContext, adapter: CodingAdapter): CodingRunner {
  const definition: TaskRunnerDefinition = {
    key: adapter.id,
    controls: ['pause', 'resume', 'stop', 'close'],
    start: defineRunnerStart({
      schema: buildCodingStartSchema(),
      describeInput: () => buildCodingStartInput(context.settings),
      declaration: codingDeclarations.start,
      storesBuiltOptions: false,
      plan: (start, _starter, bounds) => planCodingStart(context, adapter, start, bounds),
      encodeOptions: (options) => codingOptionsSchema.parse(options),
    }),
    fixedTasks: [],
    keepsSandboxes: false,
    meters: [],
    ended: (endContext, taskID, cause) =>
      runRelease(context, adapter, { taskID, cause, commit: endContext.commit }),
    listFields: (listContext, taskIDs) => readSessionFields(listContext, taskIDs),
  };

  return { definition, runStep: makeCodingStep(context, adapter) };
}

// The `session` field that tasks.list shows for each listed coding task that binds a session.
async function readSessionFields(
  context: Pick<TasksContext, 'log'>,
  taskIDs: readonly string[],
): Promise<ReadonlyMap<string, JSONObject>> {
  if (taskIDs.length === 0) {
    return new Map();
  }

  const rows = await context.log.writer.db
    .$extendTables<CodingTables>()
    .selectFrom('coding_sessions')
    .select(['task_id', 'origin', 'state', 'last_event_at'])
    .where('task_id', 'in', [...taskIDs])
    .execute();

  return new Map(
    rows.map((row) => [
      row.task_id,
      { session: { origin: row.origin, state: row.state, lastEventAt: row.last_event_at } },
    ]),
  );
}
