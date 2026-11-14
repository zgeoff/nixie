export interface MatchText {
  readonly text: string;

  readonly starts: readonly number[];
  readonly ends: readonly number[];

  readonly boundaries: ReadonlySet<number>;
}

// NFC composes only within a grapheme, so each grapheme normalises alone, and a match starts and
// ends only on a grapheme boundary.
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

interface Piece {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

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
