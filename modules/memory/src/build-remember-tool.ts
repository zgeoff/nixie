import type { ToolCall, ToolContext, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildWriteCaller } from './build-write-caller';
import type { GatedRememberRequest, ModelWriteStore } from './gate-types';
import { makeInputRecorder } from './make-input-recorder';
import { memoryWriteOutput } from './memory-write-output';
import { runWriteCall } from './run-write-call';
import type { ItemIDStore } from './types';

// Builds memory.remember, which declares note and runs each new fact through the content gate.
export function buildRememberTool(
  memory: ModelWriteStore & Pick<ItemIDStore, 'readShortIDs'>,
): ToolDefinition {
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
        merged: 'owner_data',
      },
    },
    execution: 'direct',
    run: (call, context) =>
      runWriteCall(memory, () => memory.writes.remember(buildRememberRequest(call, context))),

    // the text is the item's, which the version holds under the item's key, and the quote can
    // repeat it before the gate checks the quote
    recordInput: makeInputRecorder(['text', 'quote']),
  };
}

const rememberDescription =
  'Stores one fact as a new memory item. To change an item that exists, use memory.edit. Pass ' +
  "quote: the exact words from one of the owner's own recent messages that state the fact. For " +
  "words from an older message that log.read returned, also pass that entry's eventID. The " +
  'write applies at once only when those typed words back it; otherwise it waits for the ' +
  "owner's review as a proposal, and the result says why. When a pending proposal already " +
  'holds the same text, the result says merged: the owner reviews one proposal with both ' +
  'sources. Set pin to ask for the item in the pinned core, which always waits for review.';

const rememberInput = {
  type: 'object',
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 2000 },
    quote: { type: 'string', minLength: 1, maxLength: 2000 },
    eventID: {
      type: 'string',
      pattern: '^[1-9][0-9]{0,14}$',
      description: 'the eventID of the log.read entry the quote comes from',
    },
    pin: { type: 'boolean' },
  },
  required: ['text'],
  additionalProperties: false,
};

function buildRememberRequest(call: ToolCall, context: ToolContext): GatedRememberRequest {
  const input = rememberArguments.parse(call.input);

  return {
    text: input.text,
    caller: buildWriteCaller(context),
    ...(input.quote === undefined ? {} : { quote: input.quote }),
    ...(input.eventID === undefined ? {} : { eventID: Number(input.eventID) }),
    ...(input.pin === undefined ? {} : { isPinned: input.pin }),
  };
}

const rememberArguments = z.object({
  text: z.string(),
  quote: z.string().optional(),
  eventID: z.string().optional(),
  pin: z.boolean().optional(),
});
