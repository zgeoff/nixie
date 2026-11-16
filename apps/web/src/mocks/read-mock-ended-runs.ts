import { mockViewStore } from './mock-view-store';
import { readMockTaskList } from './read-mock-task-list';

interface MockEndedRunsInput {
  readonly limit: number;
  readonly before?: number | undefined;
}

export function readMockEndedRuns(input: MockEndedRunsInput) {
  const before = input.before ?? Number.POSITIVE_INFINITY;

  const matching = mockViewStore.endedRuns
    .findMany((query) => query.where((run) => run.sequence < before))
    .toSorted((left, right) => right.sequence - left.sequence);

  const runs = structuredClone(matching.slice(0, input.limit));

  const taskIDs = new Set(runs.map((run) => run.taskID));

  const last = runs.at(-1);

  return {
    tasks: readMockTaskList().tasks.filter((task) => taskIDs.has(task.taskID)),
    runs,
    next: matching.length > input.limit && last !== undefined ? last.sequence : null,
  };
}
