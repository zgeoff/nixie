// Splits a text into chunks of at most maxTokens each, at the widest boundary that fits: paragraphs
// first, then sentences, then words, and halves of a word as the last resort, cut between graphemes
// so an emoji stays whole. Each chunk packs as many neighbouring pieces as fit.
export function collectTextChunks(
  text: string,
  countTokens: (text: string) => number,
  maxTokens: number,
): readonly string[] {
  return collectLevelChunks(text.trim(), { countTokens, maxTokens }, 0);
}

interface ChunkLimit {
  readonly countTokens: (text: string) => number;
  readonly maxTokens: number;
}

interface Splitter {
  readonly split: (text: string) => readonly string[];
  readonly joiner: string;
}

const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });

const splitters: readonly Splitter[] = [
  { split: (text) => text.split(/\n\s*\n/u), joiner: '\n\n' },
  { split: (text) => Array.from(sentences.segment(text), (part) => part.segment), joiner: ' ' },
  { split: (text) => text.split(/\s+/u), joiner: ' ' },
  { split: (text) => splitHalves(text), joiner: '' },
];

function collectLevelChunks(text: string, limit: ChunkLimit, level: number): readonly string[] {
  const splitter = splitters[level];

  if (text === '') {
    return [];
  }

  if (splitter === undefined || limit.countTokens(text) <= limit.maxTokens) {
    return [text];
  }

  const parts = splitter
    .split(text)
    .map((part) => part.trim())
    .filter((part) => part !== '');

  const pieces =
    parts.length <= 1
      ? collectLevelChunks(text, limit, level + 1)
      : parts.flatMap((part) => collectLevelChunks(part, limit, level));

  return packPieces(pieces, splitter.joiner, limit);
}

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

function splitHalves(text: string): readonly string[] {
  const points = Array.from(graphemes.segment(text), (part) => part.segment);
  const middle = Math.ceil(points.length / 2);

  return points.length <= 1
    ? [text]
    : [points.slice(0, middle).join(''), points.slice(middle).join('')];
}

function packPieces(
  pieces: readonly string[],
  joiner: string,
  limit: ChunkLimit,
): readonly string[] {
  const chunks: string[] = [];
  let current = '';

  for (const piece of pieces) {
    const joined = current === '' ? piece : `${current}${joiner}${piece}`;

    if (current !== '' && limit.countTokens(joined) > limit.maxTokens) {
      chunks.push(current);

      current = piece;
    } else {
      current = joined;
    }
  }

  return current === '' ? chunks : [...chunks, current];
}
