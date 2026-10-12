import type { JSONObject } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import { StaleVersionError } from './stale-version-error';
import type {
  MemoryStore,
  Provenance,
  RecallRequest,
  RecalledItem,
  RecalledVersion,
} from './types';

// Builds the model's memory tools. recall declares read, and remember and retire declare note.
// Provenance comes from the run, never from the model's arguments, and a model write records
// outside content as its source until the write checks set it from the turn.
export function buildMemoryTools(store: MemoryStore): readonly ToolDefinition[] {
  return [buildRecallTool(store), buildRememberTool(store), buildRetireTool(store)];
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
    after: { type: 'string', description: 'the next cursor from the page before' },
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

const versionOutput = {
  type: 'object',
  properties: { itemID: { type: 'string' }, version: { type: 'integer' } },
  required: ['itemID', 'version'],
  additionalProperties: false,
};

// The items hold every source that memory holds, so the result takes the most cautious one.
function buildRecallTool(store: MemoryStore): ToolDefinition {
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
      const result = await store.recall(request);

      return {
        status: 'ok',
        result: { items: result.items.map((item) => toItemJSON(item)), next: result.next },
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

function buildRememberTool(store: MemoryStore): ToolDefinition {
  return {
    name: 'memory.remember',
    description:
      'Stores one fact as a new memory item, or edits an item when you pass its itemID and the ' +
      'version you read. An edit fails as stale when the item changed after you read it. Set pin ' +
      'to put a new item in the pinned core.',
    input: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        itemID: { type: 'string' },
        version: { type: 'integer', minimum: 1 },
        pin: { type: 'boolean' },
      },
      required: ['text'],
      dependentRequired: { itemID: ['version'], version: ['itemID'] },
      additionalProperties: false,
    },
    output: versionOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['text'],
      results: { itemID: 'owner_data', version: 'owner_data' },
    },
    execution: 'direct',
    run: (call, context) =>
      runStoreCall(() => {
        const input = rememberArguments.parse(call.input);

        return store.remember({
          text: input.text,
          provenance: buildProvenance(context),
          ...(input.itemID === undefined || input.version === undefined
            ? {}
            : { target: { itemID: input.itemID, version: input.version } }),
          ...(input.pin === undefined ? {} : { isPinned: input.pin }),
        });
      }),
  };
}

const rememberArguments = z.object({
  text: z.string(),
  itemID: z.string().optional(),
  version: z.int().optional(),
  pin: z.boolean().optional(),
});

function buildRetireTool(store: MemoryStore): ToolDefinition {
  return {
    name: 'memory.retire',
    description:
      'Retires a memory item that stopped being true, such as an old address, by its itemID and ' +
      'the version you read. A retired item keeps its history and can be restored by the owner.',
    input: {
      type: 'object',
      properties: { itemID: { type: 'string' }, version: { type: 'integer', minimum: 1 } },
      required: ['itemID', 'version'],
      additionalProperties: false,
    },
    output: versionOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { itemID: 'owner_data', version: 'owner_data' },
    },
    execution: 'direct',
    run: (call: ToolCall, context: ToolContext) =>
      runStoreCall(() => {
        const input = retireArguments.parse(call.input);

        return store.retire({
          target: { itemID: input.itemID, version: input.version },
          provenance: buildProvenance(context),
        });
      }),
  };
}

const retireArguments = z.object({ itemID: z.string(), version: z.int() });

function buildProvenance(context: ToolContext): Provenance {
  const thread = context.run.thread;

  return {
    origin: thread === conversationTaskID ? 'conversation' : 'task',
    source: 'untrusted',
    taskID: thread,
    proposalID: null,
    checks: null,
    thread,
  };
}

// A stale version, a missing item or a wrong state is the model's to read and act on; any other
// failure propagates.
async function runStoreCall(
  call: () => Promise<{ readonly itemID: string; readonly version: number }>,
): Promise<ToolOutcome> {
  try {
    const ref = await call();

    return { status: 'ok', result: { itemID: ref.itemID, version: ref.version } };
  } catch (error) {
    if (
      error instanceof StaleVersionError ||
      error instanceof MemoryItemNotFoundError ||
      error instanceof MemoryStateError
    ) {
      return { status: 'error', message: error.message };
    }
    throw error;
  }
}
