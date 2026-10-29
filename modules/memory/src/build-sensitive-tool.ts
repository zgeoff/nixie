import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import { buildWriteCaller } from './build-write-caller';
import type { ModelWriteStore } from './gate-types';
import { readItemIDs } from './read-item-ids';
import { runWriteCall } from './run-write-call';
import type { ItemIDStore } from './types';

const sensitiveOutput = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['applied'] },
    itemID: { type: 'string' },
    version: { type: 'integer' },
  },
  required: ['status', 'itemID', 'version'],
  additionalProperties: false,
};

export function buildSensitiveTool(memory: ModelWriteStore & ItemIDStore): ToolDefinition {
  return {
    name: 'memory.mark_sensitive',
    description:
      'Marks a memory item sensitive by its itemID, or clears the mark with isSensitive false. ' +
      "A sensitive item, such as an address, a phone number, or an account or health detail, never comes with a turn's " +
      'recalled memories; memory.recall still finds it when a request needs it. The mark applies at ' +
      'once and needs no review, and the owner can change it.',
    input: {
      type: 'object',
      properties: { itemID: { type: 'string' }, isSensitive: { type: 'boolean' } },
      required: ['itemID', 'isSensitive'],
      additionalProperties: false,
    },
    output: sensitiveOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { status: 'owner_data', itemID: 'owner_data', version: 'owner_data' },
    },
    execution: 'direct',
    run: (call, context) => runSensitiveCall(memory, call, context),
  };
}

const sensitiveArguments = z.object({ itemID: z.string(), isSensitive: z.boolean() });

async function runSensitiveCall(
  memory: ModelWriteStore & ItemIDStore,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  const input = sensitiveArguments.parse(call.input);

  const [itemID = input.itemID] = await readItemIDs(memory, [input.itemID]);

  return runWriteCall(
    memory,
    () =>
      memory.writes.markSensitive({
        itemID,
        isSensitive: input.isSensitive,
        caller: buildWriteCaller(context),
      }),
    itemID,
  );
}
