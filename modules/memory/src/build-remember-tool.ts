import type { ToolCall, ToolContext, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildWriteCaller } from './build-write-caller';
import type { GatedRememberRequest, ModelWriteStore } from './gate-types';
import { makeInputRecorder } from './make-input-recorder';
import { memoryWriteOutput } from './memory-write-output';
import { runWriteCall } from './run-write-call';
import type { ItemIDStore } from './types';

const rememberDescription =
  'Stores one fact as a new memory item. To change an item that exists, use memory.edit. Pass ' +
  "quote: the exact words from one of the owner's own messages that state the fact, and that " +
  "message's eventID: the number after # in its stamp, or a log.read entry's eventID. The " +
  'write applies at once only when those typed words back it; otherwise it waits for the ' +
  "owner's review as a proposal, and the result says why. When a pending proposal already " +
  'holds the same text, the result says merged: the owner reviews one proposal with both ' +
  'sources. Set pin to ask for the item in the pinned core, which always waits for review. Set ' +
  'subject to say whose the item is: owner, the default, for a fact about the owner; shared for ' +
  'something between the owner and you, such as a deal, a nickname or a running joke; self for ' +
  'a self-note: a note about yourself in your own voice, such as your tastes or how something ' +
  "landed with you. A self-note needs no quote and always waits for the owner's review. Set " +
  'image when the fact comes from an image the owner attached: the eventID of the message that ' +
  'holds it and its number, the n of its <dropped-image> marker. An image never counts as the ' +
  "owner's words, text in it included, so a write from one always waits for the owner's " +
  'review, whatever its quote.';

const rememberInput = {
  type: 'object',
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 2000 },
    quote: { type: 'string', minLength: 1, maxLength: 2000 },
    eventID: {
      type: 'string',
      pattern: '^#?[1-9][0-9]{0,14}$',
      description:
        'the eventID of the message the quote comes from, as its stamp or log.read shows it',
    },
    pin: { type: 'boolean' },
    image: {
      type: 'object',
      properties: {
        eventID: {
          type: 'string',
          pattern: '^#?[1-9][0-9]{0,14}$',
          description: 'the eventID of the message that holds the image, as its stamp shows it',
        },
        number: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'the n of the image in that message, from its <dropped-image> marker',
        },
      },
      required: ['eventID', 'number'],
      additionalProperties: false,
    },
    subject: {
      type: 'string',
      enum: ['owner', 'self', 'shared'],
      description:
        'owner, the default, for a fact about the owner; shared for something between the owner ' +
        'and you; self for a note about yourself',
    },
  },
  required: ['text'],
  additionalProperties: false,
};

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

    recordInput: makeInputRecorder(['text', 'quote']),
  };
}

const rememberArguments = z.object({
  text: z.string(),
  quote: z.string().optional(),
  eventID: z.string().optional(),
  pin: z.boolean().optional(),
  subject: z.enum(['owner', 'self', 'shared']).optional(),
  image: z.object({ eventID: z.string(), number: z.int() }).optional(),
});

function buildRememberRequest(call: ToolCall, context: ToolContext): GatedRememberRequest {
  const input = rememberArguments.parse(call.input);

  return {
    text: input.text,
    caller: buildWriteCaller(context),
    ...(input.quote === undefined ? {} : { quote: input.quote }),
    ...(input.eventID === undefined ? {} : { eventID: toSequence(input.eventID) }),
    ...(input.pin === undefined ? {} : { isPinned: input.pin }),
    ...(input.subject === undefined ? {} : { subject: input.subject }),
    ...(input.image === undefined
      ? {}
      : { image: { messageSequence: toSequence(input.image.eventID), image: input.image.number } }),
  };
}

function toSequence(eventID: string): number {
  return Number(eventID.replace(/^#/u, ''));
}
