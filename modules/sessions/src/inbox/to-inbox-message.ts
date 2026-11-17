import type { LogRecord } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import type { InboxImage, InboxMessage } from '@heynixie/wire';
import type { TaskMessageView } from '../task/render-task-message';
import type { MessageTimeOptions } from '../types';
import { renderImageMarkers } from '../utils/render-image-markers';
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
}

export function toInboxMessage(
  record: LogRecord,
  times: MessageTimeOptions,
  view: TaskMessageView,
  extras: InboxExtras,
): InboxMessage {
  const message = {
    uuid: encodeInboxUUID(record.sequence),
    text: renderInboxMessage(record, times, view, extras),
  };

  const images = [
    ...buildInboxImages(record, extras.attachments),
    ...(extras.result?.images ?? []),
  ];

  return images.length === 0 ? message : { ...message, images };
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
