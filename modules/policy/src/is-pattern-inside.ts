const wildcard = '*';

export function isPatternInside(inner: string, outer: string): boolean {
  const innerChars = toGraphemes(inner);
  const outerChars = toGraphemes(outer);

  const known = new Map<string, boolean>();

  const isInside = (innerAt: number, outerAt: number): boolean => {
    const key = `${String(innerAt)}:${String(outerAt)}`;
    const found = known.get(key);

    if (found !== undefined) {
      return found;
    }

    const answer = isUncachedInside(innerAt, outerAt);

    known.set(key, answer);

    return answer;
  };

  const isUncachedInside = (innerAt: number, outerAt: number): boolean => {
    if (outerAt === outerChars.length) {
      return innerAt === innerChars.length;
    }

    if (outerChars[outerAt] === wildcard) {
      return (
        isInside(innerAt, outerAt + 1) ||
        (innerAt < innerChars.length && isInside(innerAt + 1, outerAt))
      );
    }

    const innerChar = innerChars[innerAt];

    return (
      innerChar !== undefined &&
      innerChar !== wildcard &&
      innerChar === outerChars[outerAt] &&
      isInside(innerAt + 1, outerAt + 1)
    );
  };

  return isInside(0, 0);
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

function toGraphemes(text: string): readonly string[] {
  return Array.from(segmenter.segment(text.normalize('NFC')), (part) => part.segment);
}
