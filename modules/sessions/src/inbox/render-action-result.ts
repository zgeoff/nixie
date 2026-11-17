import type { LogRecord } from '@heynixie/log';
import type { ApprovedReply, ToolImage } from '@heynixie/tools';
import type { InboxImage } from '@heynixie/wire';
import { mintBlockID } from '@heynixie/wire';

// The result of a call that ran inside the turn, as the inbox shows it beside the action's outcome.
export interface ActionResultBlock {
  readonly text: string;
  readonly images: readonly InboxImage[];
}

// The result in an element that a fresh random ID closes, so what an outside service said cannot
// close it early. The reply of the step that ran the call wins over the record, which can keep less
// than the tool returned. An image takes a marker in the text and goes with the message.
export function renderActionResult(
  record: LogRecord,
  reply: ApprovedReply | null,
  mint: () => string = mintBlockID,
): ActionResultBlock {
  const fence = mint();
  const source = record.contentSource ?? 'untrusted';
  const markers = (reply?.images ?? []).flatMap((image) => toInboxImage(image, mint()));

  return {
    text: [
      `<tool-result source="${source}" fence="${fence}">`,
      toResultText(record, reply),
      ...markers.map((marker) => marker.marker),
      `</tool-result fence="${fence}">`,
    ].join('\n'),
    images: markers,
  };
}

function toInboxImage(image: ToolImage, blockID: string): readonly InboxImage[] {
  if (!isInboxMediaType(image.mediaType)) {
    return [];
  }

  return [
    {
      marker: `<tool-image id="${blockID}"/>`,
      mediaType: image.mediaType,
      data: image.bytes.toBase64(),
    },
  ];
}

const inboxMediaTypes: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function isInboxMediaType(mediaType: string): mediaType is InboxImage['mediaType'] {
  return inboxMediaTypes.has(mediaType);
}

function toResultText(record: LogRecord, reply: ApprovedReply | null): string {
  if (record.erasable.status !== 'readable') {
    return '[a result since forgotten]';
  }

  if (reply !== null) {
    return JSON.stringify(reply.result);
  }

  const fields = record.erasable.fields;
  const message = fields['message'];

  if (typeof message === 'string') {
    return message;
  }

  return JSON.stringify(fields['result'] ?? null);
}
