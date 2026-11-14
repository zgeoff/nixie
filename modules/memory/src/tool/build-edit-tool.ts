import { untilConventions } from '@heynixie/prompts';
import type { ToolCall, ToolContext, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import type { GatedRememberRequest, ModelWriteStore } from '../gate/gate-context';
import type { ItemIDStore } from '../types';
import { readItemIDs } from '../utils/item/read-item-ids';
import { makeInputRecorder } from '../utils/make-input-recorder';
import { memoryWriteOutput } from '../utils/memory-write-output';
import { parseUntilInput } from '../utils/parse-until-input';
import { untilInputSchema } from '../utils/schema/until-input-schema';
import { buildWriteCaller } from '../write/build-write-caller';
import { resolveWriteFacts } from '../write/resolve-write-facts';
import { runWriteCall } from '../write/run-write-call';

const editDescription =
  'Rewrites an existing memory item as a new version, by its itemID and the version you read ' +
  'with memory.recall. The new text replaces the whole item, and the old version stays in ' +
  "the item's history. Pass quote: the exact words from one of the owner's own messages that " +
  "state the new text, and that message's eventID: the number after # in its stamp, or a " +
  "log.read entry's eventID. The edit applies at once only when those typed words back " +
  "it; otherwise it waits for the owner's review as a proposal, and the result says why. " +
  'The item keeps its subject unless you pass subject: owner for a fact about the owner, shared ' +
  'for something between the owner and you, self for a note about yourself. Pass it to fix an ' +
  'item filed under the wrong subject. A subject change changes whose fact the item is, so it ' +
  "always waits for the owner's review as a proposal, whatever the quote. To split an item " +
  'that holds two subjects, edit it down to one fact and store the other with memory.remember. ' +
  'The item keeps its end time unless you pass until: a new end time, which the quote must ' +
  `back, or null when the fact no longer ends, such as after "actually I'm staying on". ${untilConventions}`;

const editInput = {
  type: 'object',
  properties: {
    itemID: { type: 'string' },
    version: { type: 'integer', minimum: 1 },
    text: { type: 'string', minLength: 1, maxLength: 2000 },
    quote: { type: 'string', minLength: 1, maxLength: 2000 },
    eventID: {
      type: 'string',
      pattern: '^#?[1-9][0-9]{0,14}$',
      description:
        'the eventID of the message the quote comes from, as its stamp or log.read shows it',
    },
    until: { ...untilInputSchema, type: ['string', 'null'] },
    subject: {
      type: 'string',
      enum: ['owner', 'self', 'shared'],
      description: 'the subject to move the item to; leave it out to keep its subject',
    },
  },
  required: ['itemID', 'version', 'text'],
  additionalProperties: false,
};

const editArguments = z.object({
  itemID: z.string(),
  version: z.int(),
  text: z.string(),
  quote: z.string().optional(),
  eventID: z.string().optional(),
  until: z.string().nullable().optional(),
  subject: z.enum(['owner', 'self', 'shared']).optional(),
});

export function buildEditTool(memory: ModelWriteStore & ItemIDStore): ToolDefinition {
  return {
    name: 'memory.edit',
    description: editDescription,
    input: editInput,
    output: memoryWriteOutput,
    declaration: {
      effects: ['memory_write'],
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

    recordInput: makeInputRecorder(['text', 'quote']),
    resolvePolicyFacts: (rawInput, context) =>
      resolveWriteFacts(async () => {
        const input = editArguments.parse(rawInput);

        const [itemID = input.itemID] = await readItemIDs(memory, [input.itemID]);
        const itemSubject = await memory.writes.readItemSubject(itemID);

        const subject = input.subject ?? itemSubject;

        return {
          sources: await memory.writes.readRememberSources(
            buildEditRequest(input, itemID, undefined, context),
          ),
          args: { ...rawInput, subject },
        };
      }),
    run: async (call: ToolCall, context: ToolContext) => {
      const input = editArguments.parse(call.input);
      const parsed = parseUntilInput(input.until);

      if (parsed.status === 'invalid') {
        return { status: 'error', message: parsed.message };
      }

      const [itemID = input.itemID] = await readItemIDs(memory, [input.itemID]);

      return runWriteCall(
        memory,
        () => memory.writes.remember(buildEditRequest(input, itemID, parsed.until, context)),
        itemID,
      );
    },
  };
}

function buildEditRequest(
  input: z.infer<typeof editArguments>,
  itemID: string,
  until: number | null | undefined,
  context: ToolContext,
): GatedRememberRequest {
  return {
    text: input.text,
    target: { itemID, version: input.version },
    caller: buildWriteCaller(context),
    ...(context.verdict === undefined ? {} : { verdict: context.verdict }),
    ...(input.quote === undefined ? {} : { quote: input.quote }),
    ...(input.eventID === undefined ? {} : { eventID: Number(input.eventID.replace(/^#/u, '')) }),
    ...(until === undefined ? {} : { until }),
    ...(input.subject === undefined ? {} : { subject: input.subject }),
  };
}
