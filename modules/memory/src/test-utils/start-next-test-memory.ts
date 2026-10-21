import type { TestMemory, TestMemoryOptions } from './start-test-memory';
import { startTestStore } from './start-test-store';

export async function startNextTestMemory(
  memory: TestMemory,
  options: TestMemoryOptions = {},
): Promise<TestMemory> {
  await memory.writer.stop();

  const started = await startTestStore(memory, options);

  return { ...memory, ...started };
}
