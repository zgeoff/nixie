import { startWriter } from '@heynixie/log';
import type { TestTasks } from './start-test-tasks';

export async function startNextTestWriter<Started extends TestTasks>(
  tasks: Started,
): Promise<Started> {
  await tasks.writer.stop();

  const writer = await startWriter({ dataDir: tasks.dataDir });

  tasks.defer(() => writer.stop());

  return {
    ...tasks,
    writer,
    context: { ...tasks.context, log: { ...tasks.context.log, writer } },
  };
}
