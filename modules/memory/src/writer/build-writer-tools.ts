import type { JSONObject } from '@heynixie/log';
import { untilConventions } from '@heynixie/prompts';
import type { PolicyFactsResolution, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { MemoryWrites } from '../gate/gate-context';
import { writerSubjects } from '../subject/writer-subjects';
import type { MemoryStore } from '../types';
import { parseUntilInput } from '../utils/parse-until-input';
import { untilInputSchema } from '../utils/schema/until-input-schema';
import type { WriterStaging } from './create-writer-staging';

export type WriterToolStore = Pick<MemoryStore, 'recall'> & {
  readonly writes: Pick<MemoryWrites, 'readBatchSources'>;
};

export function buildWriterTools(
  store: WriterToolStore,
  staging: WriterStaging,
  topItems: number,
): readonly ToolDefinition[] {
  return [
    buildRecallTool(store, staging, topItems),
    buildRememberTool(store, staging),
    buildEditTool(store, staging),
    buildRetireTool(store, staging),
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
  store: WriterToolStore,
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
  isSensitive: z.boolean().optional(),
});

function buildRememberTool(store: WriterToolStore, staging: WriterStaging): ToolDefinition {
  return {
    name: 'memory.remember',
    description:
      'Stages one durable fact as a new memory item: about the owner (subject owner), or ' +
      'between the owner and the assistant (subject shared). To change a current item, use ' +
      'memory.edit. quote is the exact words from the owner message whose ID is sourceID. Pass ' +
      `until only when that message says when the fact stops being true. ${untilConventions} ` +
      'Pass isSensitive true for an address, a phone number, or an account or health detail: ' +
      'the item then waits for the owner to review it, and once kept it comes back only when ' +
      'a request needs it.',
    input: {
      type: 'object',
      properties: {
        subject: subjectInput,
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        quote: { type: 'string', minLength: 1, maxLength: 2000 },
        sourceID: { type: 'integer', minimum: 1 },
        until: untilInputSchema,
        isSensitive: { type: 'boolean' },
      },
      required: ['subject', 'text', 'quote', 'sourceID'],
      additionalProperties: false,
    },
    output: stagedOutput,
    declaration: {
      effects: ['memory_write'],
      destinations: [],
      amount: null,
      content: ['text', 'quote'],
      results: { staged: 'owner_data' },
    },
    execution: 'direct',
    resolvePolicyFacts: (rawInput) => {
      const input = rememberArguments.parse(rawInput);

      return readBatchFacts(store, staging, {
        rawInput,
        quote: input.quote,
        source: input.sourceID,
      });
    },
    run: (call, context) => {
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
            ...(input.isSensitive === true ? { isSensitive: true } : {}),
            ...(context.verdict === undefined ? {} : { verdict: context.verdict }),
          }),
        ),
      );
    },
  };
}

interface BatchFactsInput {
  readonly rawInput: JSONObject;
  readonly quote: string;
  readonly source: number;

  // set for a retirement, which leaves the subject to the item
  readonly itemID?: string;
}

// The sources come from the quote in the one message the call cites, and a retirement takes its
// subject from the item the writer was shown.
async function readBatchFacts(
  store: WriterToolStore,
  staging: WriterStaging,
  facts: BatchFactsInput,
): Promise<PolicyFactsResolution> {
  const message = staging.findSource(facts.source);

  const source =
    message === undefined ? 'outside' : await store.writes.readBatchSources(message, facts.quote);

  if (facts.itemID === undefined) {
    return { status: 'ok', sources: [source], args: facts.rawInput };
  }

  const shown = staging.findShown(facts.itemID);

  if (shown === undefined) {
    return {
      status: 'error',
      message: `item ${facts.itemID} is not one you were shown; find it with memory.recall first`,
    };
  }

  return { status: 'ok', sources: [source], args: { ...facts.rawInput, subject: shown.subject } };
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

function buildEditTool(store: WriterToolStore, staging: WriterStaging): ToolDefinition {
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
      effects: ['memory_write'],
      destinations: [],
      amount: null,
      content: ['text', 'quote'],
      results: { staged: 'owner_data' },
    },
    execution: 'direct',
    resolvePolicyFacts: (rawInput) => {
      const input = editArguments.parse(rawInput);

      return readBatchFacts(store, staging, {
        rawInput,
        quote: input.quote,
        source: input.sourceID,
      });
    },
    run: (call, context) => {
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
            ...(context.verdict === undefined ? {} : { verdict: context.verdict }),
          }),
        ),
      );
    },
  };
}

const retireArguments = z.object({ itemID: z.string(), quote: z.string(), sourceID: z.int() });

function buildRetireTool(store: WriterToolStore, staging: WriterStaging): ToolDefinition {
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
      effects: ['memory_write'],
      destinations: [],
      amount: null,
      content: ['quote'],
      results: { staged: 'owner_data' },
    },
    execution: 'direct',
    resolvePolicyFacts: (rawInput) => {
      const input = retireArguments.parse(rawInput);

      return readBatchFacts(store, staging, {
        rawInput,
        quote: input.quote,
        source: input.sourceID,
        itemID: input.itemID,
      });
    },
    run: (call, context) => {
      const input = retireArguments.parse(call.input);

      return Promise.resolve(
        toOutcome(
          staging.stage({
            op: 'retire',
            quote: input.quote,
            sourceSequence: input.sourceID,
            itemID: input.itemID,
            ...(context.verdict === undefined ? {} : { verdict: context.verdict }),
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
