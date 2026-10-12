import type { TextRange } from './find-quoted-blocks';
import type { OwnerMessage } from './gate-types';

// What the checker reads beside your message: a candidate memory, or the item a retirement would
// end, which the checker reads as untrusted data.
export interface CheckedText {
  readonly kind: 'candidate_memory' | 'item_to_retire';
  readonly text: string;
}

// Renders the checker's whole input: your one message, with the cited words marked «evidence» and
// every span you did not type marked «pasted», then the text it checks. The evidence mark avoids a
// quotation word, because the checker read words marked «quote» as someone else's speech.
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

  // at one offset a closing mark goes before an opening one
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
