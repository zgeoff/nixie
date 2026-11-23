import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { ModelWriteStore } from '../gate/gate-context';
import { labelInputSchema } from '../label/label-input-schema';
import { isWriteRefusal } from '../utils/error/is-write-refusal';
import { buildWriteCaller } from '../write/build-write-caller';

const foldInput = {
  type: 'object',
  properties: {
    topic: {
      ...labelInputSchema.topic,
      description:
        'the topic to set, without any sub-topic: the part before the first slash, such as people',
    },
    subject: { type: 'string', enum: ['owner', 'self', 'shared'] },
    order: {
      type: 'string',
      enum: ['newest', 'oldest'],
      description: 'newest to show the 3 newest items of a folded row, oldest to show the 3 oldest',
    },
  },
  required: ['topic', 'subject', 'order'],
  additionalProperties: false,
};

const foldOutput = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['applied'] },
    topic: { type: 'string' },
    order: { type: 'string', enum: ['newest', 'oldest'] },
  },
  required: ['status', 'topic', 'order'],
  additionalProperties: false,
};

export function buildFoldTool(memory: Pick<ModelWriteStore, 'writes'>): ToolDefinition {
  return {
    name: 'memory.fold',
    description:
      'Sets which 3 items a folded row of the memory index shows for a topic: the newest, which ' +
      'is the default, or the oldest. The setting covers the topic and the sub-topics under it ' +
      'and stays until you set it again. It applies at once and changes no item, so it needs no ' +
      'review. Use oldest for a topic whose first items are its foundations.',
    input: foldInput,
    output: foldOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['topic'],
      results: { status: 'owner_data', topic: 'owner_data', order: 'owner_data' },
    },
    execution: 'direct',
    recordInput: (input) =>
      Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'topic')),
    run: (call, context) => runFoldCall(memory, call, context),
  };
}

const foldArguments = z.object({
  topic: z.string(),
  subject: z.enum(['owner', 'self', 'shared']),
  order: z.enum(['newest', 'oldest']),
});

async function runFoldCall(
  memory: Pick<ModelWriteStore, 'writes'>,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolOutcome> {
  const input = foldArguments.parse(call.input);

  if (input.topic.includes('/')) {
    return {
      status: 'error',
      message: 'refused: pass the topic before its first slash, as the order covers its sub-topics',
    };
  }

  try {
    const topic = await memory.writes.writeFoldOrder({
      subject: input.subject,
      topic: input.topic,
      order: input.order,
      caller: buildWriteCaller(context, 'memory.fold'),
    });

    return { status: 'ok', result: { status: 'applied', topic, order: input.order } };
  } catch (error) {
    if (isWriteRefusal(error)) {
      return { status: 'error', message: error.message };
    }

    throw error;
  }
}
