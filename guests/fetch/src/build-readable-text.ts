// Builds an HTML page's readable text: its title, the text of its main content with each link's
// target after the link, then a short list of the links outside the main content. The web fetch
// architecture doc gives the order in which the fetcher picks the main content.
export function buildReadableText(html: string, pageURL: URL): string {
  const reading = buildReadingState(pageURL);

  buildPageRewriter(reading).transform(html);

  const region = pickContentRegion(reading.regions);
  const content = region === null ? '' : reading.regions[region].join('');
  const text = normalizeWhitespace(decodeEntities(`${reading.title.join(' ')}\n\n${content}`));
  const otherLinks = formatOtherLinks(reading.links, region);

  return otherLinks === '' ? text : `${text}\n\n${otherLinks}`;
}

interface ElementRule {
  readonly isBlock: boolean;

  // the depth the element adds to while it is open, or null
  readonly counts: 'hidden' | 'furniture' | 'article' | 'main' | 'banner' | null;
}

type Region = 'article' | 'main' | 'page';

interface PageLink {
  readonly target: string;
  readonly text: string[];

  // the regions whose text holds the link: none for a link in the page's furniture
  readonly regions: readonly Region[];
}

interface ReadingState {
  readonly pageURL: URL;
  readonly title: string[];
  readonly regions: Record<Region, string[]>;
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

function collectPart(reading: ReadingState, part: string): void {
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

    // the text is decoded once at the end, so an ampersand in the target is written as a reference
    if (isInText) {
      collectPart(reading, ` [→ ${target.replaceAll('&', '&amp;')}]`);
    }
  });
}

function findLinkTarget(href: string, pageURL: URL): string | null {
  const target = URL.parse(decodeEntities(href.trim()), pageURL.href);

  if (target === null || (target.protocol !== 'https:' && target.protocol !== 'http:')) {
    return null;
  }

  return toURLWithoutFragment(target) === toURLWithoutFragment(pageURL) ? null : target.href;
}

const entityPattern = /&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|[a-zA-Z]{2,8});/gu;

// the numeric references and the common named ones; any other named reference stays as written
function decodeEntities(text: string): string {
  return text.replaceAll(entityPattern, (reference) => decodeEntity(reference));
}

const namedEntities: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
};

function decodeEntity(reference: string): string {
  const body = reference.slice(1, -1);

  if (!body.startsWith('#')) {
    return namedEntities[body] ?? reference;
  }

  const isHex = body[1] === 'x' || body[1] === 'X';
  const codePoint = isHex ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));

  const isScalar =
    codePoint > 0 && codePoint <= 0x10_ff_ff && (codePoint < 0xd8_00 || codePoint > 0xdf_ff);

  return isScalar ? String.fromCodePoint(codePoint) : '\uFFFD';
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
    (candidate) => normalizeWhitespace(decodeEntities(regions[candidate].join(''))) !== '',
  );

  return region ?? null;
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
function formatOtherLinks(links: readonly PageLink[], region: Region | null): string {
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

      const text = normalizeWhitespace(decodeEntities(link.text.join(''))).replaceAll(/\n+/gu, ' ');
      const line = text === '' ? `- [→ ${link.target}]` : `- ${text} [→ ${link.target}]`;

      lines.push(line);
    }
  }

  return lines.length === 0 ? '' : `Other links on this page:\n${lines.join('\n')}`;
}
