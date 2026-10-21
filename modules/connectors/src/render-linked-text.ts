import type { MarkedTextPart } from '@heynixie/wire';

export interface PageLinks {
  // the page's final URL, whose host a link on the same site leaves out
  readonly pageURL: string;

  // the target of each link mark by its index, as the fetcher listed them
  readonly targets: readonly string[];

  // the session's number for each target
  readonly numbers: ReadonlyMap<string, number>;
}

// Renders a fetched page's text with each link mark as its link's ID, such as [L12], and the
// link's host after the ID when the link leaves the page's site, such as [L40 · example.org]. A
// mark with no target or no number is dropped.
export function renderLinkedText(parts: readonly MarkedTextPart[], page: PageLinks): string {
  const pageHost = URL.parse(page.pageURL)?.hostname ?? null;

  return parts
    .map((part) => (typeof part === 'string' ? part : formatLinkTag(part.link, page, pageHost)))
    .join('');
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
