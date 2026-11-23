import invariant from 'tiny-invariant';

export interface FencedText {
  readonly tag: string;

  // written before the marker, in order
  readonly attributes: Readonly<Record<string, string>>;
  readonly text: string;

  // a fresh random ID from mintBlockID, which the caller keeps when it needs it elsewhere
  readonly fence: string;

  // the attribute that carries the fence on both tags
  readonly marker?: string;

  // true puts the text on the tag's own line, with no line break around it
  readonly inline?: boolean;
}

// Wraps text that came from outside nixie. The random fence stops the text from closing the element
// early, so it cannot pass as nixie's own words. It does not authenticate the element.
export function renderFenced(fenced: FencedText): string {
  const marker = fenced.marker ?? 'fence';
  const attributes = Object.entries({ ...fenced.attributes, [marker]: fenced.fence });
  const open = `<${[fenced.tag, ...attributes.map(([name, value]) => `${name}="${escapeAttribute(value)}"`)].join(' ')}>`;
  const close = `</${fenced.tag} ${marker}="${escapeAttribute(fenced.fence)}">`;

  invariant(!fenced.text.includes(close), 'fenced text holds its own closing tag');

  return fenced.inline === true
    ? `${open}${fenced.text}${close}`
    : [open, fenced.text, close].join('\n');
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
