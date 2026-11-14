import type { MarkedTextPart } from '@heynixie/wire';

export interface PageLinks {
  // the page's final URL, whose host a link on the same site leaves out
  readonly pageURL: string;

  // the target of each link mark by its index, as the fetcher listed them
  readonly targets: readonly string[];

  // the session's number for each target
  readonly numbers: ReadonlyMap<string, number>;
}

export interface LinkedTextLimits {
  // the most bytes of one part of the text, which a link tag never passes
  readonly textBytes: number;

  // the most characters of an off-site link's path that its tag shows
  readonly linkPathChars: number;
}

// a link tag's place in the text, in UTF-16 code units, which a cut never falls inside
export interface TagSpan {
  readonly start: number;
  readonly end: number;
}

export interface LinkedText {
  readonly text: string;
  readonly tags: readonly TagSpan[];
}

// A tag longer than one part shows as its ID alone, and an ID longer than one part shows nothing,
// so every tag fits in a part and the cut into parts always ends.
export function renderLinkedText(
  parts: readonly MarkedTextPart[],
  page: PageLinks,
  limits: LinkedTextLimits,
): LinkedText {
  const pageHost = URL.parse(page.pageURL)?.hostname ?? null;
  const context = { pageHost, linkPathChars: limits.linkPathChars };
  const pieces: string[] = [];
  const tags: TagSpan[] = [];
  let length = 0;

  for (const part of parts) {
    const piece =
      typeof part === 'string' ? part : pickFittingTag(part.link, page, context, limits.textBytes);

    if (typeof part !== 'string' && piece !== '') {
      tags.push({ start: length, end: length + piece.length });
    }

    pieces.push(piece);

    length += piece.length;
  }

  return { text: pieces.join(''), tags };
}

interface TagContext {
  readonly pageHost: string | null;
  readonly linkPathChars: number;
}

function pickFittingTag(
  index: number,
  page: PageLinks,
  context: TagContext,
  limitBytes: number,
): string {
  const target = page.targets[index];
  const number = target === undefined ? undefined : page.numbers.get(target);

  if (target === undefined || number === undefined) {
    return '';
  }

  const tag = formatLinkTag(number, target, context);
  const shortTag = `[L${number}]`;

  if (Buffer.byteLength(tag) <= limitBytes) {
    return tag;
  }

  return Buffer.byteLength(shortTag) <= limitBytes ? shortTag : '';
}

function formatLinkTag(number: number, target: string, context: TagContext): string {
  const url = URL.parse(target);

  return url === null || url.hostname === context.pageHost
    ? `[L${number}]`
    : `[L${number} · ${url.hostname}${formatPathStart(url.pathname, context.linkPathChars)}]`;
}

// a URL parser leaves square brackets in a path as they are, and a bracket would end the tag early
function formatPathStart(path: string, limitChars: number): string {
  if (path === '/') {
    return '';
  }

  const shown = path.replaceAll('[', '%5B').replaceAll(']', '%5D');

  if (shown.length <= limitChars) {
    return shown;
  }

  let kept = '';

  for (const character of collectPathCharacters(shown)) {
    if (kept.length + character.length > limitChars) {
      break;
    }

    kept += character;
  }

  return `${kept}…`;
}

// a URL parser writes a character outside ASCII as the escapes of its UTF-8 bytes, and half of
// those escapes decodes to no character
function collectPathCharacters(path: string): string[] {
  return path.match(/%[c-f][\da-f](?:%[89ab][\da-f])+|%[\da-f]{2}|[\s\S]/giu) ?? [];
}
