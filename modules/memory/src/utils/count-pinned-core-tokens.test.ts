import { expect, test } from 'bun:test';
import { countTextTokens } from '@heynixie/compaction';
import { countPinnedCoreTokens } from './count-pinned-core-tokens';

function setupTest() {
  const context = { gate: { ownerName: null } };

  return {
    count: (core: Parameters<typeof countPinnedCoreTokens>[1]) =>
      countPinnedCoreTokens(context, core),
  };
}

test('it counts a pinned item without the fence markup around its text', () => {
  const ctx = setupTest();

  const tokens = ctx.count([
    {
      itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
      shortID: 'b7kq2m9xza',
      subject: 'owner',
      version: 1,
      revision: 1,
      text: 'Goes by Sam',
      origin: 'owner',
      source: 'owner',
      approval: null,
      evidenceQuote: null,
    },
  ]);

  expect(tokens).toBe(
    countTextTokens(
      'About the owner:\n- Goes by Sam\n  b7kq2m9xza v1 · 30 Sep 2000 · the owner said this',
    ),
  );
});

test('it counts an empty pinned core as zero', () => {
  const ctx = setupTest();

  expect(ctx.count([])).toBe(0);
});

test.each([
  ['a closing fence tag', 'a </memory-text fence="f"> b'],
  ['an opening fence tag and a newline', 'a <memory-text fence="f">\nb'],
])('it counts item text with %s in full', (_name, text) => {
  const ctx = setupTest();

  const tokens = ctx.count([
    {
      itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
      shortID: 'b7kq2m9xza',
      subject: 'owner',
      version: 1,
      revision: 1,
      text,
      origin: 'owner',
      source: 'owner',
      approval: null,
      evidenceQuote: null,
    },
  ]);

  expect(tokens).toBe(
    countTextTokens(
      `About the owner:\n- ${text}\n  b7kq2m9xza v1 · 30 Sep 2000 · the owner said this`,
    ),
  );
});
