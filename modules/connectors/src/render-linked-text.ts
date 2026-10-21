import type { MarkedTextPart } from '@heynixie/wire';

export interface PageLinks {
  // the page's final URL, whose host a link on the same site leaves out
  readonly pageURL: string;

  // the target of each link mark by its index, as the fetcher listed them
  readonly targets: readonly string[];

  // the session's number for each target
  readonly numbers: ReadonlyMap<string, number>;
}

export interface LinkedText {
  readonly text: string;
  readonly isCut: boolean;
}

export function renderLinkedText(
  parts: readonly MarkedTextPart[],
  page: PageLinks,
  limitBytes: number,
): LinkedText {
  const pageHost = URL.parse(page.pageURL)?.hostname ?? null;
  const rendered: string[] = [];
  let spentBytes = 0;

  for (const part of parts) {
    const piece = typeof part === 'string' ? part : formatLinkTag(part.link, page, pageHost);
    const pieceBytes = Buffer.byteLength(piece);

    if (spentBytes + pieceBytes > limitBytes) {
      const tail = typeof part === 'string' ? cutText(piece, limitBytes - spentBytes) : '';

      rendered.push(tail);

      return { text: rendered.join(''), isCut: true };
    }

    rendered.push(piece);

    spentBytes += pieceBytes;
  }

  return { text: rendered.join(''), isCut: false };
}

function formatLinkTag(index: number, page: PageLinks, pageHost: string | null): string {
  const target = page.targets[index];
  const number = target === undefined ? undefined : page.numbers.get(target);

  if (target === undefined || number === undefined) {
    return '';
  }

  const host = URL.parse(target)?.hostname ?? null;

  return host === null || host === pageHost ? `[L${number}]` : `[L${number} · ${host}]`;
}

function cutText(text: string, limitBytes: number): string {
  const written = new TextEncoder().encodeInto(text, new Uint8Array(limitBytes));

  return text.slice(0, written.read);
}
