import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { startFaultPointHold } from './test-utils/start-fault-point-hold';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it reads every pinned active item in the order you pinned them', async () => {
  const ctx = await setupTest();

  const provenance = buildMockProvenance({ origin: 'owner', source: 'owner', proposalID: null });

  const name = await ctx.memory.store.remember({ text: 'Goes by Sam', provenance });
  const pronouns = await ctx.memory.store.remember({ text: 'Uses they/them', provenance });

  await ctx.memory.store.remember({ text: 'Allergic to hazelnuts', provenance });
  await ctx.memory.store.pin({ itemID: pronouns.itemID, isPinned: true, provenance });
  await ctx.memory.store.pin({ itemID: name.itemID, isPinned: true, provenance });

  const core = await ctx.memory.store.readPinnedCore();

  expect(core).toStrictEqual([
    {
      itemID: pronouns.itemID,
      shortID: expect.toBeString(),
      version: 1,
      change: 'created',
      state: 'active',
      isPinned: true,
      subject: 'owner',
      origin: 'owner',
      source: 'owner',
      recordedAt: expect.toBeNumber(),
      text: 'Uses they/them',
      evidenceQuote: null,
      image: null,
      model: null,
      approval: null,
    },
    {
      itemID: name.itemID,
      shortID: expect.toBeString(),
      version: 1,
      change: 'created',
      state: 'active',
      isPinned: true,
      subject: 'owner',
      origin: 'owner',
      source: 'owner',
      recordedAt: expect.toBeNumber(),
      text: 'Goes by Sam',
      evidenceQuote: null,
      image: null,
      model: null,
      approval: null,
    },
  ]);
});

test('it reads the current text of a pinned item that was edited', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const item = await ctx.memory.store.remember({ text: 'Goes by Sam', isPinned: true, provenance });

  await ctx.memory.store.remember({ text: 'Goes by Sasha', target: item, provenance });

  const core = await ctx.memory.store.readPinnedCore();

  expect(core.map((pinned) => pinned.text)).toStrictEqual(['Goes by Sasha']);
});

test('it never reads an item that a forget began', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const item = await ctx.memory.store.remember({ text: 'Goes by Sam', isPinned: true, provenance });

  const hold = startFaultPointHold('memory.forget.key_removed');
  const forget = ctx.memory.store.forget({ target: item, provenance });

  await hold.reached;

  const core = await ctx.memory.store.readPinnedCore();

  hold.release();

  await forget;

  expect(core).toStrictEqual([]);
});

test('it leaves a pinned item out from its end time, before any sweep runs', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-19T22:59:59Z') - clock.now());

  const core = await memory.store.readPinnedCore();

  expect(core).toStrictEqual([]);
});
