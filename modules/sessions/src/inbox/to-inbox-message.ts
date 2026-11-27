import type { LogRecord } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import type { InboxImage, InboxMessage } from '@heynixie/wire';
import type { TaskMessageView } from '../task/render-task-message';
import type { MessageTimeOptions, TurnGaps } from '../types';
import { renderImageMarkers } from '../utils/render-image-markers';
import { addTurnGaps } from './add-turn-gaps';
import { encodeInboxUUID } from './encode-inbox-uuid';
import type { ActionResultBlock } from './render-action-result';
import { renderInboxMessage } from './render-inbox-message';
import type { ReminderRead } from './render-reminder-notice';

// What the inbox read fetched beside the record: the bytes of its images and the data of a reminder.
export interface InboxExtras {
  readonly attachments: readonly Uint8Array[];
  readonly reminder: ReminderRead | null;

  // the result of the call that an action settled, when the call ran inside the turn
  readonly result?: ActionResultBlock | null;

  // when the owner approved the action that an outcome settles
  readonly approvedAt?: Date | null;

  // what the read of a kind that a feature added fetched
  readonly kindExtra?: unknown;

  // the settlements that read as one note, the record being the first of them
  readonly settled?: readonly [LogRecord, ...LogRecord[]];

  // set on the message that starts a turn, or cuts into one
  readonly gaps?: TurnGaps;
}

export function toInboxMessage(
  record: LogRecord,
  times: MessageTimeOptions,
  view: TaskMessageView,
  extras: InboxExtras,
): InboxMessage {
  const message = {
    uuid: encodeInboxUUID(record.sequence),
    text: addGaps(renderInboxMessage(record, times, view, extras), extras.gaps),
  };

  const images = [
    ...buildInboxImages(record, extras.attachments),
    ...(extras.result?.images ?? []),
  ];

  return images.length === 0 ? message : { ...message, images };
}

function addGaps(text: string, gaps: TurnGaps | undefined): string {
  return gaps === undefined ? text : addTurnGaps(text, gaps);
}

function buildInboxImages(
  record: LogRecord,
  attachments: readonly Uint8Array[],
): readonly InboxImage[] {
  const types = ownerMessageCodec.tryDecodePartial(record.payload)?.images;

  return renderImageMarkers(record).flatMap((marker, index) => {
    const bytes = attachments[index];
    const mediaType = types?.[index]?.mediaType;

    return bytes === undefined || mediaType === undefined
      ? []
      : [{ marker, mediaType, data: bytes.toBase64() }];
  });
}
