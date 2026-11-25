import { expect, test } from 'bun:test';
import { collectMailURLs } from './collect-mail-urls';
import { renderLinkedMailText } from './render-linked-mail-text';

test.each([
  [
    'a plain address',
    'Open https://pier.test/reset?token=abc now',
    ['https://pier.test/reset?token=abc'],
  ],
  ['an address that ends a sentence', 'Go to https://pier.test/a.', ['https://pier.test/a']],
  ['an address in brackets', 'Reset (https://pier.test/a?x=1).', ['https://pier.test/a?x=1']],
  ['an address twice', 'https://pier.test/a and https://pier.test/a', ['https://pier.test/a']],
  [
    'an address alone on its line that ends in punctuation',
    'Reset here:\nhttps://pier.test/reset?token=abc!\nThanks.',
    ['https://pier.test/reset?token=abc!'],
  ],
  [
    'an address alone on a line of a mail with Windows line ends',
    'Reset here:\r\n  https://pier.test/reset?token=abc.\r\nThanks.',
    ['https://pier.test/reset?token=abc.'],
  ],
  [
    'an address in a sentence that ends in an exclamation',
    'See https://pier.test/a!',
    ['https://pier.test/a'],
  ],
  ['no address', 'Your code is 482913.', []],
])('#collectMailURLs finds the addresses of %s', (_title, text, expected) => {
  expect(collectMailURLs(text)).toStrictEqual(expected);
});

test('#renderLinkedMailText swaps each address for its tag and keeps the rest', () => {
  const tags = new Map([['https://pier.test/a', '[L1 · pier.test/a]']]);

  expect(renderLinkedMailText('Open https://pier.test/a, or https://other.test/b.', tags)).toBe(
    'Open [L1 · pier.test/a], or https://other.test/b.',
  );
});

test('#renderLinkedMailText swaps an address alone on its line whole', () => {
  const tags = new Map([['https://pier.test/reset?token=abc!', '[L1 · pier.test/reset]']]);

  expect(renderLinkedMailText('Reset here:\nhttps://pier.test/reset?token=abc!\n', tags)).toBe(
    'Reset here:\n[L1 · pier.test/reset]\n',
  );
});
