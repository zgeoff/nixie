import { writeTaskControl } from '../task/write-task-control';
import type { TasksContext } from '../types';
import type { StartedTaskSeed } from './seed-task';
import { seedTask } from './seed-task';

export async function seedClosedTask(
  context: TasksContext,
  input: StartedTaskSeed,
): Promise<string> {
  const taskID = await seedTask(context, input);

  await writeTaskControl(context, { taskID, control: 'close' });

  return taskID;
}
