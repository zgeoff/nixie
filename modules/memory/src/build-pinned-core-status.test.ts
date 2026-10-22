import { expect, test } from 'bun:test';
import { buildPinnedCoreStatus } from './build-pinned-core-status';

test.each([
  [
    { items: 0, tokens: 0, budget: 2000 },
    'Pinned memory: 0 items',
    'Pinned memory tokens: 0 of 2000',
  ],
  [
    { items: 1, tokens: 31, budget: 2000 },
    'Pinned memory: 1 item',
    'Pinned memory tokens: 31 of 2000',
  ],
  [
    { items: 6, tokens: 412, budget: 1500 },
    'Pinned memory: 6 items',
    'Pinned memory tokens: 412 of 1500',
  ],
])('it reads the count and the tokens of the core %p', async (use, itemsText, tokensText) => {
  const entries = buildPinnedCoreStatus(() => Promise.resolve(use));

  const facts = {
    start: { kind: 'first' as const },
    openedAt: new Date('2026-10-14T11:50:00Z'),
    times: { defaultZone: 'UTC', now: new Date('2026-10-14T11:50:00Z') },
    model: 'claude-test-1',
  };

  const lines = await Promise.all(
    entries.map(async (entry) => ({ name: entry.name, line: await entry.read(facts) })),
  );

  expect(lines).toStrictEqual([
    { name: 'pinned_items', line: { value: use.items, text: itemsText } },
    { name: 'pinned_tokens', line: { value: use.tokens, text: tokensText } },
  ]);
});
