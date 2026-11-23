import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { GatedRetireRequest, ModelWriteStore } from '../gate/gate-context';
import type { ItemIDStore } from '../types';
import { readItemIDs } from '../utils/item/read-item-ids';
import { makeInputRecorder } from '../utils/make-input-recorder';
import { memoryWriteOutput } from '../utils/memory-write-output';
import { buildWriteCaller } from '../write/build-write-caller';
import { resolveWriteFacts } from '../write/resolve-write-facts';
import { runWriteCall } from '../write/run-write-call';
import { changeOfMindGuidance } from './change-of-mind-guidance';

const retireArguments = z.object({
  itemID: z.string(),
  version: z.int(),
  intentQuote: z.string().optional(),
});

export function buildRetireTool(memory: ModelWriteStore & ItemIDStore): ToolDefinition {
  return {
    name: 'memory.retire',
    description:
      `Retires a memory item that stopped being true, such as an old address, by its itemID and ` +
      `the version you read with memory.recall. A self-note of yours retires at once and needs ` +
      `no intentQuote. For any other item, pass intentQuote: the exact words from one of the ` +
      `owner's own recent messages that ask to drop the item or say it stopped being true. That ` +
      `retirement applies at once only when those typed words back it; otherwise it waits for ` +
      `the owner's review, unless an allow rule that covers the retirement applies it at once and ` +
      `leaves a notice. A retired item keeps its history and can be restored by the owner. ${
        changeOfMindGuidance
      }`,
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
      effects: ['memory_write'],
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

    recordInput: makeInputRecorder(['intentQuote']),
    resolvePolicyFacts: (rawInput, context) =>
      resolveWriteFacts(async () => {
        const input = retireArguments.parse(rawInput);

        const [itemID = input.itemID] = await readItemIDs(memory, [input.itemID]);
        const subject = await memory.writes.readItemSubject(itemID);

        return {
          sources: await memory.writes.readRetireSources(
            buildRetireRequest(input, itemID, context),
          ),
          args: { ...rawInput, subject },
        };
      }),
    run: (call, context) => runRetireCall(memory, call, context),
  };
}

function buildRetireRequest(
  input: z.infer<typeof retireArguments>,
  itemID: string,
  context: Pick<ToolContext, 'run' | 'verdict'>,
): GatedRetireRequest {
  return {
    target: { itemID, version: input.version },
    caller: buildWriteCaller(context),
    ...(context.verdict === undefined ? {} : { verdict: context.verdict }),
    ...(input.intentQuote === undefined ? {} : { intentQuote: input.intentQuote }),
  };
}

async function runRetireCall(
  memory: ModelWriteStore & ItemIDStore,
  call: ToolCall,
  context: Pick<ToolContext, 'run' | 'verdict'>,
): Promise<ToolOutcome> {
  const input = retireArguments.parse(call.input);

  const [itemID = input.itemID] = await readItemIDs(memory, [input.itemID]);

  return runWriteCall(
    memory,
    () => memory.writes.retire(buildRetireRequest(input, itemID, context)),
    itemID,
  );
}
