import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind, NotedEvent, TurnNoteRange } from '@heynixie/sessions';
import { conversationTaskID } from '@heynixie/tasks';
import { momentKeptCodec } from './moment-kept-codec';
import type { MomentTables } from './moment-types';
import { readWeekCount } from './read-week-count';

export interface MomentKeptEvent {
  readonly title: string;
  readonly shortID: string;

  // the task that kept the moment, or null when the owner kept it from the client
  readonly taskName: string | null;
  readonly keptThisWeek: number;
}

type KeptLog = Pick<Log, 'deploymentKey' | 'writer'>;

type GetTaskName = (taskID: string) => string;

// A moment that the conversation keeps itself shows in its own tool result, so the block lists only
// the moments that the owner or another task kept.
export function buildMomentKeptKind(
  log: KeptLog,
  getTaskName: GetTaskName,
): EventKind<MomentKeptEvent> {
  return {
    name: 'moment_kept',
    read: (range) => readKeptEvents(log, getTaskName, range),
    render: (detail, settings) => {
      const keeper =
        detail.taskName === null
          ? (settings.ownerName ?? 'The owner')
          : `Another of your tasks (${detail.taskName})`;

      return `${keeper} kept a moment: "${detail.title}". Moment ${detail.shortID}. Moments kept this week: ${String(detail.keptThisWeek)}.`;
    },
  };
}

const maxKept = 50;

// The limit counts only the keeps the block shows, so the conversation's own keeps and destroyed
// moments never crowd out a keep that the owner or another task made.
async function readKeptEvents(
  log: KeptLog,
  getTaskName: GetTaskName,
  range: TurnNoteRange,
): Promise<readonly NotedEvent<MomentKeptEvent>[]> {
  let events: readonly NotedEvent<MomentKeptEvent>[] = [];
  let after = range.after;

  for (;;) {
    const records = await readRecords(log, {
      afterSequence: after,
      beforeSequence: range.through + 1,
      kinds: ['moment_kept'],
      limit: maxKept,
    });

    const batch = await Promise.all(
      records.map((entry) => readKeptEvent(log, getTaskName, entry.record)),
    );

    events = [...events, ...batch.flat()].slice(0, maxKept);

    const last = records.at(-1);

    if (records.length < maxKept || events.length >= maxKept || last === undefined) {
      return events;
    }

    after = last.record.sequence;
  }
}

async function readKeptEvent(
  log: KeptLog,
  getTaskName: GetTaskName,
  record: LogRecord,
): Promise<readonly NotedEvent<MomentKeptEvent>[]> {
  const kept = momentKeptCodec.tryDecodePartial(record.payload);
  const erasable = record.erasable;
  const title = erasable.status === 'readable' ? erasable.fields['title'] : undefined;

  if (
    typeof title !== 'string' ||
    kept?.shortID === undefined ||
    kept.keptThread === conversationTaskID
  ) {
    return [];
  }

  const at = record.recordedAt.getTime();

  const count = await readWeekCount(log.writer.db.$extendTables<MomentTables>(), at);

  return [
    {
      sequence: record.sequence,
      at,
      detail: {
        title: title.replaceAll(/\s+/gu, ' '),
        shortID: kept.shortID,
        taskName:
          kept.keptThread === null || kept.keptThread === undefined
            ? null
            : getTaskName(kept.keptThread),
        keptThisWeek: count.total,
      },
    },
  ];
}
