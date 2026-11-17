import { conversationTaskID } from '@heynixie/tasks';
import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { ModelWriteStore, WriteSource } from '../gate/gate-context';
import type { ItemIDStore } from '../types';
import { readItemIDs } from '../utils/item/read-item-ids';
import { memoryWriteOutput } from '../utils/memory-write-output';
import { buildWriteCaller } from '../write/build-write-caller';
import { resolveWriteFacts } from '../write/resolve-write-facts';
import { runWriteCall } from '../write/run-write-call';

const pinArguments = z.object({ itemID: z.string(), version: z.int() });

export function buildPinTool(memory: ModelWriteStore & ItemIDStore): ToolDefinition {
  return {
    name: 'memory.pin',
    description:
      'Adds a memory item you already have to the pinned core, which opens every session, by ' +
      'its itemID and the version you read with memory.recall. Without an allow rule that ' +
      "covers the pin, it waits for the owner's review as a proposal, because the core costs " +
      'every session, and the result says why. An allow rule that covers the pin applies it at ' +
      'once and leaves a notice; a rule for a self-note needs a check that subject is self. An ' +
      'item must be active to pin, and a pin fails when the core has no room left in its token ' +
      'budget. To pin a new fact, remember it first, then pin it.',
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
      effects: ['memory_write'],
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
    resolvePolicyFacts: (rawInput, context) =>
      resolveWriteFacts(async () => {
        const input = pinArguments.parse(rawInput);

        const [itemID = input.itemID] = await readItemIDs(memory, [input.itemID]);
        const subject = await memory.writes.readItemSubject(itemID);

        return {
          sources: buildPinSources(context.run.thread),
          args: { ...rawInput, subject },
        };
      }),
    run: (call, context) => runPinCall(memory, call, context),
  };
}

// A pin rests on no quote, so only a task run gives it a source.
function buildPinSources(thread: string): readonly WriteSource[] {
  return thread === conversationTaskID ? [] : ['task'];
}

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
        ...(context.verdict === undefined ? {} : { verdict: context.verdict }),
      }),
    itemID,
  );
}
