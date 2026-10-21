import type { TextRange } from './collect-quoted-blocks';
import type { OwnerMessage } from './gate-types';

export interface CheckedText {
  readonly kind: 'candidate_memory' | 'item_to_retire';
  readonly text: string;
}

// The evidence mark avoids a quotation word, because the checker model read words marked «quote»
// as someone else's speech.
export function renderCheckerInput(
  message: OwnerMessage,
  evidence: TextRange,
  checked: CheckedText,
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

  return `<owner_message>\n${marked}\n</owner_message>\n\n<${checked.kind}>\n${checked.text}\n</${checked.kind}>`;
}

function getMarkRank(mark: string): number {
  return mark.startsWith('«/') ? 0 : 1;
}
