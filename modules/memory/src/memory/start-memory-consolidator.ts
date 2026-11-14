import type { RunStep } from '@heynixie/tasks';
import { createSystemTask, writeInboxRecords } from '@heynixie/tasks';
import type { ConsolidatorParts } from '../consolidator/consolidator-parts';
import { runConsolidatorStep } from '../consolidator/run-consolidator-step';
import { memoryConsolidatorTaskID } from '../utils/memory-consolidator-task-id';

export interface MemoryConsolidator {
  readonly runStep: RunStep;
}

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
