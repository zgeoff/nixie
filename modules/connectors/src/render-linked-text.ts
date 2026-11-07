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
  // the most bytes of the whole text, its link tags included
  readonly textBytes: number;

  // the most characters of an off-site link's path that its tag shows
  readonly linkPathChars: number;
}

export interface LinkedText {
  readonly text: string;
  readonly isCut: boolean;
}

export function renderLinkedText(
  parts: readonly MarkedTextPart[],
  page: PageLinks,
  limits: LinkedTextLimits,
): LinkedText {
  const pageHost = URL.parse(page.pageURL)?.hostname ?? null;
  const rendered: string[] = [];
  let spentBytes = 0;

  for (const part of parts) {
    const piece =
      typeof part === 'string'
        ? part
        : formatLinkTag(part.link, page, { pageHost, linkPathChars: limits.linkPathChars });

    const pieceBytes = Buffer.byteLength(piece);

    if (spentBytes + pieceBytes > limits.textBytes) {
      const tail = typeof part === 'string' ? cutText(piece, limits.textBytes - spentBytes) : '';

      rendered.push(tail);

      return { text: rendered.join(''), isCut: true };
    }

    rendered.push(piece);

    spentBytes += pieceBytes;
  }

  return { text: rendered.join(''), isCut: false };
}

interface TagContext {
  readonly pageHost: string | null;
  readonly linkPathChars: number;
}

function formatLinkTag(index: number, page: PageLinks, context: TagContext): string {
  const target = page.targets[index];
  const number = target === undefined ? undefined : page.numbers.get(target);

  if (target === undefined || number === undefined) {
    return '';
  }

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

  return shown.length <= limitChars
    ? shown
    : `${shown.slice(0, limitChars).replace(/%[\da-f]?$/iu, '')}…`;
}

function cutText(text: string, limitBytes: number): string {
  const written = new TextEncoder().encodeInto(text, new Uint8Array(limitBytes));

  return text.slice(0, written.read);
}
