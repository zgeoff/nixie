import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import { buildWriteCaller } from './build-write-caller';
import type { ModelWriteStore } from './gate-types';
import { readItemIDs } from './read-item-ids';
import { runWriteCall } from './run-write-call';
import type { ItemIDStore } from './types';

const unpinOutput = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['applied'] },
    itemID: { type: 'string' },
    version: { type: 'integer' },
  },
  required: ['status', 'itemID', 'version'],
  additionalProperties: false,
};

export function buildUnpinTool(memory: ModelWriteStore & ItemIDStore): ToolDefinition {
  return {
    name: 'memory.unpin',
    description:
      'Takes a memory item out of the pinned core by its itemID. The unpin applies at once and ' +
      'needs no review, because the item stays in memory and memory.recall still finds it. The ' +
      'owner can pin it again.',
    input: {
      type: 'object',
      properties: { itemID: { type: 'string' } },
      required: ['itemID'],
      additionalProperties: false,
    },
    output: unpinOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { status: 'owner_data', itemID: 'owner_data', version: 'owner_data' },
    },
    execution: 'direct',
    run: (call, context) => runUnpinCall(memory, call, context),
  };
}

const unpinArguments = z.object({ itemID: z.string() });

async function runUnpinCall(
  memory: ModelWriteStore & ItemIDStore,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  const input = unpinArguments.parse(call.input);

  const [itemID = input.itemID] = await readItemIDs(memory, [input.itemID]);

  return runWriteCall(
    memory,
    () => memory.writes.unpin({ itemID, caller: buildWriteCaller(context) }),
    itemID,
  );
}
