import type { LogRecord } from '@heynixie/log';
import type { ToolImage } from '@heynixie/tools';
import type { InboxImage } from '@heynixie/wire';
import { mintBlockID } from '@heynixie/wire';

// The result of a call that ran inside the turn, as the inbox shows it beside the action's outcome.
export interface ActionResultBlock {
  readonly text: string;
  readonly images: readonly InboxImage[];
}

// The text of the result record in an element that a fresh random ID closes, so what an outside
// service said cannot close it early. An image takes a marker in the text and goes with the message.
export function renderActionResult(
  record: LogRecord,
  images: readonly ToolImage[],
  mint: () => string = mintBlockID,
): ActionResultBlock {
  const fence = mint();
  const source = record.contentSource ?? 'untrusted';
  const markers = images.flatMap((image) => toInboxImage(image, mint()));

  return {
    text: [
      `<tool-result source="${source}" fence="${fence}">`,
      toResultText(record),
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

function toResultText(record: LogRecord): string {
  if (record.erasable.status !== 'readable') {
    return '[a result since forgotten]';
  }

  const fields = record.erasable.fields;
  const message = fields['message'];

  if (typeof message === 'string') {
    return message;
  }

  return JSON.stringify(fields['result'] ?? null);
}
