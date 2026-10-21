import { expect, test } from 'bun:test';
import { formatLinkMark } from './format-link-mark';
import { parseLinkMarks } from './parse-link-marks';

test('it splits a text into its plain runs and the marks of its links', () => {
  expect(
    parseLinkMarks(`The ${formatLinkMark(0)} loaf is out.\n- Menu ${formatLinkMark(12)}`),
  ).toStrictEqual(['The ', { link: 0 }, ' loaf is out.\n- Menu ', { link: 12 }]);
});

test('it returns a text with no mark as one run', () => {
  expect(parseLinkMarks('Tide tables for the week')).toStrictEqual(['Tide tables for the week']);
});

test('it drops a mark the text limit cut short', () => {
  expect(parseLinkMarks('Read the guide \u{E000}1')).toStrictEqual(['Read the guide ']);
});

test('it drops a stray mark character that opens or closes no mark', () => {
  expect(parseLinkMarks('Ferry \u{E001}times \u{E000}x\u{E001}')).toStrictEqual(['Ferry times x']);
});
