import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { ConsolidationStaging } from './create-consolidation-staging';
import type { MemoryStore } from './types';

// Builds the consolidator's 2 tools: recall, which declares read, and consolidate, which stages the
// run's one diff instead of applying it, so a session that dies leaves nothing behind and every
// change waits for your answer.
export function buildConsolidatorTools(
  store: Pick<MemoryStore, 'recall'>,
  staging: ConsolidationStaging,
  topItems: number,
): readonly ToolDefinition[] {
  return [buildRecallTool(store, staging, topItems), buildConsolidateTool(staging)];
}

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
  staging: ConsolidationStaging,
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
        staging.show(item.itemID, {
          shortID: item.shortID,
          version: item.version,
          text: item.text,
          source: item.source,
          isPinned: item.isPinned,
        });
      }
      return {
        status: 'ok',
        result: { items: result.items.map((item) => ({ itemID: item.shortID, text: item.text })) },
      };
    },
  };
}

const recallArguments = z.object({ query: z.string() });

// The diff in one call: each change names its items by the IDs the session read, and the host binds
// each to the version the session read. A refusal stages nothing, so the model fixes the diff and calls again.
function buildConsolidateTool(staging: ConsolidationStaging): ToolDefinition {
  return {
    name: 'memory.consolidate',
    description:
      'Proposes the whole tidy-up as one diff for the owner to review; call it once. Each change ' +
      'is a merge of 2 or more items that state one fact, with the merged text; a rewrite of one ' +
      'item into clearer words that keep its meaning, with the new text; or a retirement of one ' +
      'item that is stale or no longer useful, with no text. Name each item at most once, and ' +
      'give a short reason for each change. An empty list says nothing needs tidying.',
    input: consolidateInput,
    output: {
      type: 'object',
      properties: { staged: { type: 'integer' } },
      required: ['staged'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['changes'],
      results: { staged: 'owner_data' },
    },
    execution: 'direct',
    run: (call) => Promise.resolve(runConsolidate(staging, call.input)),
  };
}

const changeInput = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['merge', 'rewrite', 'retire'] },
    itemIDs: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string' } },
    text: { type: 'string', minLength: 1, maxLength: 2000 },
    reason: { type: 'string', minLength: 1, maxLength: 500 },
  },
  required: ['kind', 'itemIDs', 'reason'],
  additionalProperties: false,
};

const consolidateInput = {
  type: 'object',
  properties: { changes: { type: 'array', maxItems: 30, items: changeInput } },
  required: ['changes'],
  additionalProperties: false,
};

function runConsolidate(staging: ConsolidationStaging, input: unknown): ToolOutcome {
  const parsed = consolidateArguments.parse(input);
  const result = staging.stage(parsed.changes);

  return result.status === 'staged'
    ? { status: 'ok', result: { staged: result.changes } }
    : { status: 'error', message: result.reason };
}

const changeArguments = z.object({
  kind: z.enum(['merge', 'rewrite', 'retire']),
  itemIDs: z.array(z.string()),
  text: z.string().optional(),
  reason: z.string(),
});

const consolidateArguments = z.object({ changes: z.array(changeArguments) });
