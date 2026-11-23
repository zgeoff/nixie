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
import { buildRetopicCard } from '../retopic/build-retopic-card';
import type { RetopicSource } from '../retopic/types';
import { requireGrantedSelfSubject } from '../subject/require-granted-self-subject';
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

type RetopicStore = ModelWriteStore;

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
    resolvePolicyFacts: (rawInput, context) => resolveRetopicFacts(memory, rawInput, context),
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

const bothOrNeitherMessage = 'refused: pass either from or items, and not both';

// What a rule on memory.edit sees of the call: the subject of every item the move touches, the
// topic each item moves to, which a whole-topic move gives each sub-topic its own, and the short ID
// of each item that moves.
async function resolveRetopicFacts(
  memory: RetopicStore,
  rawInput: JSONObject,
  context: ToolResolveContext,
): Promise<PolicyFactsResolution> {
  const input = retopicArguments.safeParse(rawInput);
  const source = input.success ? buildSource(input.data) : null;

  if (!input.success || source === null) {
    return { status: 'error', message: bothOrNeitherMessage };
  }

  const planned = await memory.writes.readRetopicPlan(source, input.data.to);

  const moves = planned.status === 'planned' ? planned.plan.moves : [];
  const topics = [...new Set(moves.map((move) => move.toTopic))];

  const subjects = [
    ...new Set([
      input.data.to.subject,
      ...(source.kind === 'topic' ? [source.subject] : []),
      ...moves.map((move) => move.fromSubject),
    ]),
  ];

  const caller = buildWriteCaller(context);

  try {
    requireGrantedSelfSubject(caller, subjects);
  } catch (error) {
    if (isWriteRefusal(error)) {
      return { status: 'error', message: error.message };
    }

    throw error;
  }

  return {
    status: 'ok',
    sources: pickWriteSources(false, caller),
    args: {
      ...rawInput,
      subject: subjects.length === 1 ? input.data.to.subject : subjects,
      topic: topics.length === 0 ? input.data.to.topic : singleOrList(topics),
      ...(moves.length === 0 ? {} : { itemID: moves.map((move) => move.shortID) }),
    },
  };
}

type RetopicArguments = z.infer<typeof retopicArguments>;

// The source a call names, or null when it names both or neither.
function buildSource(input: RetopicArguments): RetopicSource | null {
  if (input.from !== undefined && input.items === undefined) {
    return { kind: 'topic', topic: input.from.topic, subject: input.from.subject };
  }

  return input.from === undefined && input.items !== undefined
    ? { kind: 'items', shortIDs: input.items }
    : null;
}

function singleOrList(values: readonly string[]): string | readonly string[] {
  const [only] = values;

  return values.length === 1 && only !== undefined ? only : values;
}

// The refusal of a move waits for run, after the decision point, so a refusal never tells the model
// what a rule meant to keep from it. What prepare stores shows the user the move, or its refusal.
async function prepareRetopic(
  memory: RetopicStore,
  rawInput: JSONObject,
): Promise<Prepared | DirectResult> {
  const input = retopicArguments.parse(rawInput);
  const source = buildSource(input);

  if (source === null) {
    return {
      result: { status: 'refused', code: 'EMPTY_MOVE', message: bothOrNeitherMessage },
      refusalCode: 'EMPTY_MOVE',
    };
  }

  const planned = await memory.writes.readRetopicPlan(source, input.to);

  const itemIDs = planned.status === 'planned' ? planned.plan.moves.map((move) => move.itemID) : [];

  return {
    destinations: [],
    attachments: [buildRetopicCard(planned)],
    settleAttachments: (callSequence) =>
      memory.writes.removeRetopicCardOfForgotten(callSequence, itemIDs),
  };
}

async function runRetopic(
  memory: RetopicStore,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  try {
    const input = retopicArguments.parse(call.input);
    const source = buildSource(input);

    if (source === null) {
      throw new TopicMoveError('EMPTY_MOVE', bothOrNeitherMessage);
    }

    // a call with no verdict ran after the user approved it, and moves what the card showed
    const shown =
      context.verdict === undefined
        ? await memory.writes.readRetopicShown(context.callSequence)
        : undefined;

    if (shown === null) {
      throw new TopicMoveError(
        'CHANGED_SINCE_SHOWN',
        'refused: the card of this move is gone, so ask for the move again',
      );
    }

    const plan = await memory.writes.retopic({
      source,
      to: input.to,
      caller: buildWriteCaller(context),
      ...(context.verdict === undefined ? {} : { verdict: context.verdict }),
      ...(shown === undefined ? {} : { shown }),
    });

    return {
      status: 'ok',
      result: { status: 'applied', moved: plan.moves.length, move: plan.sentence },
    };
  } catch (error) {
    if (error instanceof TopicMoveError) {
      return {
        status: 'ok',
        result: { status: 'refused', code: error.code, message: error.message },
        refusalCode: error.code,
      };
    }

    if (isWriteRefusal(error)) {
      return { status: 'error', message: error.message };
    }

    throw error;
  }
}
