import { expect, test } from 'bun:test';
import { findQuotedBlocks } from './find-quoted-blocks';

test('it finds no block in a plain message', () => {
  expect(findQuotedBlocks('I take my coffee black.')).toStrictEqual([]);
});

test('it finds a blockquote line', () => {
  expect(findQuotedBlocks('my sister said\n> we moved to Leeds\nnice')).toStrictEqual([
    { start: 15, end: 34 },
  ]);
});

test('it finds a code fence from its opening line to its closing line', () => {
  expect(findQuotedBlocks('look:\n```\nI take my coffee black\n```\nok')).toStrictEqual([
    { start: 6, end: 36 },
  ]);
});

test('it keeps a tilde fence open past a backtick fence inside it', () => {
  expect(findQuotedBlocks('~~~~\n```\nI take my coffee black\n~~~~')).toStrictEqual([
    { start: 0, end: 36 },
  ]);
});

test('it keeps a fence open past a shorter closing run of its own character', () => {
  expect(findQuotedBlocks('````\nI take my coffee black\n```\nmore\n````')).toStrictEqual([
    { start: 0, end: 41 },
  ]);
});

test('it runs an unclosed fence to the end of the message', () => {
  expect(findQuotedBlocks('```\nI take my coffee black')).toStrictEqual([{ start: 0, end: 26 }]);
});

test('it runs a reply header and everything below it as one block', () => {
  expect(
    findQuotedBlocks('sounds good\nOn Monday, Sam wrote:\nI take my coffee black'),
  ).toStrictEqual([{ start: 12, end: 56 }]);
});
