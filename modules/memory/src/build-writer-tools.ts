import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { WriterStaging } from './create-writer-staging';
import type { MemoryStore } from './types';

// Builds the memory writer's 4 tools, which stage a batch's changes instead of applying them, so a
// session that dies leaves nothing behind. As in the conversation, recall declares read, the rest
// declare note, remember only creates an item, and edit is the one tool that changes its text.
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
  ];
}

const stagedOutput = {
  type: 'object',
  properties: { staged: { type: 'boolean' } },
  required: ['staged'],
  additionalProperties: false,
};

const stagedResult: ToolOutcome = { status: 'ok', result: { staged: true } };

const recallOutput = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { itemID: { type: 'string' }, text: { type: 'string' } },
        required: ['itemID', 'text'],
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

// A recall shows the session each item it returns, so a later change to one binds to that version.
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
      });

      for (const item of result.items) {
        staging.show(item.itemID, item.version, item.text);
      }
      return {
        status: 'ok',
        result: { items: result.items.map((item) => ({ itemID: item.itemID, text: item.text })) },
      };
    },
  };
}

const recallArguments = z.object({ query: z.string() });

function buildRememberTool(staging: WriterStaging): ToolDefinition {
  return {
    name: 'memory.remember',
    description:
      'Stages one durable fact about the owner as a new memory item. To change a current item, ' +
      'use memory.edit. quote is the exact words from the owner message whose ID is sourceID.',
    input: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        quote: { type: 'string', minLength: 1, maxLength: 2000 },
        sourceID: { type: 'integer', minimum: 1 },
      },
      required: ['text', 'quote', 'sourceID'],
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

      return Promise.resolve(
        toOutcome(
          staging.stage({
            op: 'remember',
            text: input.text,
            quote: input.quote,
            sourceSequence: input.sourceID,
            itemID: null,
          }),
        ),
      );
    },
  };
}

const rememberArguments = z.object({ text: z.string(), quote: z.string(), sourceID: z.int() });

// An edit names its item, and the staging area binds it to the version a recall showed the session.
function buildEditTool(staging: WriterStaging): ToolDefinition {
  return {
    name: 'memory.edit',
    description:
      'Stages the new full text of a current item, by its itemID, when the owner updates or ' +
      'contradicts it. quote is the exact words from the owner message whose ID is sourceID.',
    input: {
      type: 'object',
      properties: {
        itemID: { type: 'string' },
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        quote: { type: 'string', minLength: 1, maxLength: 2000 },
        sourceID: { type: 'integer', minimum: 1 },
      },
      required: ['itemID', 'text', 'quote', 'sourceID'],
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

      return Promise.resolve(
        toOutcome(
          staging.stage({
            op: 'remember',
            text: input.text,
            quote: input.quote,
            sourceSequence: input.sourceID,
            itemID: input.itemID,
          }),
        ),
      );
    },
  };
}

const editArguments = z.object({
  itemID: z.string(),
  text: z.string(),
  quote: z.string(),
  sourceID: z.int(),
});

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

const retireArguments = z.object({ itemID: z.string(), quote: z.string(), sourceID: z.int() });

function toOutcome(result: ReturnType<WriterStaging['stage']>): ToolOutcome {
  return result.status === 'staged' ? stagedResult : { status: 'error', message: result.reason };
}
