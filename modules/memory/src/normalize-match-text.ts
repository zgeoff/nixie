// Text in the form a quote and a message compare in: NFC, with each run of whitespace collapsed to
// one space. Each UTF-16 unit of the normalised text maps back to the grapheme it came from, so a
// match maps back onto the spans the client recorded.
export interface MatchText {
  readonly text: string;

  // the start and end offsets in the original text of the grapheme that holds each normalised unit
  readonly starts: readonly number[];
  readonly ends: readonly number[];

  // each normalised index where a grapheme begins
  readonly boundaries: ReadonlySet<number>;
}

// NFC composes only within a grapheme, so each grapheme is normalised alone, and a match can start
// and end only where a grapheme does.
export function normalizeMatchText(text: string): MatchText {
  const pieces = collectPieces(text);

  return {
    text: pieces.map((piece) => piece.text).join(''),
    starts: pieces.flatMap((piece) => Array.from({ length: piece.text.length }, () => piece.start)),
    ends: pieces.flatMap((piece) => Array.from({ length: piece.text.length }, () => piece.end)),
    boundaries: new Set(collectBoundaries(pieces)),
  };
}

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

// one grapheme in its normalised form, with its offsets in the original text
interface Piece {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

// a run of whitespace graphemes becomes one space at the first of them
function collectPieces(text: string): readonly Piece[] {
  const parts = [...graphemes.segment(text)];

  return parts.flatMap((part, index) => {
    const isSpace = isWhitespace(part.segment);
    const previous = parts[index - 1];

    if (isSpace && previous !== undefined && isWhitespace(previous.segment)) {
      return [];
    }

    return [
      {
        text: isSpace ? ' ' : part.segment.normalize('NFC'),
        start: part.index,
        end: part.index + part.segment.length,
      },
    ];
  });
}

function isWhitespace(segment: string): boolean {
  return /^\s+$/u.test(segment);
}

function collectBoundaries(pieces: readonly Piece[]): readonly number[] {
  let offset = 0;

  return pieces.map((piece) => {
    const at = offset;

    offset += piece.text.length;

    return at;
  });
}
