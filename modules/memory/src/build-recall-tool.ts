import type { Clock } from '@heynixie/clock';
import type { JSONObject } from '@heynixie/log';
import type { MemoryLineOptions, NextVersion } from '@heynixie/sessions';
import { renderMemoryLine } from '@heynixie/sessions';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { makeInputRecorder } from './make-input-recorder';
import { readItemIDs } from './read-item-ids';
import type { MomentLink } from './read-moment-links';
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
          subject: {
            type: 'string',
            enum: ['owner', 'self', 'shared'],
            description:
              'owner for a fact about the owner, shared for something between the owner and you, such as ' +
              'a deal, a nickname or a running joke, self for a self-note you wrote about yourself',
          },
          history: { type: 'array', items: recalledVersion },
          moments: {
            type: 'array',
            description: 'the moments linked to the item, each by its momentID and title',
            items: {
              type: 'object',
              properties: { momentID: { type: 'string' }, title: { type: 'string' } },
              required: ['momentID', 'title'],
            },
          },
        },
        required: [...recalledVersion.required, 'itemID', 'isPinned', 'subject'],
      },
    },
    next: { type: ['string', 'null'] },
  },
  required: ['items', 'next'],
  additionalProperties: false,
};

export interface RecallLineOptions {
  readonly ownerName: string | null;
  readonly defaultZone: string;
  readonly clock: Pick<Clock, 'now'>;
}

export function buildRecallTool(
  memory: Pick<StartedMemoryStore, 'recall' | 'moments'> & Pick<ItemIDStore, 'readItemIDMap'>,
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
      'half-remember something said, or when a detail from before would change your answer. ' +
      'An item linked to a moment lists its momentID and title: read the moment with ' +
      'moment.read when the reason behind the fact matters.',
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

    recordInput: makeInputRecorder(['query']),
    run: async (call, context) => {
      const request = await readRecallRequest(memory, call.input, context.run.thread);
      const result = await memory.recall(request);
      const links = await memory.moments.readLinks(result.items.map((item) => item.itemID));

      const lines = {
        ownerName: options.ownerName,
        defaultZone: options.defaultZone,
        now: new Date(options.clock.now()),
      };

      return {
        status: 'ok',
        result: {
          items: result.items.map((item) => toItemJSON(item, lines, links.get(item.itemID) ?? [])),
          next: result.next,
        },
        record: {
          items: result.items.map((item) => toItemRecord(item, links.get(item.itemID) ?? [])),
          next: result.next,
        },
      };
    },
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

async function readRecallRequest(
  memory: Pick<ItemIDStore, 'readItemIDMap'>,
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

function toItemJSON(
  item: RecalledItem,
  lines: MemoryLineOptions,
  links: readonly MomentLink[],
): JSONObject {
  return {
    ...toVersionJSON(item, lines, null),
    itemID: item.shortID,
    isPinned: item.isPinned,
    subject: item.subject,
    ...(item.history === undefined
      ? {}
      : { history: item.history.map((version) => toPastVersionJSON(item, version, lines)) }),
    ...(links.length === 0
      ? {}
      : { moments: links.map((link) => ({ momentID: link.momentID, title: link.title })) }),
  };
}

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

// The record names each linked moment by ID only, so a destroy leaves no copy of its title here.
function toItemRecord(item: RecalledItem, links: readonly MomentLink[]): JSONObject {
  return {
    itemID: item.itemID,
    version: item.version,
    ...(links.length === 0 ? {} : { momentIDs: links.map((link) => link.momentID) }),
  };
}
