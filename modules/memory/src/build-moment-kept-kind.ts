import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/sessions';
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

const maxKept = 50;

// A moment that the conversation keeps itself shows in its own tool result, so the block lists only
// the moments that the owner or another task kept.
export function buildMomentKeptKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  getTaskName: (taskID: string) => string,
): EventKind<MomentKeptEvent> {
  return {
    name: 'moment_kept',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        kinds: ['moment_kept'],
        limit: maxKept,
      });

      const events = await Promise.all(
        records.map(async (entry) => {
          const record = entry.record;
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
        }),
      );

      return events.flat();
    },
    render: (detail, settings) => {
      const keeper =
        detail.taskName === null
          ? (settings.ownerName ?? 'The owner')
          : `Another of your tasks (${detail.taskName})`;

      return `${keeper} kept a moment: "${detail.title}". Moment ${detail.shortID}. Moments kept this week: ${String(detail.keptThisWeek)}.`;
    },
  };
}
