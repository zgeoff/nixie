import { z } from 'zod';
// @boundaries-ignore a spike imports the code it measures
import { mintBlockID } from '../../../libs/wire/src/mint-block-id.ts';
import type { PlainRecord } from './read-plain-export.ts';

const messageSpans = z.array(z.object({ start: z.int(), end: z.int(), source: z.string() }));
const imagesSchema = z.object({ images: z.array(z.unknown()) });
const textLimit = 1000;

// A copy of the rule in modules/memory/src/read-message-recall.ts that cuts a shown past message,
// and of the owner text and image marker renderers in modules/sessions that it calls. Both take the
// product's log record, which a plain export does not rebuild, so a change there needs the same
// change here.
export function renderShownMessage(record: PlainRecord): { text: string; isCut: boolean } | null {
  const fields = record.erasable.status === 'readable' ? record.erasable.fields : null;
  const text = fields?.['text'];

  if (typeof text !== 'string') {
    return null;
  }

  const parsed = messageSpans.safeParse(fields?.['spans']);
  const spans = (parsed.success ? parsed.data : [])
    .filter((span) => span.start < textLimit)
    .map((span) => ({ ...span, end: Math.min(span.end, textLimit) }));
  const cut = text.slice(0, textLimit);
  const ownerText = spans.some((span) => isForeignSource(span.source))
    ? spans
        .toSorted((left, right) => left.start - right.start)
        .map((span) => renderSpan(cut.slice(span.start, span.end), span.source))
        .join('')
    : cut;
  const images = imagesSchema.safeParse(record.payload);
  const markers = images.success ? images.data.images.map((_image, index) => `<dropped-image id="${mintBlockID()}" n="${index + 1}"/>`) : [];

  return { text: [ownerText, ...markers].join('\n'), isCut: text.length > textLimit };
}

function isForeignSource(source: string): boolean {
  return source === 'pasted' || source === 'dropped';
}

function renderSpan(part: string, source: string): string {
  if (!isForeignSource(source)) {
    return part;
  }

  const blockID = mintBlockID();

  return `<${source} id="${blockID}">${part}</${source} id="${blockID}">`;
}
