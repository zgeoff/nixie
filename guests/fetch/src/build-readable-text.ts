// the elements whose content a reader never sees
const hiddenSelector = 'head, script, style, noscript, template, svg, math, iframe, object, canvas';

// the elements that start and end a block of text
const blockSelector = [
  'address, article, aside, blockquote, dd, details, dialog, div, dl, dt, fieldset, figcaption',
  'figure, footer, form, h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section',
  'summary, table, tbody, thead, tfoot, tr, td, th, ul',
].join(', ');

// Builds an HTML page's readable text: its title, then the text nodes outside hidden elements, with
// entities decoded, a line break around each block and each br, and runs of white space collapsed.
export function buildReadableText(html: string): string {
  const parts: string[] = [];
  const title: string[] = [];
  const hidden = { depth: 0 };
  const rewriter = new HTMLRewriter()
    .on('title', {
      text: (text) => {
        title.push(text.text);
      },
    })
    .on(hiddenSelector, {
      element: (element) => {
        hidden.depth += 1;
        element.onEndTag(() => {
          hidden.depth -= 1;
        });
      },
    })
    .on(blockSelector, {
      element: (element) => {
        parts.push('\n');
        if (element.canHaveContent) {
          element.onEndTag(() => {
            parts.push('\n');
          });
        }
      },
    })
    .on('br', {
      element: () => {
        parts.push('\n');
      },
    })
    .onDocument({
      text: (text) => {
        if (hidden.depth === 0) {
          parts.push(text.text);
        }
      },
    });

  rewriter.transform(html);
  return normalizeWhitespace(decodeEntities(`${title.join(' ')}\n\n${parts.join('')}`));
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

  return codePoint > 0 && codePoint <= 0x10_ff_ff ? String.fromCodePoint(codePoint) : '\uFFFD';
}

function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replaceAll(/[\s ]+/gu, ' ').trim())
    .join('\n')
    .replaceAll(/\n{3,}/gu, '\n\n')
    .trim();
}
