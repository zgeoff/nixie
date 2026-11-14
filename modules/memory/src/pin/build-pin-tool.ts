import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { ModelWriteStore } from '../gate/gate-context';
import type { ItemIDStore } from '../types';
import { readItemIDs } from '../utils/item/read-item-ids';
import { memoryWriteOutput } from '../utils/memory-write-output';
import { buildWriteCaller } from '../write/build-write-caller';
import { runWriteCall } from '../write/run-write-call';

export function buildPinTool(memory: ModelWriteStore & ItemIDStore): ToolDefinition {
  return {
    name: 'memory.pin',
    description:
      'Asks to add a memory item you already have to the pinned core, which opens every ' +
      'session, by its itemID and the version you read with memory.recall. The pin waits for ' +
      "the owner's review as a proposal, because the core costs every session, and the result " +
      'says why. An item must be active to pin, and an approval fails when the core has no room ' +
      'left in its token budget. To pin a new fact, remember it first, then pin it.',
    input: {
      type: 'object',
      properties: {
        itemID: { type: 'string' },
        version: { type: 'integer', minimum: 1 },
      },
      required: ['itemID', 'version'],
      additionalProperties: false,
    },
    output: memoryWriteOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
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
    run: (call, context) => runPinCall(memory, call, context),
  };
}

const pinArguments = z.object({ itemID: z.string(), version: z.int() });

async function runPinCall(
  memory: ModelWriteStore & ItemIDStore,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  const input = pinArguments.parse(call.input);

  const [itemID = input.itemID] = await readItemIDs(memory, [input.itemID]);

  return runWriteCall(
    memory,
    () =>
      memory.writes.pin({
        target: { itemID, version: input.version },
        caller: buildWriteCaller(context),
      }),
    itemID,
  );
}
