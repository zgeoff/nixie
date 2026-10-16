import type { Clock } from '@heynixie/clock';
import type { JSONObject } from '@heynixie/log';
import type { MemoryLineOptions, NextVersion } from '@heynixie/sessions';
import { renderMemoryLine } from '@heynixie/sessions';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { makeInputRecorder } from './make-input-recorder';
import { readItemIDs } from './read-item-ids';
import type { StartedMemoryStore } from './start-memory-store';
import type { ItemIDStore, RecallRequest, RecalledItem, RecalledVersion } from './types';

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
    text: { type: 'string' },
    about: {
      type: 'string',
      description:
        'where the version came from: its ID and version, its date, who noted it, what backs it ' +
        'and who confirmed it, and for a past version the version that replaced it',
    },
    quote: { type: 'string', description: 'the words the version came from' },
    model: { type: ['string', 'null'], description: 'the model that wrote the version' },
  },
  required: ['version', 'change', 'state', 'text', 'about', 'model'],
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

// What each item's line reads beside the item: the owner's name, or null for "the owner", the zone
// its date shows in, and the clock that says whether its year shows.
export interface RecallLineOptions {
  readonly ownerName: string | null;
  readonly defaultZone: string;
  readonly clock: Pick<Clock, 'now'>;
}

// Builds memory.recall, which declares read. The items hold every source that memory holds, so the
// result takes the most cautious one. Each version comes with the line that says where it came
// from. The model names items by short ID, or by an item ID it read before short IDs.
export function buildRecallTool(
  memory: Pick<StartedMemoryStore, 'recall'> & Pick<ItemIDStore, 'findItemIDs'>,
  options: RecallLineOptions,
): ToolDefinition {
  return {
    name: 'memory.recall',
    description:
      'Returns stored memory items word for word, each with a line that says its ID, version, ' +
      'date, who noted it, what backs it and who confirmed it, the quote it came from and the ' +
      'model that wrote it. Pass a query to search, itemIDs ' +
      'to read items by ID, or neither to list every active item a page at a time. Answer ' +
      'questions about memory from these items, never from a summary. Use it when you ' +
      'half-remember something said, or when a detail from before would change your answer.',
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
      const request = await readRecallRequest(memory, call.input, context.run.thread);
      const result = await memory.recall(request);

      const lines = {
        ownerName: options.ownerName,
        defaultZone: options.defaultZone,
        now: new Date(options.clock.now()),
      };

      // the record holds references, as the recall's own record does, so a forget leaves no
      // readable copy of what the model read
      return {
        status: 'ok',
        result: { items: result.items.map((item) => toItemJSON(item, lines)), next: result.next },
        record: {
          items: result.items.map((item) => ({ itemID: item.itemID, version: item.version })),
          next: result.next,
        },
      };
    },
  };
}

// the request a call makes, with each ID the model passed read as the item ID it names
async function readRecallRequest(
  memory: Pick<ItemIDStore, 'findItemIDs'>,
  callInput: unknown,
  thread: string,
): Promise<RecallRequest> {
  const input = recallArguments.parse(callInput);

  const itemIDs =
    input.itemIDs === undefined ? undefined : await readItemIDs(memory, input.itemIDs);

  return {
    ...(input.query === undefined ? {} : { query: input.query }),
    ...(itemIDs === undefined ? {} : { itemIDs }),
    ...(input.includeRetired === undefined ? {} : { includeRetired: input.includeRetired }),
    ...(input.includeHistory === undefined ? {} : { includeHistory: input.includeHistory }),
    ...(input.after === undefined ? {} : { after: input.after }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    thread,
  };
}

function toItemJSON(item: RecalledItem, lines: MemoryLineOptions): JSONObject {
  return {
    ...toVersionJSON(item, lines, null),
    itemID: item.shortID,
    isPinned: item.isPinned,
    ...(item.history === undefined
      ? {}
      : { history: item.history.map((version) => toPastVersionJSON(item, version, lines)) }),
  };
}

// a version from an item's history, which names the version after it, if any
function toPastVersionJSON(
  item: RecalledItem,
  version: RecalledVersion,
  lines: MemoryLineOptions,
): JSONObject {
  const after = item.history?.find((later) => later.version === version.version + 1);

  const next =
    after === undefined
      ? null
      : { ref: `${item.shortID} v${after.version}`, isRetirement: after.change === 'retired' };

  return toVersionJSON({ ...version, shortID: item.shortID }, lines, next);
}

// a version with the line under it, which for a past version names the version after it
function toVersionJSON(
  version: RecalledVersion & { readonly shortID: string },
  lines: MemoryLineOptions,
  next: NextVersion | null,
): JSONObject {
  return {
    version: version.version,
    change: version.change,
    state: version.state,
    text: version.text,
    about: renderMemoryLine(version, lines, next),
    ...(version.evidenceQuote === null ? {} : { quote: version.evidenceQuote }),
    model: version.model,
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
