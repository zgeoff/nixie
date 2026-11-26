import type { LogRecord } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { isInboxRecord, ownerMessageCodec } from '@heynixie/tasks';
import type { ApprovedReply } from '@heynixie/tools';
import type { InboxMessage } from '@heynixie/wire';
import type { TaskMessageView } from '../task/render-task-message';
import type { GapReader, ImageTally, MessageTimeOptions, TurnGaps } from '../types';
import { countImages } from '../utils/count-images';
import { isPastImageBudget } from '../utils/is-past-image-budget';
import { mergeImageTallies } from '../utils/merge-image-tallies';
import { isSilentRecord } from './is-silent-record';
import { isToldWaitNotice } from './is-told-wait-notice';
import { readActionResult } from './read-action-result';
import { readApprovalTime } from './read-approval-time';
import { readHeardCut } from './read-heard-cut';
import { readReminder } from './read-reminder';
import { readSmallTalk } from './read-small-talk';
import { toInboxMessage } from './to-inbox-message';

// What reading a record needs: the log, and the reader of the version that a fire pins.
export type InboxContext = Pick<TasksContext, 'log' | 'readDefinitionVersion'>;

export interface InboxRead {
  readonly times: MessageTimeOptions;
  readonly view: TaskMessageView;

  readonly imageBudget: ImageTally;

  // What the call of an action returned, by the sequence of the action's outcome record. No record
  // keeps an image or every result in full, so only the step that ran the call has them.
  readonly replies?: ReadonlyMap<number, ApprovedReply>;

  // reads the gaps that the first message of the read shows
  readonly gaps?: GapReader;

  // the wait notices that a turn's opening told, which the read takes with no text
  readonly toldWaitNotices?: ReadonlySet<number>;
}

const noneTold: ReadonlySet<number> = new Set();

export interface InboxMessages {
  // the records that the read took, in order: each one that has a message, and each silent one
  readonly records: readonly LogRecord[];
  readonly messages: readonly InboxMessage[];

  // the records among them that render no message
  readonly silent: readonly LogRecord[];
}

export async function readInboxMessages(
  context: InboxContext,
  records: readonly LogRecord[],
  read: InboxRead,
): Promise<InboxMessages> {
  const taken: LogRecord[] = [];
  const messages: InboxMessage[] = [];
  const silent: LogRecord[] = [];
  let spent: ImageTally = { bytes: 0, count: 0 };
  const groups = groupSettlements(records.filter((record) => isInboxRecord(record)));

  for (const group of groups) {
    const [record] = group;

    if (isSilentRecord(record) || isToldWaitNotice(record, read.toldWaitNotices ?? noneTold)) {
      taken.push(record);
      silent.push(record);
      continue;
    }

    const gaps = messages.length === 0 ? await read.gaps?.(record) : undefined;

    const message = await readInboxMessage(context, record, read, { gaps, settled: group });

    const images = countImages(message);

    if (messages.length > 0 && isPastImageBudget(spent, images, read.imageBudget)) {
      return { records: taken, messages, silent };
    }

    spent = mergeImageTallies(spent, images);

    taken.push(...group);
    messages.push(message);
  }

  return { records: taken, messages, silent };
}

// The settlements that land before a wake read as one note, so a run of them is one group. Any other
// record is a group of its own.
function groupSettlements(
  records: readonly LogRecord[],
): readonly (readonly [LogRecord, ...LogRecord[]])[] {
  const groups: [LogRecord, ...LogRecord[]][] = [];

  for (const record of records) {
    const last = groups.at(-1);

    if (
      last !== undefined &&
      record.kind === 'proposals.settled' &&
      last[0].kind === 'proposals.settled'
    ) {
      last.push(record);
    } else {
      groups.push([record]);
    }
  }

  return groups;
}

interface MessageExtra {
  readonly gaps: TurnGaps | undefined;

  // the records the message stands for, the first being the one it reads
  readonly settled: readonly [LogRecord, ...LogRecord[]];
}

async function readInboxMessage(
  context: InboxContext,
  record: LogRecord,
  read: Pick<InboxRead, 'times' | 'view' | 'replies'>,
  extra: MessageExtra,
): Promise<InboxMessage> {
  const gaps = extra.gaps;

  const reminder = await readReminder(context, record, read.times.defaultZone);

  const result = await readActionResult(
    context,
    record,
    read.replies?.get(record.sequence) ?? null,
  );

  const approvedAt = await readApprovalTime(context, record);
  const cut = await readHeardCut(context, record);
  const smallTalk = await readSmallTalk(context, record);

  if (ownerMessageCodec.tryDecodePartial(record.payload)?.images === undefined) {
    return toInboxMessage(record, read.times, read.view, {
      attachments: [],
      reminder,
      result,
      approvedAt,
      cut,
      smallTalk,
      settled: extra.settled,
      ...(gaps === undefined ? {} : { gaps }),
    });
  }

  const attachments = await readRecordAttachments(context.log, [record.sequence]);

  const attached = attachments.get(record.sequence);
  const bytes = attached?.status === 'readable' ? attached.attachments : [];

  return toInboxMessage(record, read.times, read.view, {
    attachments: bytes,
    reminder,
    result,
    approvedAt,
    cut,
    ...(gaps === undefined ? {} : { gaps }),
  });
}
