import type { ToolCall, ToolContext, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildWriteCaller } from './build-write-caller';
import type { GatedRememberRequest } from './gate-types';
import { makeInputRecorder } from './make-input-recorder';
import { memoryWriteOutput } from './memory-write-output';
import { runWriteCall } from './run-write-call';
import type { StartedMemoryStore } from './start-memory-store';

// Builds memory.remember, which declares note and runs each write through the content gate.
export function buildRememberTool(memory: Pick<StartedMemoryStore, 'writes'>): ToolDefinition {
  return {
    name: 'memory.remember',
    description: rememberDescription,
    input: rememberInput,
    output: memoryWriteOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['text', 'quote'],
      results: {
        status: 'owner_data',
        itemID: 'owner_data',
        version: 'owner_data',
        proposalID: 'owner_data',
        reason: 'owner_data',
      },
    },
    execution: 'direct',
    run: (call, context) =>
      runWriteCall(() => memory.writes.remember(buildRememberRequest(call, context))),

    // the text is the item's, which the version holds under the item's key, and the quote can
    // repeat it before the gate checks the quote
    recordInput: makeInputRecorder(['text', 'quote']),
  };
}

const rememberDescription =
  'Stores one fact as a new memory item, or edits an item when you pass its itemID and the ' +
  "version you read. Pass quote: the exact words from one of the owner's own recent " +
  'messages that state the fact. The write applies at once only when those typed words back ' +
  "it; otherwise it waits for the owner's review as a proposal, and the result says why. " +
  'Set pin to ask for the item in the pinned core, which always waits for review.';

const rememberInput = {
  type: 'object',
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 2000 },
    quote: { type: 'string', minLength: 1, maxLength: 2000 },
    itemID: { type: 'string' },
    version: { type: 'integer', minimum: 1 },
    pin: { type: 'boolean' },
  },
  required: ['text'],
  dependentRequired: { itemID: ['version'], version: ['itemID'] },
  additionalProperties: false,
};

function buildRememberRequest(call: ToolCall, context: ToolContext): GatedRememberRequest {
  const input = rememberArguments.parse(call.input);

  return {
    text: input.text,
    caller: buildWriteCaller(context),
    ...(input.quote === undefined ? {} : { quote: input.quote }),
    ...(input.itemID === undefined || input.version === undefined
      ? {}
      : { target: { itemID: input.itemID, version: input.version } }),
    ...(input.pin === undefined ? {} : { isPinned: input.pin }),
  };
}

const rememberArguments = z.object({
  text: z.string(),
  quote: z.string().optional(),
  itemID: z.string().optional(),
  version: z.int().optional(),
  pin: z.boolean().optional(),
});
