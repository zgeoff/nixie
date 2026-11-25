import type { TasksContext } from '../types';
import type { RunMeter } from './types';

// The meters that limit a task's task runs: those its runner's definition lists. A task that no
// definition runs takes every meter.
export async function readRunMeters(
  context: Pick<TasksContext, 'log' | 'runners' | 'runSettings'>,
  taskID: string,
): Promise<readonly RunMeter[]> {
  const resolution = await context.runners.resolve(context, taskID);

  if (resolution.status !== 'found') {
    return context.runSettings.meters;
  }

  const listed = resolution.definition.meters;

  return context.runSettings.meters.filter((meter) => listed.includes(meter.name));
}
