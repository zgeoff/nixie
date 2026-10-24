import { expect, test } from 'bun:test';
import { toPlainTranscript } from './to-plain-transcript.ts';

test.each([
  ['a full stop', 'turn the hall lights off.', 'turn the hall lights off'],
  ['a question mark', 'is the bakery open on sunday?', 'is the bakery open on sunday'],
  ['commas between clauses', 'yes, hello, the parcel is late', 'yes hello the parcel is late'],
  ['capitals', 'Book A Table For Two', 'book a table for two'],
  ['an abbreviation with dots', 'wake me at 7 a.m. tomorrow', 'wake me at 7 a m tomorrow'],
  ['a hyphenated word', 'a two-week trip', 'a two week trip'],
  ['spaces at the ends', '  play some jazz  ', 'play some jazz'],
])('it strips %s', (_, text, expected) => {
  expect(toPlainTranscript(text)).toBe(expected);
});

test('it keeps the apostrophe of a contraction', () => {
  expect(toPlainTranscript("I don't think that's it.")).toBe("i don't think that's it");
});
