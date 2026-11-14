import { expect, test } from 'bun:test';
import { splitEvidenceMessage } from './split-evidence-message';

test('it splits a message around the quote at its offsets', () => {
  expect(
    splitEvidenceMessage('Quick one: my sister Ana lives in Porto now.', 11, 39),
  ).toStrictEqual({ before: 'Quick one: ', quote: 'my sister Ana lives in Porto', after: ' now.' });
});

test('it stops offsets past the end of the message at its end', () => {
  expect(splitEvidenceMessage('Lives in Porto', 9, 40)).toStrictEqual({
    before: 'Lives in ',
    quote: 'Porto',
    after: '',
  });
});

test('it reads an end before the start as an empty quote', () => {
  expect(splitEvidenceMessage('Lives in Porto', 9, 3)).toStrictEqual({
    before: 'Lives in ',
    quote: '',
    after: 'Porto',
  });
});
