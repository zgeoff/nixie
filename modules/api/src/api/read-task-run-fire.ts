import type { TaskRun } from '@heynixie/tasks';
import { readRunFire } from '@heynixie/tasks';
import type { APIContext } from '../types';

// The fire that opened the work of a task run, or null when no schedule fired it.
export async function readTaskRunFire(context: APIContext, run: TaskRun) {
  const found = await readRunFire(context, run);

  if (found === null) {
    return null;
  }

  return {
    scheduledFor: found.fire.scheduledFor,
    firedAt: found.fire.firedAt,
    isCatchUp: found.fire.isCatchUp,
  };
}
