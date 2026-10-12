// the elements that start and end a block of text, besides the regions and the furniture
const blockSelector = [
  'address, blockquote, dd, details, dialog, div, dl, dt, fieldset, figcaption, figure, form',
  'h1, h2, h3, h4, h5, h6, hr, li, ol, p, pre, section, summary, table, tbody, thead, tfoot, tr',
  'td, th, ul',
].join(', ');

interface ElementRule {
  readonly isBlock: boolean;

  // the depth the element adds to while it is open, or null
  readonly counts: 'hidden' | 'article' | 'main' | 'banner' | null;
}

// script, style and the like hide their text, and so do nav and aside, as page furniture
const elementRules: readonly (readonly [string, ElementRule])[] = [
  [
    'title, script, style, noscript, template, svg, math, iframe',
    { isBlock: false, counts: 'hidden' },
  ],
  ['nav, aside', { isBlock: true, counts: 'hidden' }],
  ['article', { isBlock: true, counts: 'article' }],
  ['main', { isBlock: true, counts: 'main' }],
  ['header, footer', { isBlock: true, counts: 'banner' }],
  [blockSelector, { isBlock: true, counts: null }],
];

// Builds an HTML page's readable text: its title, then the text of its main content, with entities
// decoded, a line break around each block and each br, and runs of white space collapsed. The web
// fetch architecture doc gives the order in which the fetcher picks the main content.
export function buildReadableText(html: string): string {
  const reading = buildReadingState();

  buildPageRewriter(reading).transform(html);
  const content = pickContent(reading.regions);

  return normalizeWhitespace(decodeEntities(`${reading.title.join(' ')}\n\n${content}`));
}

interface ReadingState {
  readonly title: string[];
  readonly regions: {
    readonly article: string[];
    readonly main: string[];
    readonly page: string[];
  };
  readonly depth: Record<NonNullable<ElementRule['counts']>, number>;
}

function buildReadingState(): ReadingState {
  return {
    title: [],
    regions: { article: [], main: [], page: [] },
    depth: { hidden: 0, article: 0, main: 0, banner: 0 },
  };
}

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
    .onDocument({
      text: (text) => {
        if (reading.depth.hidden === 0 && reading.depth.banner === 0) {
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

// an element takes one end tag handler, so one handler both counts the depth and ends the block
function collectElement(
  reading: ReadingState,
  element: HTMLRewriterTypes.Element,
  rule: ElementRule,
): void {
  // an article keeps its own header and footer
  const counts = rule.counts === 'banner' && reading.depth.article > 0 ? null : rule.counts;

  if (rule.isBlock) {
    collectPart(reading, '\n');
  }
  if (!element.canHaveContent) {
    return;
  }
  if (counts !== null) {
    reading.depth[counts] += 1;
  }
  element.onEndTag(() => {
    if (counts !== null) {
      reading.depth[counts] -= 1;
    }
    if (rule.isBlock) {
      collectPart(reading, '\n');
    }
  });
}

function collectPart(reading: ReadingState, part: string): void {
  reading.regions.page.push(part);
  if (reading.depth.main > 0) {
    reading.regions.main.push(part);
  }
  if (reading.depth.article > 0) {
    reading.regions.article.push(part);
  }
}

// the articles, else the main element, else the whole page: the first that holds text
function pickContent(regions: ReadingState['regions']): string {
  const content = [regions.article, regions.main, regions.page]
    .map((parts) => parts.join(''))
    .find((text) => normalizeWhitespace(decodeEntities(text)) !== '');

  return content ?? '';
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

const entityPattern = /&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|[a-zA-Z]{2,8});/gu;

// the numeric references and the common named ones; any other named reference stays as written
function decodeEntities(text: string): string {
  return text.replaceAll(entityPattern, (reference) => decodeEntity(reference));
}

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

function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replaceAll(/[\s ]+/gu, ' ').trim())
    .join('\n')
    .replaceAll(/\n{3,}/gu, '\n\n')
    .trim();
}
