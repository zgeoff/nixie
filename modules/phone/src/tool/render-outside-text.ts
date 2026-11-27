import { mintBlockID, renderFenced } from '@heynixie/wire';

// A text that came from outside nixie, sealed the way the model reads any outside text: inside a
// tool-result element marked untrusted, written as a JSON string so no text can write the closing
// tag.
export function renderOutsideText(text: string, mint: () => string = mintBlockID): string {
  return renderFenced({
    tag: 'tool-result',
    attributes: { source: 'untrusted' },
    text: JSON.stringify(text),
    fence: mint(),
  });
}
