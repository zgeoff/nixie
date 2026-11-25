import type { JSONObject } from '@heynixie/log';
import type { TaskRunnerDefinition } from '../runner/types';
import type { TasksContext } from '../types';

export interface ListedRunnerView {
  // the key of the runner that runs the task, or '' when none does
  readonly runner: string;
  readonly fields: JSONObject;
}

// What the runner of each task adds to the task's listing: its key, `limits: null` when the runner
// sets no meter, and the fields the runner's own `listFields` gives.
export async function readListedRunnerFields(
  context: Pick<TasksContext, 'log' | 'runners'>,
  taskIDs: readonly string[],
): Promise<ReadonlyMap<string, ListedRunnerView>> {
  const keys = new Map<string, string>();
  const definitions = new Map<string, { definition: TaskRunnerDefinition; taskIDs: string[] }>();

  for (const taskID of taskIDs) {
    const resolution = await context.runners.resolve(context, taskID);

    if (resolution.status === 'found') {
      const entry = definitions.get(resolution.definition.key) ?? {
        definition: resolution.definition,
        taskIDs: [],
      };

      entry.taskIDs.push(taskID);
      definitions.set(resolution.definition.key, entry);
      keys.set(taskID, resolution.definition.key);
    } else {
      const key = resolution.status === 'unknown' ? resolution.key : '';

      keys.set(taskID, key);
    }
  }

  const fields = new Map<string, JSONObject>();

  for (const entry of definitions.values()) {
    const read = await readEntryFields(context, entry);

    for (const taskID of entry.taskIDs) {
      fields.set(taskID, {
        ...buildLimitsField(entry.definition),
        ...read.get(taskID),
      });
    }
  }

  return new Map(
    taskIDs.map((taskID) => [
      taskID,
      { runner: keys.get(taskID) ?? '', fields: fields.get(taskID) ?? {} },
    ]),
  );
}

interface RunnerEntry {
  readonly definition: TaskRunnerDefinition;
  readonly taskIDs: readonly string[];
}

function readEntryFields(
  context: Pick<TasksContext, 'log'>,
  entry: RunnerEntry,
): Promise<ReadonlyMap<string, JSONObject>> {
  if (entry.definition.listFields === null) {
    return Promise.resolve(new Map());
  }

  return entry.definition.listFields(context, entry.taskIDs);
}

function buildLimitsField(definition: TaskRunnerDefinition): { limits?: null } {
  return definition.meters.length === 0 ? { limits: null } : {};
}
