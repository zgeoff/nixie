import type { LogRecord } from '@heynixie/log';
import type { ApprovedReply, ToolImage } from '@heynixie/tools';
import type { InboxImage } from '@heynixie/wire';
import { mintBlockID, renderFenced } from '@heynixie/wire';

// The result of a call that ran inside the turn, as the inbox shows it beside the action's outcome.
export interface ActionResultBlock {
  readonly text: string;
  readonly images: readonly InboxImage[];
}

// A fresh random ID closes the element, so what an outside service said cannot close it early. The
// step's reply wins over the record, which can keep less than the tool returned, until a forget.
export function renderActionResult(
  record: LogRecord,
  reply: ApprovedReply | null,
  mint: () => string = mintBlockID,
): ActionResultBlock {
  const fence = mint();
  const source = record.contentSource ?? 'untrusted';
  const kept = record.erasable.status === 'readable' ? reply : null;
  const markers = (kept?.images ?? []).flatMap((image) => toInboxImage(image, mint()));

  return {
    text: renderFenced({
      tag: 'tool-result',
      attributes: { source },
      text: [toResultText(record, kept), ...markers.map((marker) => marker.marker)].join('\n'),
      fence,
    }),
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
