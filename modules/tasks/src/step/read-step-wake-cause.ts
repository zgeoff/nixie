import { readRecords } from '@heynixie/log';
import type { TasksContext, WakeCause } from '../types';
import { taskStepStartedCodec } from './task-step-started-codec';

// What woke the task's latest step that began before the given record, or null when no such step
// recorded a cause.
export async function readStepWakeCause(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  beforeSequence: number,
): Promise<WakeCause | null> {
  const [started] = await readRecords(context.log, {
    afterSequence: 0,
    beforeSequence,
    thread: taskID,
    kinds: ['task.step_started'],
    order: 'newest',
    limit: 1,
  });

  return started === undefined
    ? null
    : (taskStepStartedCodec.decode(started.record.payload).cause ?? null);
}
