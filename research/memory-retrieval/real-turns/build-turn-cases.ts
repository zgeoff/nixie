// Rebuilds each conversation turn from the plain export: the owner's messages that started it, the
// store as it stood when per-turn retrieval ran, what that retrieval logged, the versions that the
// session had already delivered, and any rating of it.
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

export interface LoggedItem {
  itemID: string;
  version: number;
  score?: number;
  similarity?: number;
}

export interface Rating {
  itemID: string;
  verdict: string;
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
  const session: SessionFold = { delivered: new Map(), pending: [], deliveredBefore: new Set() };

  let batch: string[] = [];
  let open: TurnCase | null = null;
  let isAfterRecallTool = false;

  for (const record of data.records) {
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

      if (batch.length > 0) {
        open = {
          caseID: '',
          stepSequence: record.sequence,
          recalledSequence: 0,
          recordedAt: Date.parse(record.recordedAt),
          query: batch.join('\n'),
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

    if (record.kind === 'memory.recalled' && open.recalledSequence === 0 && !isAfterRecallTool) {
      const items = record.payload['items'];

      open.recalledSequence = record.sequence;
      open.caseID = `t${record.sequence}`;
      open.logged = Array.isArray(items) ? items : [];
      open.searchMode = typeof record.payload['searchMode'] === 'string' ? record.payload['searchMode'] : null;
      open.delivered = [...session.deliveredBefore];
      open.candidates = collectCandidates(versionsByItem, itemsByID, record.sequence, open.recordedAt);
      open.ratings = ratings.get(record.sequence) ?? [];
      cases.push(open);
    }

    // A turn that opens a new session runs its retrieval with nothing delivered yet, and the
    // opening is logged after that retrieval.
    if (record.kind === 'model.session_opened' || record.kind === 'model.session_rebuilt') {
      open.delivered = [];
    }

    if (record.kind === 'model.reply') {
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

    const recalled = record.payload['recalledSequence'];
    const list = record.payload['ratings'];

    if (typeof recalled !== 'number' || !Array.isArray(list)) {
      continue;
    }

    const rated = byRecall.get(recalled) ?? [];

    for (const rating of list) {
      rated.push({
        itemID: rating.itemID,
        verdict: rating.verdict,
        note: notes.get(`${record.sequence}/${rating.itemID}`) ?? null,
      });
    }

    byRecall.set(recalled, rated);
  }

  return byRecall;
}

function collectCandidates(
  versionsByItem: Map<string, PlainVersion[]>,
  itemsByID: Map<string, PlainExport['items'][number]>,
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
      isPinned: item.is_pinned === 1 && item.pinned_sequence !== null && item.pinned_sequence < sequence,
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
  deliveredBefore: Set<string>;
}

// Follows the session-delivery replay in the sessions module: a turn's recalls count as delivered
// once its turn ends, and a new, rebuilt or compacted session starts the set again.
function foldSession(session: SessionFold, record: PlainRecord): void {
  const toRefs = (items: unknown): string[] =>
    Array.isArray(items) ? items.map((item) => `${item.itemID}@${item.version}`) : [];

  if (record.kind === 'task.step_started') {
    session.pending = [];
    session.deliveredBefore = new Set(session.delivered.keys());

    return;
  }

  if (record.kind === 'memory.recalled') {
    session.pending.push({ sequence: record.sequence, refs: toRefs(record.payload['items']) });

    return;
  }

  if (record.kind === 'model.turn_ended') {
    const through = typeof record.payload['recalledThrough'] === 'number' ? record.payload['recalledThrough'] : Number.MAX_SAFE_INTEGER;

    for (const ref of [
      ...session.pending.filter((recall) => recall.sequence <= through).flatMap((recall) => recall.refs),
      ...toRefs(record.payload['retrieved']),
    ]) {
      session.delivered.set(ref, ref);
    }

    session.pending = [];

    return;
  }

  if (record.kind === 'model.session_opened' || record.kind === 'model.session_rebuilt') {
    session.delivered = new Map();

    const reason = record.payload['reason'];
    const through = typeof record.payload['recalledThrough'] === 'number' ? record.payload['recalledThrough'] : Number.MAX_SAFE_INTEGER;

    if (reason === 'lost' || reason === 'missing') {
      session.pending = session.pending.filter((recall) => recall.sequence > through);
    }

    session.deliveredBefore = new Set();

    return;
  }

  if (record.kind === 'model.compacted' || record.kind === 'model.session_invalidated') {
    session.delivered = new Map();
    session.pending = [];
    session.deliveredBefore = new Set();
  }
}
