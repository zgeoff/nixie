import { readSessionSummary } from '@heynixie/compaction';
import type { TasksContext } from '@heynixie/tasks';
import type { SystemMessageType } from '@heynixie/wire';
import { renderSystemMessage } from '@heynixie/wire';
import type { StatusRegistry } from './build-status-registry';
import { formatMessageTime } from './format-message-time';
import { readRecalledThrough } from './read-recalled-through';
import type { HistoryTurn } from './read-recent-turns';
import { readRecentTurns } from './read-recent-turns';
import { readTurnNoteRange } from './read-turn-note-range';
import { renderSessionHistory } from './render-session-history';
import type { ConversationRun, MessageTimeOptions, SessionStart, TurnNote } from './types';

export interface SessionOpeningQuery {
  readonly taskID: string;
  readonly start: SessionStart;

  // the turn's first inbox record, which the recent turns never reach
  readonly beforeSequence: number;

  // the budget, in tokens, of the recent turns
  readonly rebuildTokens: number;
  readonly times: MessageTimeOptions;

  // the zone of your newest message, or none for the default zone
  readonly zone?: string | null;

  // the body of the pinned-memory message, from the turn's context
  readonly pinnedMemory: string;

  // the model from the conversation's profile, which status names
  readonly model: string;
  readonly status: StatusRegistry;
  readonly readTurnNote?: ConversationRun['readTurnNote'];
}

// The opening record's payload: the start, the summary it used, the count of turns and events in
// the recent turns, and each status value by its entry's name.
export interface OpeningRecord {
  readonly kind: SessionStart['kind'];
  readonly reason: Extract<SessionStart, { kind: 'rebuild' }>['reason'] | null;
  readonly lostSessionID: string | null;
  readonly summarySequence: number | null;
  readonly recentRecords: number;
  readonly recentEvents: number;

  // the first sequence of the thread the session holds word for word: the oldest of the recent
  // turns, or the turn's first inbox record when none; retrieval leaves your messages from it on out
  readonly heldFrom: number;

  // the newest recall before the opening's own, which served the session a lost-session start lost
  readonly recalledThrough: number;
  readonly status: Readonly<Record<string, string | number>>;
}

// What a new session opens with: the blocks of its first message, and what its opening record
// keeps.
export interface SessionOpening {
  readonly blocks: readonly string[];
  readonly record: OpeningRecord;
}

// Reads the blocks a new session opens with, in slot order, from one path whatever started it: the
// pinned memory, the status, the newest readable summary, and the turns after it up to the budget,
// with the memory changes and the events over the span those turns cover.
export async function readSessionOpening(
  context: Pick<TasksContext, 'log' | 'clock'>,
  query: SessionOpeningQuery,
): Promise<SessionOpening> {
  const recalledThrough = await readRecalledThrough(context, query.taskID);

  const openedAt = new Date(context.clock.now());

  const at = formatMessageTime(openedAt, query.zone, query.times);

  const summary = await readSessionSummary(context, query.taskID);

  const recent = await readRecentTurns(context, {
    taskID: query.taskID,
    beforeSequence: query.beforeSequence,
    afterSequence: summary?.throughSequence ?? 0,
    tokens: query.rebuildTokens,
    times: query.times,
  });

  const facts = { ...query, openedAt };

  const status = await Promise.all(
    query.status.map(async (entry) => ({ name: entry.name, line: await entry.read(facts) })),
  );

  const replayed = await readReplayedNote(context, query, recent);

  const blocks = [
    renderOpeningMessage('pinned-memory', at, query.pinnedMemory),
    renderOpeningMessage('status', at, status.map((read) => `- ${read.line.text}`).join('\n')),
    renderOpeningMessage('summary', at, summary?.text ?? null),
    renderOpeningMessage('recent-turns', at, renderSessionHistory(recent, query.times)),
    replayed?.text ?? null,
  ];

  return {
    blocks: blocks.filter((block) => block !== null),
    record: {
      kind: query.start.kind,
      reason: query.start.kind === 'rebuild' ? query.start.reason : null,
      lostSessionID: query.start.kind === 'rebuild' ? query.start.lostSessionID : null,
      summarySequence: summary?.sequence ?? null,
      recentRecords: recent.length,
      heldFrom: recent.at(0)?.record.sequence ?? query.beforeSequence,
      recentEvents: replayed?.eventCount ?? 0,
      recalledThrough,
      status: Object.fromEntries(status.map((read) => [read.name, read.line.value])),
    },
  };
}

// The note over the span the recent turns cover: from where the oldest kept turn's note started
// through where the last turn's note ended, where the current turn's own note starts.
async function readReplayedNote(
  context: Pick<TasksContext, 'log'>,
  query: SessionOpeningQuery,
  recent: readonly HistoryTurn[],
): Promise<TurnNote | null> {
  const oldest = recent.at(0);

  if (oldest === undefined || query.readTurnNote === undefined) {
    return null;
  }

  const first = await readTurnNoteRange(context.log, oldest.record.sequence);
  const last = await readTurnNoteRange(context.log);

  const span = { after: first.after, through: last.after };

  return span.through > span.after ? query.readTurnNote({ span, isNewSession: true }) : null;
}

function renderOpeningMessage(
  type: SystemMessageType,
  at: string,
  body: string | null,
): string | null {
  return body === null ? null : renderSystemMessage({ type, at, body });
}
