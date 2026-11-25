import { readSessionSummary } from '@heynixie/compaction';
import type { LogRecord } from '@heynixie/log';
import type { RuleSource } from '@heynixie/policy';
import type { TaskBrief, TaskMessaging, TasksContext } from '@heynixie/tasks';
import type { SystemMessageType } from '@heynixie/wire';
import { mintBlockID, renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { HistoryTurn } from '../turn/read-recent-turns';
import { readRecentTurns } from '../turn/read-recent-turns';
import { readTurnNoteRange } from '../turn/read-turn-note-range';
import type {
  ConversationRun,
  MessageTimeOptions,
  SessionIndex,
  SessionStart,
  TurnNote,
} from '../types';
import { readRecalledThrough } from '../utils/read-recalled-through';
import type { StatusLine, StatusRegistry } from './build-status-registry';
import type { BriefPlace } from './pick-brief-place';
import { pickPinnedBrief } from './pick-pinned-brief';
import { renderBriefEnvelope } from './render-brief-envelope';
import { renderSessionHistory } from './render-session-history';

export interface SessionOpeningQuery {
  readonly taskID: string;
  readonly start: SessionStart;

  readonly beforeSequence: number;

  // a history before this sequence belongs to no part of the session
  readonly afterSequence?: number;

  readonly rebuildTokens: number;
  readonly times: MessageTimeOptions;

  readonly zone?: string | null;

  readonly pinnedMemory: string | null;

  // the index the memory read for this opening, or null for a session with no memory
  readonly index?: SessionIndex | null;

  readonly model: string;
  readonly status: StatusRegistry;

  // the task's own brief, or null for a task with none
  readonly brief: TaskBrief | null;

  // whether the task has opened no session yet
  readonly isFirstSession: boolean;

  // where the turn puts the brief of a definition's task run; a turn with none leaves it out
  readonly briefPlace?: BriefPlace;

  // the blocks of the open task run that a rebuilt or compacted session pins beside its brief, which
  // the turn's preamble then leaves out
  readonly runBlocks?: string | null;

  // the unread records that the turn renders
  readonly inbox: readonly LogRecord[];
  readonly messaging: TaskMessaging;
  readonly readTurnNote?: ConversationRun['readTurnNote'];

  // mints the ID of each system message block; a step passes none, and a test fixes it
  readonly mintBlockID?: () => string;
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

  // where the content of the events that the opening replays came from
  readonly sources: readonly RuleSource[];
}

const summaryCue =
  'You wrote this summary from recollection. Before you rely on a decision in it, check its note or event ID.';

export async function readSessionOpening(
  context: Pick<TasksContext, 'log' | 'clock'>,
  query: SessionOpeningQuery,
): Promise<SessionOpening> {
  const recalledThrough = await readRecalledThrough(context, query.taskID);

  const openedAt = new Date(context.clock.now());

  const at = formatMessageTime(openedAt, query.zone, query.times);

  const found = await readSessionSummary(context, query.taskID);

  const since = query.afterSequence ?? 0;
  const summary = found !== null && found.sequence > since ? found : null;

  const recent = await readRecentTurns(context, {
    taskID: query.taskID,
    beforeSequence: query.beforeSequence,
    afterSequence: Math.max(since, summary?.throughSequence ?? 0),
    tokens: query.rebuildTokens,
    times: query.times,
    messaging: query.messaging,
  });

  const brief = pickPinnedBrief({
    brief: query.brief,
    recent,
    inbox: query.inbox,
    isFirstSession: query.isFirstSession,
    ...(query.briefPlace === undefined ? {} : { place: query.briefPlace }),
  });

  const facts = { ...query, openedAt };

  const status = await Promise.all(
    query.status.map(async (entry) => ({ name: entry.name, line: await entry.read(facts) })),
  );

  const replayed = await readReplayedNote(context, query, recent);

  const mint = query.mintBlockID ?? mintBlockID;
  const memoryBlock = renderOpeningMessage('pinned-memory', at, query.pinnedMemory, mint);

  const indexBlock = renderOpeningMessage(
    'memory-index',
    at,
    pickIndexText(query.index ?? null),
    mint,
  );

  const indexLines = buildIndexStatus(query.index ?? null);
  const allStatus = [...status, ...indexLines];

  const statusBlock = renderOpeningMessage(
    'status',
    at,
    allStatus.map((read) => `- ${read.line.text}`).join('\n'),
    mint,
  );

  const summaryBody = summary === null ? null : `${summary.text}\n${summaryCue}`;

  const blocks = [
    statusBlock,
    memoryBlock,
    indexBlock,
    query.runBlocks ?? null,
    brief.pinned === null
      ? null
      : renderBriefEnvelope(
          brief.pinned,
          { taskID: query.taskID, times: query.times, messaging: query.messaging },
          mint,
        ),
    renderOpeningMessage('summary', at, summaryBody, mint),
    renderOpeningMessage(
      'recent-turns',
      at,
      renderSessionHistory(recent, query.times, query, mint),
      mint,
    ),
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
      status: Object.fromEntries(allStatus.map((read) => [read.name, read.line.value])),
    },
    sources: replayed?.sources ?? [],
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
  mint: () => string,
): string | null {
  return body === null ? null : renderSystemMessage({ type, at, body }, mint());
}

function pickIndexText(index: SessionIndex | null): string | null {
  return index === null || index.text === '' ? null : index.text;
}

// With no budget the index shows neither line.
function buildIndexStatus(
  index: SessionIndex | null,
): readonly { readonly name: string; readonly line: StatusLine }[] {
  if (index === null || index.budget === 0) {
    return [];
  }

  return [
    {
      name: 'index_items',
      line: {
        value: index.items,
        text: `Memory index: ${String(index.items)} ${index.items === 1 ? 'item' : 'items'}`,
      },
    },
    {
      name: 'index_tokens',
      line: {
        value: index.tokens,
        text: `Memory index tokens: ${String(index.tokens)} of ${String(index.budget)}`,
      },
    },
  ];
}
