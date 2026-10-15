import type { RunStep } from '@heynixie/tasks';
import { createSystemTask, writeInboxRecords } from '@heynixie/tasks';
import type { ConsolidatorParts } from './consolidator-parts';
import { memoryConsolidatorTaskID } from './memory-consolidator-task-id';
import { runConsolidatorStep } from './run-consolidator-step';

export interface MemoryConsolidator {
  readonly runStep: RunStep;
}

// Puts the memory consolidator into service as a system task, before any runner claims work, and
// wakes it, so its first step sets the timer for the next run, or runs at once on a first start.
export async function startMemoryConsolidator(
  parts: ConsolidatorParts,
): Promise<MemoryConsolidator> {
  const context = parts.context;

  await createSystemTask(context, memoryConsolidatorTaskID);

  await writeInboxRecords(context, [
    {
      kind: 'task.wake',
      definitions: context.definitions(),
      thread: memoryConsolidatorTaskID,
      payload: { at: context.clock.now() },
    },
  ]);

  return { runStep: (input) => runConsolidatorStep(parts, input) };
}
