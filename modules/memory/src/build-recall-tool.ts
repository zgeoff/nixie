import type { Clock } from '@heynixie/clock';
import type { JSONObject } from '@heynixie/log';
import type { MemoryLineOptions, NextVersion } from '@heynixie/sessions';
import { renderMemoryLine } from '@heynixie/sessions';
import type { ToolCall, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { recallPageLimitBytes } from '@heynixie/wire';
import { z } from 'zod';
import type { MomentStore } from './build-moment-store';
import { makeInputRecorder } from './make-input-recorder';
import { readItemIDs } from './read-item-ids';
import type { MomentLink } from './read-moment-links';
import { recallLimits } from './recall-limits';
import type { StartedMemoryStore } from './start-memory-store';
import type {
  ItemIDStore,
  OmittedItem,
  RecallOmitted,
  RecallRequest,
  RecallResult,
  RecalledItem,
  RecalledVersion,
} from './types';

// Long enough for a UUID.
const itemIDMaxLength = 64;

const recallInput = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'words to search for in memory items' },
    itemIDs: {
      type: 'array',
      items: { type: 'string', maxLength: itemIDMaxLength },
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
    subjects: {
      type: 'array',
      items: { type: 'string', enum: ['owner', 'self', 'shared'] },
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      description: 'return only the items of these subjects',
    },
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
    image: {
      type: 'object',
      description:
        "the owner's photo the version came from: the eventID of the message that holds it and " +
        'its number, which log.read_image opens',
      properties: { eventID: { type: 'string' }, number: { type: 'integer' } },
      required: ['eventID', 'number'],
    },
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
    searched: {
      type: 'object',
      description: 'the search of the call, copied: its query or itemIDs, and its subjects',
      properties: {
        query: { type: 'string' },
        itemIDs: { type: 'array', items: { type: 'string' } },
        subjects: { type: 'array', items: { type: 'string', enum: ['owner', 'self', 'shared'] } },
      },
      additionalProperties: false,
    },
    leftOut: {
      type: 'object',
      description: 'what the page leaves out because it is capped in size',
      properties: {
        count: { type: 'integer', description: 'the items the result leaves out' },
        itemIDs: {
          type: 'array',
          items: { type: 'string' },
          description: 'the IDs of the items left out, to recall',
        },
        versions: {
          type: 'integer',
          description: 'the past versions of the first item that the result leaves out',
        },
      },
      required: ['count', 'itemIDs', 'versions'],
      additionalProperties: false,
    },
  },
  required: ['items', 'searched'],
  additionalProperties: false,
};

export interface RecallLineOptions {
  readonly ownerName: string | null;
  readonly defaultZone: string;
  readonly clock: Pick<Clock, 'now'>;
}

export function buildRecallTool(
  memory: Pick<StartedMemoryStore, 'recall'> &
    Pick<ItemIDStore, 'readItemIDMap'> & {
      readonly moments: Pick<MomentStore, 'readLinks'>;
    },
  options: RecallLineOptions,
): ToolDefinition {
  return {
    name: 'memory.recall',
    description:
      'Returns stored memory items word for word, each with a line that says its ID, version, ' +
      'date, who noted it, what backs it and who confirmed it, the quote it came from and the ' +
      'model that wrote it. Pass a query to search, itemIDs ' +
      'to read items by ID, or neither to list every active item a page at a time. Pass one ' +
      'of query and itemIDs in a call, never both. Pass subjects to narrow the recall to ' +
      'some subjects. A page is capped in size: leftOut says how many items it left out and ' +
      'lists their IDs. For a list, next continues from the first item left out. For itemIDs ' +
      'or a query, recall the IDs in leftOut.itemIDs to read them. An empty items list means ' +
      'the search found nothing. Answer ' +
      'questions about memory from these items, never from a summary. Use it when you ' +
      'half-remember something said, or when a detail from before would change your answer. ' +
      'An item linked to a moment lists its momentID and title: read the moment with ' +
      'moment.read when the reason behind the fact matters. A version made from a photo the ' +
      'owner attached names that image: open it with log.read_image when seeing it would ' +
      'change your answer.',
    input: recallInput,
    output: recallOutput,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: ['query'],
      results: {
        items: 'untrusted',
        next: 'owner_data',
        searched: 'owner_data',
        leftOut: 'owner_data',
      },
    },
    execution: 'direct',

    recordInput: makeInputRecorder(['query']),
    run: (call, context) => runRecallCall(memory, options, { call, thread: context.run.thread }),
  };
}

interface RecallCall {
  readonly call: ToolCall;
  readonly thread: string;
}

type RecallDependencies = Pick<StartedMemoryStore, 'recall'> &
  Pick<ItemIDStore, 'readItemIDMap'> & { readonly moments: Pick<MomentStore, 'readLinks'> };

const recallArguments = z.object({
  query: z.string().optional(),
  itemIDs: z.array(z.string().max(itemIDMaxLength)).optional(),
  includeRetired: z.boolean().optional(),
  includeHistory: z.boolean().optional(),
  after: z.string().optional(),
  limit: z.int().optional(),
  subjects: z
    .array(z.enum(['owner', 'self', 'shared']))
    .min(1)
    .max(3)
    .refine((subjects) => new Set(subjects).size === subjects.length)
    .optional(),
});

async function runRecallCall(
  memory: RecallDependencies,
  options: RecallLineOptions,
  recall: RecallCall,
): Promise<ToolOutcome> {
  const input = recallArguments.parse(recall.call.input);
  const refusal = pickRefusal(input);

  if (refusal !== null) {
    return { status: 'error', message: refusal };
  }

  const lines = {
    ownerName: options.ownerName,
    defaultZone: options.defaultZone,
    now: new Date(options.clock.now()),
  };

  const readRendered = makeItemReader(memory, lines);
  const searched = buildSearched(input);

  const itemIDs =
    input.itemIDs === undefined ? undefined : await readItemIDs(memory, input.itemIDs);

  const result = await memory.recall({
    ...buildRecallRequest(input, itemIDs, recall.thread),
    byteBudget: recallPageLimitBytes - measureEnvelope(input, searched),
    measureItem: async (item) => {
      const rendered = await readRendered(item);

      return Buffer.byteLength(JSON.stringify(rendered.json));
    },
  });

  const entries = await Promise.all(result.items.map((item) => readRendered(item)));

  const body = buildBody(result, entries, searched);
  const [first] = result.items;
  const isOversized = Buffer.byteLength(JSON.stringify(body)) > recallPageLimitBytes;

  const fitted =
    first === undefined || !isOversized
      ? { body, links: entries.map((entry) => entry.links) }
      : fitFirstItem(body, { item: first, links: entries[0]?.links ?? [], lines });

  return {
    status: 'ok',
    result: fitted.body,
    record: {
      items: result.items.map((item, index) => toItemRecord(item, fitted.links[index] ?? [])),
      next: result.next,
      ...buildLeftOut(result.omitted, 'itemID'),
    },
  };
}

type RecallInput = z.infer<typeof recallArguments>;

function pickRefusal(input: RecallInput): string | null {
  if (input.query !== undefined && input.itemIDs !== undefined) {
    return 'refused: pass either query or itemIDs in one call, never both';
  }

  if (input.after !== undefined && (input.query !== undefined || input.itemIDs !== undefined)) {
    return 'refused: after continues a list, so pass it with neither query nor itemIDs';
  }

  return null;
}

interface RenderedItem {
  readonly json: JSONObject;
  readonly links: readonly MomentLink[];
}

// The rendering that the measure reads is the one the result returns, so a later clock reading
// cannot change a size after the store counted it.
function makeItemReader(
  memory: Pick<RecallDependencies, 'moments'>,
  lines: MemoryLineOptions,
): (item: RecalledItem) => Promise<RenderedItem> {
  const rendered = new Map<RecalledItem, Promise<RenderedItem>>();

  const readFresh = async (item: RecalledItem): Promise<RenderedItem> => {
    const links = await memory.moments.readLinks([item.itemID]);

    const itemLinks = links.get(item.itemID) ?? [];

    return { json: toItemJSON(item, lines, itemLinks), links: itemLinks };
  };

  return (item) => {
    const cached = rendered.get(item);

    if (cached !== undefined) {
      return cached;
    }

    const pending = readFresh(item);

    rendered.set(item, pending);

    return pending;
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
    ...(version.image === null
      ? {}
      : {
          image: { eventID: String(version.image.messageSequence), number: version.image.image },
        }),
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

const searchedQueryLength = 200;

// JSON escaping can grow a character to 6 bytes, so the echoed search is cut by its escaped size.
const searchedLimitBytes = 4000;

function buildSearched(input: RecallInput): JSONObject {
  const searched = {
    ...(input.query === undefined ? {} : { query: input.query.slice(0, searchedQueryLength) }),
    ...(input.itemIDs === undefined ? {} : { itemIDs: input.itemIDs }),
    ...(input.subjects === undefined ? {} : { subjects: input.subjects }),
  };

  if (searched.itemIDs === undefined) {
    return searched;
  }

  // Drop IDs from the end until the escaped echo fits, so the envelope never passes the page limit.
  let count = searched.itemIDs.length;

  while (
    count > 0 &&
    Buffer.byteLength(JSON.stringify({ ...searched, itemIDs: searched.itemIDs.slice(0, count) })) >
      searchedLimitBytes
  ) {
    count -= 1;
  }

  return { ...searched, itemIDs: searched.itemIDs.slice(0, count) };
}

function buildRecallRequest(
  input: RecallInput,
  itemIDs: readonly string[] | undefined,
  thread: string,
): RecallRequest {
  return {
    ...(input.query === undefined ? {} : { query: input.query }),
    ...(itemIDs === undefined ? {} : { itemIDs }),
    ...(input.includeRetired === undefined ? {} : { includeRetired: input.includeRetired }),
    ...(input.includeHistory === undefined ? {} : { includeHistory: input.includeHistory }),
    ...(input.after === undefined ? {} : { after: input.after }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.subjects === undefined ? {} : { subjects: input.subjects }),
    thread,
  };
}

const shortIDLength = 10;

// The bytes of the result without its items, with `leftOut` and `next` at the most they can take.
function measureEnvelope(input: RecallInput, searched: JSONObject): number {
  const isList = input.query === undefined && input.itemIDs === undefined;
  const limit = Math.min(input.limit ?? recallLimits.default, recallLimits.max);
  const namedCount = input.itemIDs?.length ?? limit;

  // `leftOut` lists short IDs only, so a long ID the model passed never reaches it.
  const unlistedIDs = isList
    ? []
    : Array.from({ length: namedCount }, () => 'x'.repeat(shortIDLength));

  return Buffer.byteLength(
    JSON.stringify({
      items: [],
      next: isList ? '9'.repeat(20) : null,
      searched,
      leftOut: { count: 999_999, itemIDs: unlistedIDs, versions: 999_999 },
    }),
  );
}

function buildBody(
  result: RecallResult,
  entries: readonly RenderedItem[],
  searched: JSONObject,
): JSONObject {
  const isEmpty = result.items.length === 0 && result.next === null;

  return {
    items: entries.map((entry) => entry.json),
    ...(isEmpty ? {} : { next: result.next }),
    searched,
    ...buildLeftOut(result.omitted, 'shortID'),
  };
}

function buildLeftOut(omitted: RecallOmitted, idKey: keyof OmittedItem): JSONObject {
  if (omitted.count === 0 && omitted.versions === 0) {
    return {};
  }

  return {
    leftOut: {
      count: omitted.count,
      itemIDs: omitted.items.map((item) => item[idKey]),
      versions: omitted.versions,
    },
  };
}

interface OversizedItem {
  readonly item: RecalledItem;
  readonly links: readonly MomentLink[];
  readonly lines: MemoryLineOptions;
}

interface FittedResult {
  readonly body: JSONObject;
  readonly links: readonly (readonly MomentLink[])[];
}

// The record names each moment link by ID, so the links the result keeps are the links it records.
function fitFirstItem(body: JSONObject, oversized: OversizedItem): FittedResult {
  let links = oversized.links;
  let candidate = body;

  while (links.length > 0 && Buffer.byteLength(JSON.stringify(candidate)) > recallPageLimitBytes) {
    links = links.slice(0, -1);
    candidate = { ...body, items: [toItemJSON(oversized.item, oversized.lines, links)] };
  }

  return { body: candidate, links: [links] };
}

// The record names each linked moment by ID only, so a destroy leaves no copy of its title here.
function toItemRecord(item: RecalledItem, links: readonly MomentLink[]): JSONObject {
  return {
    itemID: item.itemID,
    version: item.version,
    ...(links.length === 0 ? {} : { momentIDs: links.map((link) => link.momentID) }),
  };
}
