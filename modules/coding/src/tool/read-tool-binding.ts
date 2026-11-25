import { isFinishedState } from '@heynixie/tasks';
import { readBinding } from '../session/read-binding';
import { readCodingTask } from '../step/read-coding-task';
import type { Binding, CodingAdapter, CodingContext } from '../types';

export type ToolBinding =
  | { readonly status: 'bound'; readonly binding: Binding }
  | { readonly status: 'refused'; readonly sentence: string };

// The session of the coding task that a tool names. A tool refuses a task that is no coding task,
// has no bound session, or is done, failed or closed.
export async function readToolBinding(
  context: CodingContext,
  adapter: CodingAdapter,
  taskID: string,
): Promise<ToolBinding> {
  const log = context.tasks.log;

  const task = await readCodingTask(log, adapter.id, taskID);

  if (task === null) {
    return { status: 'refused', sentence: `The task ${taskID} is no coding task.` };
  }

  if (isFinishedState(task.state)) {
    return { status: 'refused', sentence: `The task ${taskID} is ${task.state}.` };
  }

  const binding = await readBinding(log.writer.db, taskID);

  if (binding === null || binding.unboundAt !== null) {
    return {
      status: 'refused',
      sentence: `The task ${taskID} has no session yet. Try again once it starts.`,
    };
  }

  return { status: 'bound', binding };
}
