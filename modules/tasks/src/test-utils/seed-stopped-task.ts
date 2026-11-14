import { writeTaskControl } from '../task/write-task-control';
import type { TasksContext } from '../types';
import type { StartedTaskSeed } from './seed-task';
import { seedTask } from './seed-task';

export async function seedStoppedTask(
  context: TasksContext,
  input: StartedTaskSeed,
): Promise<string> {
  const taskID = await seedTask(context, input);

  await writeTaskControl(context, { taskID, control: 'stop' });

  return taskID;
}
