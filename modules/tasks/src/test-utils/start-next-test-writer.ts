import { startWriter } from '@heynixie/log';
import type { TestTasks } from './start-test-tasks';

// Stops the writer and starts the next one on the same data directory, as nixie does when it
// restarts after a crash, so the new writer holds a higher epoch. The clock carries on. The new
// writer stops when the test finishes, before the directory is removed.
export async function startNextTestWriter(tasks: TestTasks): Promise<TestTasks> {
  await tasks.writer.stop();

  const writer = await startWriter({ dataDir: tasks.dataDir });

  tasks.defer(() => writer.stop());

  return {
    ...tasks,
    writer,
    context: { ...tasks.context, log: { ...tasks.context.log, writer } },
  };
}
