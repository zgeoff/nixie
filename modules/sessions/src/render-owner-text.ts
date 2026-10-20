import type { LogRecord } from '@heynixie/log';
import { mintBlockID } from '@heynixie/wire';
import { z } from 'zod';

const messageSpans = z.array(z.object({ start: z.number(), end: z.number(), source: z.string() }));

// Renders your message as you wrote it, with each span you pasted or dropped in wrapped in a block
// whose fresh random ID is on both tags, so a pasted closing tag cannot end it. A forgotten message
// keeps its place with a note, so the model never reads a gap as silence.
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

// the spans the model reads as someone else's words; typed and unknown spans render bare
function isForeignSource(source: string): source is 'pasted' | 'dropped' {
  return source === 'pasted' || source === 'dropped';
}

function renderSpan(part: string, source: string): string {
  if (!isForeignSource(source)) {
    return part;
  }

  const blockID = mintBlockID();

  return `<${source} id="${blockID}">${part}</${source} id="${blockID}">`;
}
