import type { LogRecord } from '@heynixie/log';
import { mintBlockID } from '@heynixie/wire';
import { z } from 'zod';

const messageSpans = z.array(z.object({ start: z.number(), end: z.number(), source: z.string() }));

export function renderOwnerText(record: LogRecord): string {
  const fields = record.erasable.status === 'readable' ? record.erasable.fields : {};
  const text = fields['text'];

  if (typeof text !== 'string') {
    return '[a message you sent, since forgotten]';
  }

  const spans = messageSpans.safeParse(fields['spans']);

  if (!spans.success || !spans.data.some((span) => isForeignSource(span.source))) {
    return text;
  }

  return spans.data
    .toSorted((left, right) => left.start - right.start)
    .map((span) => renderSpan(text.slice(span.start, span.end), span.source))
    .join('');
}

function isForeignSource(source: string): source is 'pasted' | 'dropped' {
  return source === 'pasted' || source === 'dropped';
}

function renderSpan(part: string, source: string): string {
  if (!isForeignSource(source)) {
    return part;
  }

  // Pasted text is untrusted, so each block gets a fresh random ID that a pasted closing tag cannot
  // match.
  const blockID = mintBlockID();

  return `<${source} id="${blockID}">${part}</${source} id="${blockID}">`;
}
