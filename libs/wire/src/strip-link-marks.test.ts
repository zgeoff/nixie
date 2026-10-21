import { expect, test } from 'bun:test';
import { stripLinkMarks } from './strip-link-marks';

test('it strips each character that opens or closes a link mark', () => {
  expect(stripLinkMarks('Harbour \u{E000}3\u{E001} walk')).toBe('Harbour 3 walk');
});

test('it keeps a text with no mark character as it is', () => {
  expect(stripLinkMarks('Harbour walk, 4 km')).toBe('Harbour walk, 4 km');
});
