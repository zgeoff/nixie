import type { TestMemory, TestMemoryOptions } from './start-test-memory';
import { startTestStore } from './start-test-store';

// Stops the writer and starts the next writer and store on the same data directory, as nixie does
// when it restarts after a crash. The earlier store's index stays until the test finishes, as a
// dead process's memory would.
export async function startNextTestMemory(
  memory: TestMemory,
  options: TestMemoryOptions = {},
): Promise<TestMemory> {
  await memory.writer.stop();

  const started = await startTestStore(memory, options);

  return { ...memory, ...started };
}
