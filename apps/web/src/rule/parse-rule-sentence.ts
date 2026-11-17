export interface RuleSentencePart {
  readonly kind: 'text' | 'strong' | 'code';
  readonly text: string;
}

// The policy module renders a rule as a sentence with 2 marks only: `**` around the outcome and a
// backtick pair around each value. A mark with no closing pair stays as text.
export function parseRuleSentence(sentence: string): RuleSentencePart[] {
  const parts: RuleSentencePart[] = [];
  let text = '';
  let index = 0;

  while (index < sentence.length) {
    const mark = pickMark(sentence, index);
    const end = mark === null ? -1 : sentence.indexOf(mark, index + mark.length);

    if (mark === null || end === -1) {
      text += sentence.charAt(index);
      index += 1;
      continue;
    }

    if (text !== '') {
      parts.push({ kind: 'text', text });

      text = '';
    }

    parts.push({
      kind: mark === '**' ? 'strong' : 'code',
      text: sentence.slice(index + mark.length, end),
    });

    index = end + mark.length;
  }

  if (text !== '') {
    parts.push({ kind: 'text', text });
  }

  return parts;
}

const marks = ['**', '`'] as const;

function pickMark(sentence: string, index: number): (typeof marks)[number] | null {
  return marks.find((candidate) => sentence.startsWith(candidate, index)) ?? null;
}
