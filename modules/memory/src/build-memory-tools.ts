import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildRememberTool } from './build-remember-tool';
import { buildRetireTool } from './build-retire-tool';
import { makeInputRecorder } from './make-input-recorder';
import type { StartedMemoryStore } from './start-memory-store';
import type { RecallRequest, RecalledItem, RecalledVersion } from './types';

// What the model's tools reach: recall, and the gated write paths.
export type MemoryToolStore = Pick<StartedMemoryStore, 'recall' | 'writes'>;

// Builds the model's memory tools. recall declares read, and remember and retire declare note.
// Every write runs through its gate, which sets the provenance from the run and the checks, never
// from the model's arguments.
export function buildMemoryTools(memory: MemoryToolStore): readonly ToolDefinition[] {
  return [buildRecallTool(memory), buildRememberTool(memory), buildRetireTool(memory)];
}

const recallInput = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'words to search for in memory items' },
    itemIDs: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 100,
      description: 'the IDs of the items to read',
    },
    includeRetired: { type: 'boolean', description: 'also return retired items' },
    includeHistory: { type: 'boolean', description: 'also return every version of each item' },
    after: {
      type: 'string',
      pattern: '^[0-9]+$',
      description: 'the next cursor from the page before',
    },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
  },
  additionalProperties: false,
};

const recalledVersion = {
  type: 'object',
  properties: {
    version: { type: 'integer' },
    change: { type: 'string' },
    state: { type: 'string' },
    origin: { type: 'string' },
    source: { type: 'string' },
    recordedAt: { type: 'integer' },
    text: { type: 'string' },
  },
  required: ['version', 'change', 'state', 'origin', 'source', 'recordedAt', 'text'],
};

const recallOutput = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        ...recalledVersion,
        properties: {
          ...recalledVersion.properties,
          itemID: { type: 'string' },
          isPinned: { type: 'boolean' },
          history: { type: 'array', items: recalledVersion },
        },
        required: [...recalledVersion.required, 'itemID', 'isPinned'],
      },
    },
    next: { type: ['string', 'null'] },
  },
  required: ['items', 'next'],
  additionalProperties: false,
};

// The items hold every source that memory holds, so the result takes the most cautious one.
function buildRecallTool(memory: MemoryToolStore): ToolDefinition {
  return {
    name: 'memory.recall',
    description:
      'Returns stored memory items word for word, each with its ID, version, origin, source and ' +
      'date. Pass a query to search, itemIDs to read items by ID, or neither to list every active ' +
      'item a page at a time. Answer questions about memory from these items, never from a summary.',
    input: recallInput,
    output: recallOutput,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: ['query'],
      results: { items: 'untrusted', next: 'owner_data' },
    },
    execution: 'direct',

    // the model can search with an item's own words
    recordInput: makeInputRecorder(['query']),
    run: async (call, context) => {
      const input = recallArguments.parse(call.input);
      const request: RecallRequest = {
        ...(input.query === undefined ? {} : { query: input.query }),
        ...(input.itemIDs === undefined ? {} : { itemIDs: input.itemIDs }),
        ...(input.includeRetired === undefined ? {} : { includeRetired: input.includeRetired }),
        ...(input.includeHistory === undefined ? {} : { includeHistory: input.includeHistory }),
        ...(input.after === undefined ? {} : { after: input.after }),
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        thread: context.run.thread,
      };
      const result = await memory.recall(request);

      // the record holds references, as the recall's own record does, so a forget leaves no
      // readable copy of what the model read
      return {
        status: 'ok',
        result: { items: result.items.map((item) => toItemJSON(item)), next: result.next },
        record: {
          items: result.items.map((item) => ({ itemID: item.itemID, version: item.version })),
          next: result.next,
        },
      };
    },
  };
}

function toItemJSON(item: RecalledItem): JSONObject {
  return {
    ...toVersionJSON(item),
    itemID: item.itemID,
    isPinned: item.isPinned,
    ...(item.history === undefined ? {} : { history: item.history.map((v) => toVersionJSON(v)) }),
  };
}

function toVersionJSON(version: RecalledVersion): JSONObject {
  return {
    version: version.version,
    change: version.change,
    state: version.state,
    origin: version.origin,
    source: version.source,
    recordedAt: version.recordedAt,
    text: version.text,
  };
}

const recallArguments = z.object({
  query: z.string().optional(),
  itemIDs: z.array(z.string()).optional(),
  includeRetired: z.boolean().optional(),
  includeHistory: z.boolean().optional(),
  after: z.string().optional(),
  limit: z.int().optional(),
});
