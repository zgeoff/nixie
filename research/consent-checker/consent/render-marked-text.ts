import type { ConsentMessage } from './types.ts';

// The message text with every span the owner did not type marked as pasted.
export function renderMarkedText(message: ConsentMessage): string {
  const foreign = message.spans
    .filter((span) => span.source !== 'typed' && span.end > span.start)
    .toSorted((first, second) => first.start - second.start);
  let text = '';
  let at = 0;

  for (const span of foreign) {
    const start = Math.max(span.start, at);

    if (span.end <= start) {
      continue;
    }

    text += `${message.text.slice(at, start)}«pasted»${message.text.slice(start, span.end)}«/pasted»`;
    at = span.end;
  }

  return text + message.text.slice(at);
}
