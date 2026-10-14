import type { Clock } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';
import { buildEditTool } from './build-edit-tool';
import type { PendingToolStore } from './build-pending-tool';
import { buildPendingTool } from './build-pending-tool';
import { buildRecallTool } from './build-recall-tool';
import { buildRememberTool } from './build-remember-tool';
import { buildRetireTool } from './build-retire-tool';
import type { ModelWriteStore } from './gate-types';
import type { StartedMemoryStore } from './start-memory-store';
import type { ItemIDStore } from './types';

// What the model's tools reach: recall, the pending proposals, and the gated write paths.
export type MemoryToolStore = Pick<StartedMemoryStore, 'recall'> &
  PendingToolStore &
  ModelWriteStore &
  ItemIDStore;

// Builds the model's memory tools. recall and pending declare read, and the 3 write tools declare
// note. Every write runs through its gate, which sets the provenance from the run and the checks,
// never from the model's arguments. pending measures each proposal's age on the clock.
export function buildMemoryTools(
  memory: MemoryToolStore,
  clock: Pick<Clock, 'now'>,
): readonly ToolDefinition[] {
  return [
    buildRecallTool(memory),
    buildPendingTool(memory, clock),
    buildRememberTool(memory),
    buildEditTool(memory),
    buildRetireTool(memory),
  ];
}
