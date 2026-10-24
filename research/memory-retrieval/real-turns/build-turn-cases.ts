// Rebuilds each conversation turn from the plain export: the owner's messages that started it, the
// store as it stood when per-turn retrieval ran, what that retrieval logged, the versions that the
// session had already delivered, and any rating of it.
import { z } from 'zod';
import type { PlainExport, PlainRecord, PlainVersion } from './read-plain-export.ts';
import { readErasableText } from './read-plain-export.ts';

export interface Candidate {
  itemID: string;
  version: number;
  isSelf: boolean;
  isPinned: boolean;
  isLapsed: boolean;
  text: string;
}

// The fields this rebuild reads from the payloads, in the shapes the product's record codecs give.
const itemRefSchema = z.object({ itemID: z.string(), version: z.int().positive() });

const loggedItemSchema = itemRefSchema.extend({
  score: z.number().exactOptional(),
  similarity: z.number().exactOptional(),
});

export type LoggedItem = z.infer<typeof loggedItemSchema>;

const recalledSchema = z.object({
  items: z.array(loggedItemSchema),
  searchMode: z.string().exactOptional(),
  isTurnNote: z.literal(true).exactOptional(),
});

// Turn records written before the product logged its retrieved items lack the field, and the
// session-delivery replay reads a missing field as no items.
const turnEndedSchema = z.object({ retrieved: z.array(itemRefSchema).exactOptional() });

const ratedSchema = z.object({
  recalledSequence: z.int(),
  ratings: z.array(z.object({ itemID: z.string(), verdict: z.enum(['helpful', 'noise', 'misleading']) })),
});

export interface Rating {
  itemID: string;
  verdict: z.infer<typeof ratedSchema>['ratings'][number]['verdict'];
  note: string | null;
}

export interface Exchange {
  owner: string;
  reply: string;
}

export interface TurnCase {
  caseID: string;
  stepSequence: number;
  recalledSequence: number;
  recordedAt: number;
  query: string;
  reply: string;
  earlier: Exchange[];
  candidates: Candidate[];
  logged: LoggedItem[];
  searchMode: string | null;
  delivered: string[];
  ratings: Rating[];
}

const conversationThread = 'conversation';
const earlierExchanges = 2;

export function buildTurnCases(data: PlainExport): TurnCase[] {
  const versionsByItem = Map.groupBy(data.versions, (version) => version.item_id);
  const itemsByID = new Map(data.items.map((item) => [item.item_id, item]));
  const ratings = collectRatings(data);

  const cases: TurnCase[] = [];
  const exchanges: Exchange[] = [];
  const session: SessionFold = { delivered: new Map(), pending: [], isCompacted: false };
  const pinned = new Set<string>();

  let batch: string[] = [];
  let open: TurnCase | null = null;
  let isAfterRecallTool = false;
  let hasReply = false;

  for (const record of data.records) {
    foldPins(pinned, record);

    if (record.thread !== conversationThread) {
      continue;
    }

    foldSession(session, record);

    if (record.kind === 'owner_message') {
      const text = readErasableText(record);

      if (text !== null) {
        batch.push(text);
      }

      continue;
    }

    if (record.kind === 'task.step_started') {
      if (open !== null) {
        closeTurn(open, exchanges);
      }

      open = null;
      isAfterRecallTool = false;
      hasReply = false;

      // Per-turn retrieval runs only when the batch's joined text holds more than whitespace.
      const query = batch.join('\n');

      if (query.trim() !== '') {
        open = {
          caseID: '',
          stepSequence: record.sequence,
          recalledSequence: 0,
          recordedAt: Date.parse(record.recordedAt),
          query,
          reply: '',
          earlier: exchanges.slice(-earlierExchanges),
          candidates: [],
          logged: [],
          searchMode: null,
          delivered: [],
          ratings: [],
        };
      }

      batch = [];
      continue;
    }

    if (open === null) {
      continue;
    }

    if (record.kind === 'tool_called' && record.payload['tool'] === 'memory.recall') {
      isAfterRecallTool = true;
    }

    // A turn whose session was lost retrieves again for the rebuilt session, and the model sees
    // only the later retrieval, so a later recall before the first reply replaces an earlier one.
    const recalled = record.kind === 'memory.recalled' ? parsePayload(recalledSchema, record) : null;

    if (recalled !== null && recalled.isTurnNote !== true && !isAfterRecallTool && !hasReply) {
      if (open.recalledSequence === 0) {
        open.caseID = `t${record.sequence}`;
        cases.push(open);
      }

      open.recalledSequence = record.sequence;
      open.logged = recalled.items;
      open.searchMode = recalled.searchMode ?? null;
      open.delivered = [...session.delivered.keys()];
      open.candidates = collectCandidates(versionsByItem, itemsByID, pinned, record.sequence, open.recordedAt);
      open.ratings = [...open.ratings, ...(ratings.get(record.sequence) ?? [])];
    }

    // A turn that opens a new session runs its retrieval with nothing delivered yet, and the
    // opening is logged after that retrieval.
    if (record.kind === 'model.session_opened' || record.kind === 'model.session_rebuilt') {
      open.delivered = [];
    }

    if (record.kind === 'model.reply') {
      hasReply = true;

      const text = readErasableText(record);

      if (text !== null) {
        open.reply = open.reply === '' ? text : `${open.reply}\n${text}`;
      }
    }
  }

  if (open !== null) {
    closeTurn(open, exchanges);
  }

  return cases;
}

// Follows the pinned column of the memory items projection: a pin record sets or clears it, and a
// retired version or a forget clears it.
function foldPins(pinned: Set<string>, record: PlainRecord): void {
  const itemID = record.payload['itemID'];

  if (typeof itemID !== 'string') {
    return;
  }

  if (record.kind === 'memory.pinned') {
    if (record.payload['isPinned'] === true) {
      pinned.add(itemID);
    } else {
      pinned.delete(itemID);
    }
  }

  if (record.kind === 'memory.forget_started') {
    pinned.delete(itemID);
  }

  if (record.kind === 'memory.version_added' && record.payload['state'] === 'retired') {
    pinned.delete(itemID);
  }
}

function closeTurn(turn: TurnCase, exchanges: Exchange[]): void {
  exchanges.push({ owner: turn.query, reply: turn.reply });
}

function collectRatings(data: PlainExport): Map<number, Rating[]> {
  const notes = new Map(data.notes.map((note) => [`${note.sequence}/${note.itemID}`, note.text ?? null]));
  const byRecall = new Map<number, Rating[]>();

  for (const record of data.records) {
    if (record.kind !== 'memory.rated') {
      continue;
    }

    const parsed = parsePayload(ratedSchema, record);
    const rated = byRecall.get(parsed.recalledSequence) ?? [];

    for (const rating of parsed.ratings) {
      rated.push({
        itemID: rating.itemID,
        verdict: rating.verdict,
        note: notes.get(`${record.sequence}/${rating.itemID}`) ?? null,
      });
    }

    byRecall.set(parsed.recalledSequence, rated);
  }

  return byRecall;
}

function collectCandidates(
  versionsByItem: Map<string, PlainVersion[]>,
  itemsByID: Map<string, PlainExport['items'][number]>,
  pinned: Set<string>,
  sequence: number,
  now: number,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const [itemID, versions] of versionsByItem) {
    const current = versions
      .filter((version) => version.sequence < sequence)
      .toSorted((first, second) => second.version - first.version)[0];

    const item = itemsByID.get(itemID);

    if (current === undefined || item === undefined || current.state !== 'active' || current.text === undefined) {
      continue;
    }

    candidates.push({
      itemID,
      version: current.version,
      isSelf: (item.subject ?? (item.kind === 'self' ? 'self' : 'owner')) === 'self',
      isPinned: pinned.has(itemID),
      isLapsed: current.until !== null && current.until <= now,
      text: current.text,
    });
  }

  return candidates;
}

interface PendingRecall {
  sequence: number;
  refs: string[];
}

interface SessionFold {
  delivered: Map<string, string>;
  pending: PendingRecall[];
  isCompacted: boolean;
}

// Follows the session-delivery replay in the sessions module: a turn's recalls count as delivered
// once its turn ends, up to the sequence the turn says it recalled through, and a new, rebuilt,
// compacted or invalidated session starts the set again.
function foldSession(session: SessionFold, record: PlainRecord): void {
  const toRefs = (items: readonly z.infer<typeof itemRefSchema>[]): string[] =>
    items.map((item) => `${item.itemID}@${item.version}`);

  const through =
    typeof record.payload['recalledThrough'] === 'number' ? record.payload['recalledThrough'] : Number.MAX_SAFE_INTEGER;

  if (record.kind === 'memory.recalled') {
    session.pending.push({ sequence: record.sequence, refs: toRefs(parsePayload(recalledSchema, record).items) });
  } else if (record.kind === 'model.turn_ended') {
    const retrieved = session.isCompacted ? [] : toRefs(parsePayload(turnEndedSchema, record).retrieved ?? []);
    const recalled = session.pending.filter((recall) => recall.sequence <= through).flatMap((recall) => recall.refs);

    for (const ref of [...recalled, ...retrieved]) {
      session.delivered.set(ref, ref);
    }

    session.pending = [];
  } else if (record.kind === 'task.step_started') {
    session.pending = [];
    session.isCompacted = false;
  } else if (record.kind === 'model.session_opened' || record.kind === 'model.session_rebuilt') {
    const reason = record.payload['reason'];

    session.delivered = new Map();

    if (reason === 'lost' || reason === 'missing') {
      session.pending = session.pending.filter((recall) => recall.sequence > through);
    }
  } else if (record.kind === 'model.compacted') {
    session.delivered = new Map();
    session.pending = session.pending.filter((recall) => recall.sequence > through);
    session.isCompacted = true;
  } else if (record.kind === 'model.session_invalidated') {
    session.delivered = new Map();
    session.pending = [];
  }
}

// A payload that fails its schema stops the rebuild with the record's sequence and kind, and with no
// value from the payload, because the log holds the user's own data.
function parsePayload<Schema extends z.ZodType>(schema: Schema, record: PlainRecord): z.output<Schema> {
  const parsed = schema.safeParse(record.payload);

  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join('.') || '(payload)');

    throw new Error(`record ${record.sequence} (${record.kind}) does not match its schema at ${paths.join(', ')}`);
  }

  return parsed.data;
}
