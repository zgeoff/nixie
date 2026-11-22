import { untilConventions } from '@heynixie/prompts';
import type { ToolCall, ToolContext, ToolDefinition } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { GatedRememberRequest, ModelWriteStore } from '../gate/gate-context';
import { labelInputSchema } from '../label/label-input-schema';
import { pickTopicSpelling } from '../label/pick-topic-spelling';
import type { ItemIDStore, Labels } from '../types';
import { TextLimitError } from '../utils/error/text-limit-error';
import { readItemIDs } from '../utils/item/read-item-ids';
import { makeInputRecorder } from '../utils/make-input-recorder';
import { memoryWriteOutput } from '../utils/memory-write-output';
import { parseUntilInput } from '../utils/parse-until-input';
import { untilInputSchema } from '../utils/schema/until-input-schema';
import { buildWriteCaller } from '../write/build-write-caller';
import { findTextLimitError } from '../write/find-text-limit-error';
import { resolveWriteFacts } from '../write/resolve-write-facts';
import { runWriteCall } from '../write/run-write-call';
import { changeOfMindGuidance } from './change-of-mind-guidance';

const editDescription =
  `Rewrites an existing memory item as a new version, by its itemID and the version you read ` +
  `with memory.recall. The new text replaces the whole item, and the old version stays in ` +
  `the item's history. Pass quote: the exact words from one of the owner's own messages that ` +
  `state the new text, and that message's eventID: the number after # in its stamp, or a ` +
  `log.read entry's eventID. The edit applies at once only when those typed words back ` +
  `it; otherwise it waits for the owner's review as a proposal, and the result says why. An ` +
  `allow rule that covers the edit applies it at once, whatever the quote, and leaves a notice. ` +
  `The item keeps its subject unless you pass subject: owner for a fact about the owner, shared ` +
  `for something between the owner and you, self for a note about yourself. Pass it to fix an ` +
  `item filed under the wrong subject. A subject change changes whose fact the item is, so it ` +
  `waits for the owner's review as a proposal, whatever the quote, unless an allow rule covers ` +
  `it; a move into or out of self takes the rule that the new subject needs. To split an item ` +
  `that holds two subjects, edit it down to one fact and store the other with memory.remember. ` +
  `The item keeps its end time unless you pass until: a new end time, which the quote must ` +
  `back, or null when the fact no longer ends, such as after "actually I'm staying on". ${untilConventions} ` +
  `Pass gist, topic or triggers to change how the item is listed and what brings it up: a label ` +
  `you leave out keeps its value, and triggers replaces the whole list, so [] clears it. Leave ` +
  `text out for an edit of labels only: it takes none of quote, eventID, until and subject, and ` +
  `it waits for the owner's review as a proposal unless an allow rule covers it. ` +
  `A write to a self-note needs an allow rule that checks subject is self. ${changeOfMindGuidance} ${labelInputSchema.description}`;

const editInput = {
  type: 'object',
  properties: {
    itemID: { type: 'string' },
    version: { type: 'integer', minimum: 1 },
    text: {
      type: 'string',
      minLength: 1,
      description:
        'at most 6,000 characters for a self-note and 2,000 for any other subject, the subject ' +
        'being the one you pass or else the one the item has',
    },
    gist: labelInputSchema.gist,
    topic: labelInputSchema.topic,
    triggers: labelInputSchema.triggers,
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
  required: ['itemID', 'version'],
  additionalProperties: false,
};

const editArguments = z.object({
  itemID: z.string(),
  version: z.int(),
  text: z.string().optional(),
  gist: z.string().optional(),
  topic: z.string().optional(),
  triggers: z.array(z.string()).optional(),
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
      content: ['text', 'quote', 'gist', 'topic', 'triggers'],
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

    recordInput: makeInputRecorder(['text', 'quote', 'gist', 'topic', 'triggers']),
    resolvePolicyFacts: (rawInput, context) =>
      resolveWriteFacts(async () => {
        const input = editArguments.parse(rawInput);

        const [itemID = input.itemID] = await readItemIDs(memory, [input.itemID]);
        const itemSubject = await memory.writes.readItemSubject(itemID);

        const subject = input.subject ?? itemSubject;

        const limitError =
          input.text === undefined ? null : findTextLimitError(input.text, subject, true);

        if (limitError !== null) {
          throw new TextLimitError(limitError);
        }

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

      const refusal = pickLabelRefusal(input);

      if (refusal !== null) {
        return { status: 'error', message: refusal };
      }

      const [itemID = input.itemID] = await readItemIDs(memory, [input.itemID]);

      return runWriteCall(
        memory,
        async () => {
          const labels = await mergeLabels(memory.writes, itemID, input);

          if (input.text === undefined) {
            invariant(labels, 'an edit with no text and no label is refused before it runs');

            return memory.writes.editLabels({
              target: { itemID, version: input.version },
              labels,
              caller: buildWriteCaller(context),
              ...(context.verdict === undefined ? {} : { verdict: context.verdict }),
            });
          }

          return memory.writes.remember({
            ...buildEditRequest(input, itemID, parsed.until, context),
            ...(labels === null ? {} : { labels }),
          });
        },
        itemID,
      );
    },
  };
}

function buildEditRequest(
  input: z.infer<typeof editArguments>,
  itemID: string,
  until: number | null | undefined,
  context: Pick<ToolContext, 'run' | 'verdict'>,
): GatedRememberRequest {
  return {
    text: input.text ?? '',
    target: { itemID, version: input.version },
    caller: buildWriteCaller(context),
    ...(context.verdict === undefined ? {} : { verdict: context.verdict }),
    ...(input.quote === undefined ? {} : { quote: input.quote }),
    ...(input.eventID === undefined ? {} : { eventID: Number(input.eventID.replace(/^#/u, '')) }),
    ...(until === undefined ? {} : { until }),
    ...(input.subject === undefined ? {} : { subject: input.subject }),
  };
}

type EditInput = z.infer<typeof editArguments>;

const labelOnlyRefusal =
  'refused: an edit of labels only, with no text, takes none of quote, eventID, until and subject';

function pickLabelRefusal(input: EditInput): string | null {
  const hasLabel =
    input.gist !== undefined || input.topic !== undefined || input.triggers !== undefined;

  if (input.text === undefined && !hasLabel) {
    return 'refused: pass text, gist, topic or triggers';
  }

  const isLabelOnly = input.text === undefined;

  const hasTextOnlyField =
    input.quote !== undefined ||
    input.eventID !== undefined ||
    input.until !== undefined ||
    input.subject !== undefined;

  return isLabelOnly && hasTextOnlyField ? labelOnlyRefusal : null;
}

// The whole label set of the call: a label it omits keeps the item's value. Null when the call
// passes none.
async function mergeLabels(
  memory: Pick<ModelWriteStore['writes'], 'readItemLabels' | 'readTopics'>,
  itemID: string,
  input: EditInput,
): Promise<Labels | null> {
  if (input.gist === undefined && input.topic === undefined && input.triggers === undefined) {
    return null;
  }

  const current = await memory.readItemLabels(itemID);

  const topics = input.topic === undefined ? [] : await memory.readTopics(itemID);
  const topic = input.topic === undefined ? current.topic : pickTopicSpelling(input.topic, topics);

  return {
    gist: input.gist ?? current.gist,
    topic,
    triggers: input.triggers ?? current.triggers,
  };
}
