import { buildReadableText } from '../build-readable-text';

export interface LinkPageBuild {
  linkCount: number;
  nsPerLink: number;
}

export function measureLinkPageBuild(linkCount: number): LinkPageBuild {
  const anchors = Array.from(
    { length: linkCount },
    (_, index) => `<a href="/${index}">${index}</a>`,
  );

  const html = `<main>${anchors.join(' ')}</main>`;

  const pageURL = new URL('https://dense.test/');

  const startedMs = performance.now();
  const readable = buildReadableText(html, pageURL);

  return {
    linkCount: readable.links.length,
    nsPerLink: ((performance.now() - startedMs) * 1e6) / linkCount,
  };
}
