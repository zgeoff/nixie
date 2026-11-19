import type { z } from 'zod';
import type { controlRoutes } from './harness/control-routes';

type ListedTask = z.output<typeof controlRoutes.tasks.output>['tasks'][number];

interface ExpectedTask {
  readonly name: string;
  readonly state: string;
  readonly record: string;
}

// Each state a control gives a task writes its own record on the task's thread, so the last record
// tells whether the event log agrees with the state.
export function pickTaskRefusal(
  tasks: readonly ListedTask[],
  expected: ExpectedTask,
): string | null {
  const named = tasks.filter((task) => task.name === expected.name);
  const [task] = named;

  if (task === undefined || named.length !== 1) {
    return `tasks named ${expected.name}: ${named.length}, not 1`;
  }

  const last = task.records.at(-1) ?? 'no record';

  if (task.state !== expected.state) {
    return `the task ${expected.name} is ${task.state}, not ${expected.state}`;
  }

  if (last !== expected.record) {
    return `the last record of the task ${expected.name} is ${last}, not ${expected.record}`;
  }

  return null;
}
