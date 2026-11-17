import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { ModelWriteStore } from '../gate/gate-context';
import type { ItemIDStore } from '../types';
import { readItemIDs } from '../utils/item/read-item-ids';
import { buildWriteCaller } from '../write/build-write-caller';
import { runWriteCall } from '../write/run-write-call';

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
      'leaves a notice. It needs no review and no allow rule, because the item stays in memory ' +
      'and memory.recall still finds it; a rule on the tool name memory.unpin can still ask or ' +
      'deny it. The owner can pin it again.',
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
