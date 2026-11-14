import { expect, test } from 'bun:test';
import { renderShownText } from './render-shown-text';

test('it shows a message with no spans as it is', () => {
  expect(renderShownText('I live in Marlow Vale', [])).toBe('I live in Marlow Vale');
});

test('it wraps each span you did not type, in text order', () => {
  const shown = renderShownText('my address: 12 Fern Row, ok', [
    { start: 24, end: 28, source: 'typed' },
    { start: 12, end: 24, source: 'pasted' },
    { start: 0, end: 12, source: 'typed' },
  ]);

  expect(shown).toMatchInlineSnapshot(`"my address: ⟦12 Fern Row,⟧ ok"`);
});

test('it renders the same text for the same spans', () => {
  const first = renderShownText('see: Fern Row', [
    { start: 0, end: 5, source: 'typed' },
    { start: 5, end: 13, source: 'pasted' },
  ]);

  const second = renderShownText('see: Fern Row', [
    { start: 0, end: 5, source: 'typed' },
    { start: 5, end: 13, source: 'pasted' },
  ]);

  expect(first).toBe(second);
});
