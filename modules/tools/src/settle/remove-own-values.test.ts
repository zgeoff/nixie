import { expect, test } from 'bun:test';
import { removeOwnValues } from './remove-own-values';
import type { Settled } from './types';

function setupTest() {
  const base: Settled = {
    outcome: 'result',
    actionID: null,
    sources: { text: 'untrusted' },
    content: { text: 'plain' },
    reply: { kind: 'typed', result: { text: 'plain' }, images: [] },
  };

  return { base };
}

test('it returns the settled result as it is when nixie holds no value', () => {
  const ctx = setupTest();
  const settled = ctx.base;

  expect(removeOwnValues(settled, [])).toBe(settled);
});

test('it cuts a value from the content and the typed reply, down to nested lists and keys', () => {
  const ctx = setupTest();

  const settled: Settled = {
    ...ctx.base,
    content: { text: 'a fake-own-1 b', 'k-fake-own-1': ['fake-own-1', { deep: 'fake-own-1' }] },
    reply: {
      kind: 'typed',
      result: { text: 'a fake-own-1 b', count: 3, flag: true, none: null },
      images: [],
    },
  };

  const cut = removeOwnValues(settled, ['fake-own-1']);

  expect([cut.content, cut.reply]).toStrictEqual([
    {
      text: 'a [secret removed] b',
      'k-[secret removed]': ['[secret removed]', { deep: '[secret removed]' }],
    },
    {
      kind: 'typed',
      result: { text: 'a [secret removed] b', count: 3, flag: true, none: null },
      images: [],
    },
  ]);
});

test('it cuts a value from the text of a text reply', () => {
  const ctx = setupTest();

  const settled: Settled = {
    ...ctx.base,
    reply: { kind: 'text', text: 'oops fake-own-2', isError: true },
  };

  expect(removeOwnValues(settled, ['fake-own-2']).reply).toStrictEqual({
    kind: 'text',
    text: 'oops [secret removed]',
    isError: true,
  });
});
