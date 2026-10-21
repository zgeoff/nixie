import { formatLinkMark, stripLinkMarks } from '@heynixie/wire';
import { decodeHTML, decodeHTMLAttribute } from 'entities';

// An HTML page's readable text, with a mark where each link ends, and the target of each link by the
// index its mark names.
export interface ReadableText {
  readonly text: string;
  readonly links: readonly string[];
}

// Builds an HTML page's readable text: its title, the text of its main content with a mark after
// each link, then a short list of the links outside the main content. The web fetch architecture
// doc gives the order in which the fetcher picks the main content.
export function buildReadableText(html: string, pageURL: URL): ReadableText {
  const reading = buildReadingState(pageURL);

  buildPageRewriter(reading).transform(html);

  const links: string[] = [];
  const region = pickContentRegion(reading.regions);
  const content = region === null ? '' : renderParts(reading.regions[region], links);
  const title = decodeRawText([reading.title.join(' ')]);
  const text = normalizeWhitespace(`${title}\n\n${content}`);
  const otherLinks = formatOtherLinks(reading.links, region, links);

  return { text: otherLinks === '' ? text : `${text}\n\n${otherLinks}`, links };
}

interface ElementRule {
  readonly isBlock: boolean;

  // the depth the element adds to while it is open, or null
  readonly counts: 'hidden' | 'furniture' | 'article' | 'main' | 'banner' | null;
}

type Region = 'article' | 'main' | 'page';

// a run of the page's raw text, or the end of a link to the target
type TextPart = string | { readonly target: string };

interface PageLink {
  readonly target: string;
  readonly text: string[];

  // the regions whose text holds the link: none for a link in the page's furniture
  readonly regions: readonly Region[];
}

interface ReadingState {
  readonly pageURL: URL;
  readonly title: string[];
  readonly regions: Record<Region, TextPart[]>;
  readonly depth: Record<NonNullable<ElementRule['counts']>, number>;
  readonly links: PageLink[];
  readonly openLinks: PageLink[];
}

function buildReadingState(pageURL: URL): ReadingState {
  return {
    pageURL,
    title: [],
    regions: { article: [], main: [], page: [] },
    depth: { hidden: 0, furniture: 0, article: 0, main: 0, banner: 0 },
    links: [],
    openLinks: [],
  };
}

// the elements that start and end a block of text, besides the regions and the furniture
const blockSelector = [
  'address, blockquote, dd, details, dialog, div, dl, dt, fieldset, figcaption, figure, form',
  'h1, h2, h3, h4, h5, h6, hr, li, ol, p, pre, section, summary, table, tbody, thead, tfoot, tr',
  'td, th, ul',
].join(', ');

// script, style and the like hide their text, and so do nav and aside, as page furniture
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
  const target = findLinkTarget(element.getAttribute('href') ?? '', reading.pageURL);

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
    reading.openLinks.splice(reading.openLinks.indexOf(link), 1);

    if (isInText) {
      collectPart(reading, ' ');
      collectPart(reading, { target });
    }
  });
}

function findLinkTarget(href: string, pageURL: URL): string | null {
  const target = URL.parse(decodeHTMLAttribute(href.trim()), pageURL.href);

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

// an element takes one end tag handler, so one handler both counts the depth and ends the block
function collectElement(
  reading: ReadingState,
  element: HTMLRewriterTypes.Element,
  rule: ElementRule,
): void {
  // an article or a main element keeps its own header and footer
  const isInRegion = reading.depth.article > 0 || reading.depth.main > 0;
  const counts = rule.counts === 'banner' && isInRegion ? null : rule.counts;
  const isCounted = counts !== null && element.canHaveContent;

  // a region's own separators fall inside the region, so adjacent articles stay apart
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

// the articles, else the main element, else the whole page: the first that holds text
function pickContentRegion(regions: ReadingState['regions']): Region | null {
  const region = regionOrder.find(
    (candidate) => renderParts(regions[candidate], []).replaceAll(/\s/gu, '') !== '',
  );

  return region ?? null;
}

// Each run of raw text is decoded whole, since a reference can span the chunks the rewriter hands
// over, and each link's mark names its target's index in links, which it adds a new target to.
function renderParts(parts: readonly TextPart[], links: string[]): string {
  const rendered: string[] = [];
  let run: string[] = [];

  for (const part of parts) {
    if (typeof part === 'string') {
      run.push(part);
    } else {
      rendered.push(decodeRawText(run), formatLinkMark(pickLinkIndex(links, part.target)));

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

function pickLinkIndex(links: string[], target: string): number {
  const index = links.indexOf(target);

  if (index !== -1) {
    return index;
  }

  links.push(target);

  return links.length - 1;
}

function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replaceAll(/[\s ]+/gu, ' ').trim())
    .join('\n')
    .replaceAll(/\n{3,}/gu, '\n\n')
    .trim();
}

// the most links the trailing list holds, so a page of menus cannot fill the text limit with them
const otherLinkLimit = 20;

// the links outside the main content, once per target, leaving out a target the content shows
function formatOtherLinks(
  links: readonly PageLink[],
  region: Region | null,
  targets: string[],
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
      const mark = formatLinkMark(pickLinkIndex(targets, link.target));
      const line = text === '' ? `- ${mark}` : `- ${text} ${mark}`;

      lines.push(line);
    }
  }

  return lines.length === 0 ? '' : `Other links on this page:\n${lines.join('\n')}`;
}
