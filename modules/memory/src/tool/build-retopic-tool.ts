import type { JSONObject } from '@heynixie/log';
import type {
  DirectResult,
  PolicyFactsResolution,
  Prepared,
  ToolCall,
  ToolContext,
  ToolDefinition,
  ToolOutcome,
  ToolResolveContext,
} from '@heynixie/tools';
import { z } from 'zod';
import type { ModelWriteStore } from '../gate/gate-context';
import { labelInputSchema } from '../label/label-input-schema';
import type { RetopicPlan, RetopicSource } from '../retopic/types';
import type { ItemIDStore } from '../types';
import { isWriteRefusal } from '../utils/error/is-write-refusal';
import { TopicMoveError } from '../utils/error/topic-move-error';
import { makeInputRecorder } from '../utils/make-input-recorder';
import { buildWriteCaller } from '../write/build-write-caller';
import { pickWriteSources } from '../write/pick-write-sources';

const maxItems = 200;

const retopicDescription =
  'Moves a whole topic, or a list of items, to another topic and subject in one call, with the ' +
  'effect of a label-only memory.edit on each item: the item keeps its text, its gist and its ' +
  'triggers, and only its topic, and its subject when it differs, change. Pass from to move every ' +
  'item that has that topic under that subject, with the sub-topics under it following the new ' +
  'name, or pass items, a list of itemIDs, to give each of them the topic in to. Pass exactly one ' +
  'of the two. It refuses a move of nothing, an itemID that names no item, and a move onto the ' +
  'topic and subject the items already have. The same rules cover it as cover memory.edit, and ' +
  'without a rule that allows it, the call waits for the owner to approve it.';

const side = {
  type: 'object',
  properties: {
    topic: labelInputSchema.topic,
    subject: {
      type: 'string',
      enum: ['owner', 'self', 'shared'],
      description: 'owner for facts about the owner, shared, or self for notes about yourself',
    },
  },
  required: ['topic', 'subject'],
  additionalProperties: false,
};

const retopicInput = {
  type: 'object',
  properties: {
    from: { ...side, description: 'the topic and subject to move every item of' },
    items: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1,
      maxItems,
      description: 'the itemIDs to move',
    },
    to: { ...side, description: 'the topic and subject the items move to' },
  },
  required: ['to'],
  additionalProperties: false,
};

const retopicOutput = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['applied', 'refused'] },
    moved: { type: 'integer' },
    move: { type: 'string' },
    code: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['status'],
  additionalProperties: false,
};

type RetopicStore = ModelWriteStore & ItemIDStore;

export function buildRetopicTool(memory: RetopicStore): ToolDefinition {
  return {
    name: 'memory.retopic',
    description: retopicDescription,
    input: retopicInput,
    output: retopicOutput,
    declaration: {
      effects: ['memory_write'],
      destinations: [],
      amount: null,
      content: ['from', 'to'],
      results: {
        status: 'owner_data',
        moved: 'owner_data',
        move: 'owner_data',
        code: 'owner_data',
        message: 'owner_data',
      },
    },
    execution: 'direct',
    recordInput: makeInputRecorder(['from', 'to']),
    resolvePolicyFacts: (rawInput, context) =>
      Promise.resolve(resolveRetopicFacts(rawInput, context)),
    prepare: (rawInput) => prepareRetopic(memory, rawInput),
    run: (call, context) => runRetopic(memory, call, context),
  };
}

const sideArguments = z.object({
  topic: z.string(),
  subject: z.enum(['owner', 'self', 'shared']),
});

const retopicArguments = z.object({
  from: sideArguments.optional(),
  items: z.array(z.string()).max(maxItems).optional(),
  to: sideArguments,
});

// The call's subject for a rule is the one it moves to.
function resolveRetopicFacts(
  rawInput: JSONObject,
  context: ToolResolveContext,
): PolicyFactsResolution {
  const input = retopicArguments.safeParse(rawInput);

  if (!input.success) {
    return { status: 'error', message: 'refused: pass to, and from or items' };
  }

  return {
    status: 'ok',
    sources: pickWriteSources(false, buildWriteCaller(context)),
    args: { ...rawInput, subject: input.data.to.subject },
  };
}

async function prepareRetopic(
  memory: RetopicStore,
  rawInput: JSONObject,
): Promise<Prepared | DirectResult> {
  try {
    const input = retopicArguments.parse(rawInput);

    const source = await readSource(memory, input);
    const plan = await memory.writes.readRetopicPlan(source, input.to);

    return { destinations: [], attachments: [encodePlan(plan)] };
  } catch (error) {
    if (isWriteRefusal(error)) {
      return {
        result: { status: 'refused', message: error.message },
        refusalCode: error instanceof TopicMoveError ? error.code : 'REFUSED',
      };
    }

    throw error;
  }
}

type RetopicArguments = z.infer<typeof retopicArguments>;

async function readSource(memory: RetopicStore, input: RetopicArguments): Promise<RetopicSource> {
  if ((input.from === undefined) === (input.items === undefined)) {
    throw new TopicMoveError('EMPTY_MOVE', 'refused: pass either from or items, and not both');
  }

  if (input.from !== undefined) {
    return { kind: 'topic', topic: input.from.topic, subject: input.from.subject };
  }

  const shortIDs = [...new Set(input.items)];

  const found = await memory.readItemIDMap(shortIDs);

  return {
    kind: 'items',
    items: shortIDs.map((shortID) => {
      const itemID = found.get(shortID);

      if (itemID === undefined) {
        throw new TopicMoveError('UNKNOWN_ITEM', `refused: no memory item ${shortID} to move`);
      }

      return { itemID, shortID };
    }),
  };
}

// What the approval card shows under the move: the gist of each item and where it moves from.
function encodePlan(plan: RetopicPlan): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify({
      sentence: plan.sentence,
      items: plan.moves.map((move) => ({
        id: move.shortID,
        gist: move.gist,
        from: `${move.fromSubject}/${move.fromTopic}`,
      })),
    }),
  );
}

async function runRetopic(
  memory: RetopicStore,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  try {
    const input = retopicArguments.parse(call.input);

    const source = await readSource(memory, input);

    const plan = await memory.writes.retopic({
      source,
      to: input.to,
      caller: buildWriteCaller(context),
      ...(context.verdict === undefined ? {} : { verdict: context.verdict }),
    });

    return {
      status: 'ok',
      result: { status: 'applied', moved: plan.moves.length, move: plan.sentence },
    };
  } catch (error) {
    if (isWriteRefusal(error)) {
      return { status: 'error', message: error.message };
    }

    throw error;
  }
}
