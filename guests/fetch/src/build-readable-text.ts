import { formatLinkMark, stripLinkMarks } from '@heynixie/wire';
import { decodeHTML, decodeHTMLAttribute } from 'entities';

// An HTML page's readable text, with a mark where each link ends, and the target of each link by the
// index its mark names.
export interface ReadableText {
  readonly text: string;
  readonly links: readonly string[];
}

export function buildReadableText(html: string, pageURL: URL): ReadableText {
  const reading = buildReadingState(pageURL);

  buildPageRewriter(reading).transform(html);

  const linkIndexes = new Map<string, number>();

  const region = pickContentRegion(reading.regions);
  const content = region === null ? '' : renderParts(reading.regions[region], linkIndexes);
  const title = decodeRawText([reading.title.join(' ')]);
  const text = normalizeWhitespace(`${title}\n\n${content}`);
  const otherLinks = formatOtherLinks(reading.links, region, linkIndexes);

  return {
    text: otherLinks === '' ? text : `${text}\n\n${otherLinks}`,
    links: [...linkIndexes.keys()],
  };
}

interface ElementRule {
  readonly isBlock: boolean;

  readonly counts: 'hidden' | 'furniture' | 'article' | 'main' | 'banner' | null;
}

type Region = 'article' | 'main' | 'page';

// a run of the page's raw text, or the end of a link to the target
type TextPart = string | { readonly target: string };

interface PageLink {
  readonly target: string;
  readonly text: string[];

  readonly regions: readonly Region[];
}

interface ReadingState {
  readonly pageURL: URL;

  // the URL that links resolve against: the href of the first base element that has one, else the
  // page URL
  readonly base: { hasHref: boolean; url: URL };
  readonly title: string[];
  readonly regions: Record<Region, TextPart[]>;
  readonly depth: Record<NonNullable<ElementRule['counts']>, number>;
  readonly links: PageLink[];
  readonly openLinks: PageLink[];
}

function buildReadingState(pageURL: URL): ReadingState {
  return {
    pageURL,
    base: { hasHref: false, url: pageURL },
    title: [],
    regions: { article: [], main: [], page: [] },
    depth: { hidden: 0, furniture: 0, article: 0, main: 0, banner: 0 },
    links: [],
    openLinks: [],
  };
}

const blockSelector = [
  'address, blockquote, dd, details, dialog, div, dl, dt, fieldset, figcaption, figure, form',
  'h1, h2, h3, h4, h5, h6, hr, li, ol, p, pre, section, summary, table, tbody, thead, tfoot, tr',
  'td, th, ul',
].join(', ');

const elementRules: readonly (readonly [string, ElementRule])[] = [
  [
    'title, script, style, noscript, template, svg, math, iframe',
    { isBlock: false, counts: 'hidden' },
  ],
  ['nav, aside', { isBlock: true, counts: 'furniture' }],
  ['article', { isBlock: true, counts: 'article' }],
  ['main', { isBlock: true, counts: 'main' }],
  ['header, footer', { isBlock: true, counts: 'banner' }],
  [blockSelector, { isBlock: true, counts: null }],
];

function buildPageRewriter(reading: ReadingState): HTMLRewriter {
  const rewriter = new HTMLRewriter()
    .on('title', {
      text: (text) => {
        reading.title.push(text.text);
      },
    })
    .on('base[href]', {
      element: (element) => {
        collectBase(reading, element);
      },
    })
    .on('br', {
      element: () => {
        collectPart(reading, '\n');
      },
    })
    .on('a[href]', {
      element: (element) => {
        collectLink(reading, element);
      },
    })
    .onDocument({
      text: (text) => {
        if (reading.depth.hidden > 0) {
          return;
        }

        reading.openLinks.at(-1)?.text.push(text.text);

        if (isInContent(reading)) {
          collectPart(reading, text.text);
        }
      },
    });

  for (const [selector, rule] of elementRules) {
    rewriter.on(selector, {
      element: (element) => {
        collectElement(reading, element, rule);
      },
    });
  }

  return rewriter;
}

function collectBase(reading: ReadingState, element: HTMLRewriterTypes.Element): void {
  if (reading.base.hasHref) {
    return;
  }

  reading.base.hasHref = true;

  const base = URL.parse(
    decodeHTMLAttribute((element.getAttribute('href') ?? '').trim()),
    reading.pageURL.href,
  );

  if (base !== null && (base.protocol === 'https:' || base.protocol === 'http:')) {
    reading.base.url = base;
  }
}

function collectPart(reading: ReadingState, part: TextPart): void {
  for (const region of getOpenRegions(reading)) {
    reading.regions[region].push(part);
  }
}

function getOpenRegions(reading: ReadingState): Region[] {
  const regions: Region[] = ['page'];

  if (reading.depth.main > 0) {
    regions.push('main');
  }

  if (reading.depth.article > 0) {
    regions.push('article');
  }

  return regions;
}

function collectLink(reading: ReadingState, element: HTMLRewriterTypes.Element): void {
  const target = findLinkTarget(
    element.getAttribute('href') ?? '',
    reading.base.url,
    reading.pageURL,
  );

  if (target === null || reading.depth.hidden > 0) {
    return;
  }

  const isInText = isInContent(reading);

  const link: PageLink = {
    target,
    text: [],
    regions: isInText ? getOpenRegions(reading) : [],
  };

  reading.links.push(link);
  reading.openLinks.push(link);

  element.onEndTag(() => {
    reading.openLinks.splice(reading.openLinks.lastIndexOf(link), 1);

    if (isInText) {
      collectPart(reading, ' ');
      collectPart(reading, { target });
    }
  });
}

function findLinkTarget(href: string, base: URL, pageURL: URL): string | null {
  const target = URL.parse(decodeHTMLAttribute(href.trim()), base.href);

  if (target === null || (target.protocol !== 'https:' && target.protocol !== 'http:')) {
    return null;
  }

  return toURLWithoutFragment(target) === toURLWithoutFragment(pageURL) ? null : target.href;
}

function toURLWithoutFragment(url: URL): string {
  const copy = new URL(url.href);

  copy.hash = '';

  return copy.href;
}

function isInContent(reading: ReadingState): boolean {
  return reading.depth.hidden === 0 && reading.depth.furniture === 0 && reading.depth.banner === 0;
}

// HTMLRewriter takes one end tag handler per element, so one handler both counts the depth and
// ends the block.
function collectElement(
  reading: ReadingState,
  element: HTMLRewriterTypes.Element,
  rule: ElementRule,
): void {
  const isInRegion = reading.depth.article > 0 || reading.depth.main > 0;
  const counts = rule.counts === 'banner' && isInRegion ? null : rule.counts;
  const isCounted = counts !== null && element.canHaveContent;

  if (isCounted) {
    reading.depth[counts] += 1;
  }

  if (rule.isBlock) {
    collectPart(reading, '\n');
  }

  if (!element.canHaveContent) {
    return;
  }

  element.onEndTag(() => {
    if (rule.isBlock) {
      collectPart(reading, '\n');
    }

    if (isCounted) {
      reading.depth[counts] -= 1;
    }
  });
}

const regionOrder: readonly Region[] = ['article', 'main', 'page'];

function pickContentRegion(regions: ReadingState['regions']): Region | null {
  const region = regionOrder.find(
    (candidate) => renderParts(regions[candidate], new Map()).replaceAll(/\s/gu, '') !== '',
  );

  return region ?? null;
}

// Each run of raw text is decoded whole, since a reference can span the chunks the rewriter hands
// over, and each link's mark names its target's index, which a new target takes as the next one.
function renderParts(parts: readonly TextPart[], linkIndexes: Map<string, number>): string {
  const rendered: string[] = [];
  let run: string[] = [];

  for (const part of parts) {
    if (typeof part === 'string') {
      run.push(part);
    } else {
      rendered.push(decodeRawText(run), formatLinkMark(pickLinkIndex(linkIndexes, part.target)));

      run = [];
    }
  }

  rendered.push(decodeRawText(run));

  return rendered.join('');
}

// a page's own text never keeps a mark character, so every mark in the result is the fetcher's
function decodeRawText(chunks: readonly string[]): string {
  return stripLinkMarks(decodeHTML(chunks.join('')));
}

function pickLinkIndex(linkIndexes: Map<string, number>, target: string): number {
  const index = linkIndexes.get(target) ?? linkIndexes.size;

  linkIndexes.set(target, index);

  return index;
}

function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replaceAll(/[\s ]+/gu, ' ').trim())
    .join('\n')
    .replaceAll(/\n{3,}/gu, '\n\n')
    .trim();
}

const otherLinkLimit = 20;

function formatOtherLinks(
  links: readonly PageLink[],
  region: Region | null,
  linkIndexes: Map<string, number>,
): string {
  const shownTargets = new Set(
    links
      .filter((link) => region !== null && link.regions.includes(region))
      .map((link) => link.target),
  );

  const lines: string[] = [];

  for (const link of links) {
    if (lines.length === otherLinkLimit) {
      break;
    }

    if (!shownTargets.has(link.target)) {
      shownTargets.add(link.target);

      const text = normalizeWhitespace(decodeRawText(link.text)).replaceAll(/\n+/gu, ' ');
      const mark = formatLinkMark(pickLinkIndex(linkIndexes, link.target));
      const line = text === '' ? `- ${mark}` : `- ${text} ${mark}`;

      lines.push(line);
    }
  }

  return lines.length === 0 ? '' : `Other links on this page:\n${lines.join('\n')}`;
}
