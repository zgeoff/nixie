import type { LogRecord } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { inboxKinds, isInboxRecord, ownerMessageCodec } from '@heynixie/tasks';
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
import { readReminder } from './read-reminder';
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

  // the records among them that render no message of their own, which the host acknowledges itself:
  // the silent ones, and every settlement after the first that its note carries
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
      return { records: sortBySequence(taken), messages, silent };
    }

    spent = mergeImageTallies(spent, images);

    const [, ...followers] = group;

    taken.push(...group);
    silent.push(...followers);
    messages.push(message);
  }

  return { records: sortBySequence(taken), messages, silent };
}

// The settlements that land before a wake read as one note, so all of them are one group, even when
// an owner message sits between them. The note stands where the first settlement stands. Any other
// record is a group of its own.
function groupSettlements(
  records: readonly LogRecord[],
): readonly (readonly [LogRecord, ...LogRecord[]])[] {
  const groups: [LogRecord, ...LogRecord[]][] = [];
  let note: [LogRecord, ...LogRecord[]] | undefined;

  for (const record of records) {
    if (record.kind !== 'proposals.settled') {
      groups.push([record]);
    } else if (note === undefined) {
      note = [record];

      groups.push(note);
    } else {
      note.push(record);
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
  const kindExtra = await inboxKinds.byKind(record.kind)?.read?.(context, record);

  if (ownerMessageCodec.tryDecodePartial(record.payload)?.images === undefined) {
    return toInboxMessage(record, read.times, read.view, {
      attachments: [],
      reminder,
      result,
      approvedAt,
      kindExtra,
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
    ...(gaps === undefined ? {} : { gaps }),
  });
}

function sortBySequence(records: readonly LogRecord[]): readonly LogRecord[] {
  return records.toSorted((first, second) => first.sequence - second.sequence);
}
