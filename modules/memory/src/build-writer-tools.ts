import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { WriterStaging } from './create-writer-staging';
import { parseUntilInput } from './parse-until-input';
import type { MemoryStore } from './types';
import { untilConventions } from './until-conventions';
import { untilInputSchema } from './until-input-schema';
import { writerSubjects } from './writer-subjects';

export function buildWriterTools(
  store: Pick<MemoryStore, 'recall'>,
  staging: WriterStaging,
  topItems: number,
): readonly ToolDefinition[] {
  return [
    buildRecallTool(store, staging, topItems),
    buildRememberTool(staging),
    buildEditTool(staging),
    buildRetireTool(staging),
    buildFlagSelfNoteTool(staging),
  ];
}

const recallOutput = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          itemID: { type: 'string' },
          subject: { type: 'string', enum: writerSubjects },
          text: { type: 'string' },
        },
        required: ['itemID', 'subject', 'text'],
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const recallArguments = z.object({ query: z.string() });

function buildRecallTool(
  store: Pick<MemoryStore, 'recall'>,
  staging: WriterStaging,
  topItems: number,
): ToolDefinition {
  return {
    name: 'memory.recall',
    description:
      'Finds current memory items that match any of the words in query, best match first, each ' +
      'with its itemID and text.',
    input: {
      type: 'object',
      properties: { query: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['query'],
      additionalProperties: false,
    },
    output: recallOutput,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: ['query'],
      results: { items: 'untrusted' },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = recallArguments.parse(call.input);

      const result = await store.recall({
        query: input.query,
        limit: topItems,
        thread: context.run.thread,
        subjects: writerSubjects,
      });

      for (const item of result.items) {
        staging.show(item.itemID, { version: item.version, subject: item.subject }, item.text);
      }

      return {
        status: 'ok',
        result: {
          items: result.items.map((item) => ({
            itemID: item.itemID,
            subject: item.subject,
            text: item.text,
          })),
        },
      };
    },
  };
}

const stagedOutput = {
  type: 'object',
  properties: { staged: { type: 'boolean' } },
  required: ['staged'],
  additionalProperties: false,
};

const subjectInput = { type: 'string', enum: writerSubjects };

const rememberArguments = z.object({
  subject: z.enum(writerSubjects),
  text: z.string(),
  quote: z.string(),
  sourceID: z.int(),
  until: z.string().optional(),
});

function buildRememberTool(staging: WriterStaging): ToolDefinition {
  return {
    name: 'memory.remember',
    description:
      'Stages one durable fact as a new memory item: about the owner (subject owner), or ' +
      'between the owner and the assistant (subject shared). To change a current item, use ' +
      'memory.edit. quote is the exact words from the owner message whose ID is sourceID. Pass ' +
      `until only when that message says when the fact stops being true. ${untilConventions}`,
    input: {
      type: 'object',
      properties: {
        subject: subjectInput,
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        quote: { type: 'string', minLength: 1, maxLength: 2000 },
        sourceID: { type: 'integer', minimum: 1 },
        until: untilInputSchema,
      },
      required: ['subject', 'text', 'quote', 'sourceID'],
      additionalProperties: false,
    },
    output: stagedOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['text', 'quote'],
      results: { staged: 'owner_data' },
    },
    execution: 'direct',
    run: (call) => {
      const input = rememberArguments.parse(call.input);
      const parsed = parseUntilInput(input.until);

      if (parsed.status === 'invalid') {
        return Promise.resolve({ status: 'error', message: parsed.message });
      }

      return Promise.resolve(
        toOutcome(
          staging.stage({
            op: 'remember',
            subject: input.subject,
            text: input.text,
            quote: input.quote,
            sourceSequence: input.sourceID,
            itemID: null,
            ...(parsed.until === undefined ? {} : { until: parsed.until }),
          }),
        ),
      );
    },
  };
}

const stagedResult: ToolOutcome = { status: 'ok', result: { staged: true } };

function toOutcome(result: ReturnType<WriterStaging['stage']>): ToolOutcome {
  return result.status === 'staged' ? stagedResult : { status: 'error', message: result.reason };
}

const editArguments = z.object({
  itemID: z.string(),
  subject: z.enum(writerSubjects),
  text: z.string(),
  quote: z.string(),
  sourceID: z.int(),
  until: z.string().nullable().optional(),
});

function buildEditTool(staging: WriterStaging): ToolDefinition {
  return {
    name: 'memory.edit',
    description:
      'Stages the new full text of a current item, by its itemID and with its subject, when the ' +
      'owner updates, corrects or contradicts it. quote is the exact words from the owner ' +
      'message whose ID is sourceID. The item keeps its end time unless you pass until: a new ' +
      `end time, or null when the fact no longer ends. ${untilConventions}`,
    input: {
      type: 'object',
      properties: {
        itemID: { type: 'string' },
        subject: subjectInput,
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        quote: { type: 'string', minLength: 1, maxLength: 2000 },
        sourceID: { type: 'integer', minimum: 1 },
        until: { ...untilInputSchema, type: ['string', 'null'] },
      },
      required: ['itemID', 'subject', 'text', 'quote', 'sourceID'],
      additionalProperties: false,
    },
    output: stagedOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['text', 'quote'],
      results: { staged: 'owner_data' },
    },
    execution: 'direct',
    run: (call) => {
      const input = editArguments.parse(call.input);
      const parsed = parseUntilInput(input.until);

      if (parsed.status === 'invalid') {
        return Promise.resolve({ status: 'error', message: parsed.message });
      }

      return Promise.resolve(
        toOutcome(
          staging.stage({
            op: 'remember',
            subject: input.subject,
            text: input.text,
            quote: input.quote,
            sourceSequence: input.sourceID,
            itemID: input.itemID,
            ...(parsed.until === undefined ? {} : { until: parsed.until }),
          }),
        ),
      );
    },
  };
}

const retireArguments = z.object({ itemID: z.string(), quote: z.string(), sourceID: z.int() });

function buildRetireTool(staging: WriterStaging): ToolDefinition {
  return {
    name: 'memory.retire',
    description:
      'Stages the retirement of a current item that the owner said stopped being true, with ' +
      'nothing to replace it. quote is the owner words that say so, from the message whose ID is ' +
      'sourceID.',
    input: {
      type: 'object',
      properties: {
        itemID: { type: 'string' },
        quote: { type: 'string', minLength: 1, maxLength: 2000 },
        sourceID: { type: 'integer', minimum: 1 },
      },
      required: ['itemID', 'quote', 'sourceID'],
      additionalProperties: false,
    },
    output: stagedOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['quote'],
      results: { staged: 'owner_data' },
    },
    execution: 'direct',
    run: (call) => {
      const input = retireArguments.parse(call.input);

      return Promise.resolve(
        toOutcome(
          staging.stage({
            op: 'retire',
            quote: input.quote,
            sourceSequence: input.sourceID,
            itemID: input.itemID,
          }),
        ),
      );
    },
  };
}

const flagArguments = z.object({ text: z.string(), sourceID: z.int() });

function buildFlagSelfNoteTool(staging: WriterStaging): ToolDefinition {
  return {
    name: 'memory.flag-self-note',
    description:
      'Flags something about the assistant, which an owner message says, as a possible ' +
      'self-note for the assistant to write in its own voice. It creates no memory item. text ' +
      'is one short line about the assistant, and sourceID is the ID of the owner message.',
    input: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 500 },
        sourceID: { type: 'integer', minimum: 1 },
      },
      required: ['text', 'sourceID'],
      additionalProperties: false,
    },
    output: stagedOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['text'],
      results: { staged: 'owner_data' },
    },
    execution: 'direct',
    run: (call) => {
      const input = flagArguments.parse(call.input);

      return Promise.resolve(
        toOutcome(staging.flag({ text: input.text, sourceSequence: input.sourceID })),
      );
    },
  };
}
