import type { TextRange } from './collect-quoted-blocks';
import { formatZonedTime } from './format-zoned-time';
import type { OwnerMessage } from './gate-types';

export interface CheckedText {
  readonly kind: 'candidate_memory' | 'item_to_retire';
  readonly text: string;
  readonly until: number | null;
}

// The evidence mark avoids a quotation word, because the checker model read words marked «quote»
// as someone else's speech.
export function renderCheckerInput(
  message: OwnerMessage,
  evidence: TextRange,
  checked: CheckedText,
  defaultZone: string,
): string {
  const marks: { readonly at: number; readonly mark: string }[] = [
    { at: evidence.start, mark: '«evidence»' },
    { at: evidence.end, mark: '«/evidence»' },
    ...message.spans.flatMap((span) =>
      span.source === 'typed'
        ? []
        : [
            { at: span.start, mark: '«pasted»' },
            { at: span.end, mark: '«/pasted»' },
          ],
    ),
  ];

  const sorted = marks.toSorted(
    (left, right) => left.at - right.at || getMarkRank(left.mark) - getMarkRank(right.mark),
  );

  let marked = '';
  let at = 0;

  for (const entry of sorted) {
    marked += message.text.slice(at, entry.at) + entry.mark;
    at = entry.at;
  }

  marked += message.text.slice(at);

  const zone = message.timeZone ?? defaultZone;
  const sent = `<sent>${formatZonedTime(message.sentAt, zone)}</sent>`;
  const shown = `<${checked.kind}>\n${checked.text}\n</${checked.kind}>`;

  const end =
    checked.until === null
      ? ''
      : `\n\n<end_time>${formatZonedTime(checked.until, zone)}</end_time>`;

  return `${sent}\n\n<owner_message>\n${marked}\n</owner_message>\n\n${shown}${end}`;
}

function getMarkRank(mark: string): number {
  return mark.startsWith('«/') ? 0 : 1;
}
