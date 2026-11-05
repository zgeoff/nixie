import { z } from 'zod';

const messageSpans = z.array(z.object({ start: z.int(), end: z.int(), source: z.string() }));

export function findTypedText(fields: Readonly<Record<string, unknown>>): string | null {
  const text = fields['text'];

  if (typeof text !== 'string') {
    return null;
  }

  const spans = messageSpans.safeParse(fields['spans']);

  const typed =
    spans.success && spans.data.some((span) => span.source !== 'unknown')
      ? spans.data
          .map((span) => (span.source === 'typed' ? text.slice(span.start, span.end) : '\n'))
          .join('')
      : text;

  return typed.trim() === '' ? null : typed;
}
