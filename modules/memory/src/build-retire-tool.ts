import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import { buildWriteCaller } from './build-write-caller';
import type { ModelWriteStore } from './gate-types';
import { makeInputRecorder } from './make-input-recorder';
import { memoryWriteOutput } from './memory-write-output';
import { readItemIDs } from './read-item-ids';
import { runWriteCall } from './run-write-call';
import type { ItemIDStore } from './types';

// Builds memory.retire, which declares note and runs each retirement through the intent gate. The
// model names the item by its short ID, or by an item ID it read before short IDs.
export function buildRetireTool(memory: ModelWriteStore & ItemIDStore): ToolDefinition {
  return {
    name: 'memory.retire',
    description:
      'Retires a memory item that stopped being true, such as an old address, by its itemID and ' +
      'the version you read with memory.recall. Pass intentQuote: the exact words from one of ' +
      "the owner's own recent messages that ask to drop the item or say it stopped being true. " +
      'The retirement applies at once only when those typed words back it; otherwise it waits ' +
      "for the owner's review. A retired item keeps its history and can be restored by the owner.",
    input: {
      type: 'object',
      properties: {
        itemID: { type: 'string' },
        version: { type: 'integer', minimum: 1 },
        intentQuote: { type: 'string', minLength: 1, maxLength: 2000 },
      },
      required: ['itemID', 'version'],
      additionalProperties: false,
    },
    output: memoryWriteOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['intentQuote'],
      results: {
        status: 'owner_data',
        itemID: 'owner_data',
        version: 'owner_data',
        proposalID: 'owner_data',
        reason: 'owner_data',
        merged: 'owner_data',
      },
    },
    execution: 'direct',

    // the model can copy the item's text into the intent quote before the gate checks it
    recordInput: makeInputRecorder(['intentQuote']),
    run: (call, context) => runRetireCall(memory, call, context),
  };
}

async function runRetireCall(
  memory: ModelWriteStore & ItemIDStore,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  const input = retireArguments.parse(call.input);
  const [itemID = input.itemID] = await readItemIDs(memory, [input.itemID]);

  return runWriteCall(
    memory,
    () =>
      memory.writes.retire({
        target: { itemID, version: input.version },
        caller: buildWriteCaller(context),
        ...(input.intentQuote === undefined ? {} : { intentQuote: input.intentQuote }),
      }),
    itemID,
  );
}

const retireArguments = z.object({
  itemID: z.string(),
  version: z.int(),
  intentQuote: z.string().optional(),
});
