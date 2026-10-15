import type { LogRecord } from '@heynixie/log';
import type { InboxImage, InboxMessage } from '@heynixie/wire';
import { encodeInboxUUID } from './encode-inbox-uuid';
import { renderImageMarkers } from './render-image-markers';
import { renderInboxMessage } from './render-inbox-message';
import type { MessageTimeOptions } from './types';

// An inbox record as the guest passes it to the model, with its sequence in the message's uuid and
// each image of your message, from the record's attachments, after the marker that names it.
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

// an image whose bytes or type did not read stays out, so the model never reads a broken block
function buildInboxImages(
  record: LogRecord,
  attachments: readonly Uint8Array[],
): readonly InboxImage[] {
  const types = record.payload['images'];

  return renderImageMarkers(record).flatMap((marker, index) => {
    const bytes = attachments[index];
    const type: unknown = Array.isArray(types) ? types[index] : undefined;
    const mediaType = findMediaType(type);

    return bytes === undefined || mediaType === null
      ? []
      : [{ marker, mediaType, data: bytes.toBase64() }];
  });
}

const mediaTypes: readonly InboxImage['mediaType'][] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

function findMediaType(image: unknown): InboxImage['mediaType'] | null {
  if (typeof image !== 'object' || image === null || !('mediaType' in image)) {
    return null;
  }

  const mediaType = image.mediaType;

  return mediaTypes.find((known) => known === mediaType) ?? null;
}
