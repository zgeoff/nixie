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

  readonly beforeSequence: number;

  readonly rebuildTokens: number;
  readonly times: MessageTimeOptions;

  readonly zone?: string | null;

  readonly pinnedMemory: string;

  readonly model: string;
  readonly status: StatusRegistry;
  readonly readTurnNote?: ConversationRun['readTurnNote'];
}

export interface OpeningRecord {
  readonly kind: SessionStart['kind'];
  readonly reason: Extract<SessionStart, { kind: 'rebuild' }>['reason'] | null;
  readonly lostSessionID: string | null;
  readonly summarySequence: number | null;
  readonly recentRecords: number;
  readonly recentEvents: number;

  readonly heldFrom: number;

  readonly recalledThrough: number;
  readonly status: Readonly<Record<string, string | number>>;
}

export interface SessionOpening {
  readonly blocks: readonly string[];
  readonly record: OpeningRecord;
}

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
