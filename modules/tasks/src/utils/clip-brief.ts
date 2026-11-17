const briefClipLength = 200;

const graphemeSegmenter = new Intl.Segmenter();

export interface ClippedText {
  readonly text: string;
  readonly isClipped: boolean;
}

// The first line of the text, trimmed and cut to the clip length with a trailing ellipsis.
export function clipBrief(brief: string): ClippedText {
  const trimmed = brief.trim();
  const firstLine = (trimmed.split(/\r?\n/u)[0] ?? '').trim();
  const characters = Array.from(graphemeSegmenter.segment(firstLine), (part) => part.segment);

  if (characters.length > briefClipLength) {
    return { text: `${characters.slice(0, briefClipLength).join('')}…`, isClipped: true };
  }

  return { text: firstLine, isClipped: firstLine !== trimmed };
}
