import type { LogRecord } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import type { InboxImage, InboxMessage } from '@heynixie/wire';
import { encodeInboxUUID } from './encode-inbox-uuid';
import { renderImageMarkers } from './render-image-markers';
import { renderInboxMessage } from './render-inbox-message';
import type { MessageTimeOptions } from './types';

export function toInboxMessage(
  record: LogRecord,
  times: MessageTimeOptions,
  attachments: readonly Uint8Array[] = [],
): InboxMessage {
  const message = {
    uuid: encodeInboxUUID(record.sequence),
    text: renderInboxMessage(record, times),
  };

  const images = buildInboxImages(record, attachments);

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
