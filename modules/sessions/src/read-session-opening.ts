import { readSessionSummary } from '@heynixie/compaction';
import type { LogRecord } from '@heynixie/log';
import type { TaskBrief, TaskMessaging, TasksContext } from '@heynixie/tasks';
import type { SystemMessageType } from '@heynixie/wire';
import { renderSystemMessage } from '@heynixie/wire';
import type { StatusRegistry } from './build-status-registry';
import { formatMessageTime } from './format-message-time';
import { pickPinnedBrief } from './pick-pinned-brief';
import { readRecalledThrough } from './read-recalled-through';
import type { HistoryTurn } from './read-recent-turns';
import { readRecentTurns } from './read-recent-turns';
import { readTurnNoteRange } from './read-turn-note-range';
import { renderBriefEnvelope } from './render-brief-envelope';
import { renderSessionHistory } from './render-session-history';
import type { ConversationRun, MessageTimeOptions, SessionStart, TurnNote } from './types';

export interface SessionOpeningQuery {
  readonly taskID: string;
  readonly start: SessionStart;

  readonly beforeSequence: number;

  readonly rebuildTokens: number;
  readonly times: MessageTimeOptions;

  readonly zone?: string | null;

  readonly pinnedMemory: string | null;

  readonly model: string;
  readonly status: StatusRegistry;

  // the task's own brief, or null for a task with none
  readonly brief: TaskBrief | null;

  // whether the task has opened no session yet
  readonly isFirstSession: boolean;

  // the unread records that the turn renders
  readonly inbox: readonly LogRecord[];
  readonly messaging: TaskMessaging;
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

  // the brief this opening accounted for, pinned or held in the turns or the batch
  readonly briefSequence: number | null;
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
    messaging: query.messaging,
  });

  const brief = pickPinnedBrief({
    brief: query.brief,
    recent,
    inbox: query.inbox,
    isFirstSession: query.isFirstSession,
  });

  const facts = { ...query, openedAt };

  const status = await Promise.all(
    query.status.map(async (entry) => ({ name: entry.name, line: await entry.read(facts) })),
  );

  const replayed = await readReplayedNote(context, query, recent);

  const memoryBlock = renderOpeningMessage('pinned-memory', at, query.pinnedMemory);

  const statusBlock = renderOpeningMessage(
    'status',
    at,
    status.map((read) => `- ${read.line.text}`).join('\n'),
  );

  // A started task reads its status first, then its memory, then its brief. The conversation has no
  // brief and keeps the order of its opening, which puts the pinned memory before the status.
  const readout = query.brief === null ? [memoryBlock, statusBlock] : [statusBlock, memoryBlock];

  const blocks = [
    ...readout,
    brief.pinned === null ? null : renderBriefEnvelope(brief.pinned, query.times, query.messaging),
    renderOpeningMessage('summary', at, summary?.text ?? null),
    renderOpeningMessage('recent-turns', at, renderSessionHistory(recent, query.times, query)),
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
      briefSequence: brief.briefSequence,
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
