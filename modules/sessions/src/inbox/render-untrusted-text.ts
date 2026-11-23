import { renderFenced } from '@heynixie/wire';

// Text that a page or the model supplied, inside the markers that a page read shows. The text is
// written as a JSON string, as a page read escapes it, so no text can write a closing marker.
export function renderUntrustedText(text: string, mint: () => string): string[] {
  return renderFenced({
    tag: 'tool-result',
    attributes: { source: 'untrusted' },
    text: JSON.stringify(text),
    fence: mint(),
  }).split('\n');
}
