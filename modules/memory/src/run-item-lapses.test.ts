import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { startFaultPointHold } from './test-utils/start-fault-point-hold';
import { startTestMemory } from './test-utils/start-test-memory';

test('it retires a lapsed item once, with the lapse origin, and leaves an item with no end time alone', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const lapsing = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  const lasting = await memory.store.remember({
    text: 'Lives in Bristol',
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  const first = await memory.store.lapse();
  const second = await memory.store.lapse();

  const recalled = await memory.store.recall({
    itemIDs: [lapsing.itemID, lasting.itemID],
    includeRetired: true,
    includeHistory: true,
  });

  expect(first).toBe(1);
  expect(second).toBe(0);

  expect(recalled.items).toMatchObject([
    {
      itemID: lapsing.itemID,
      state: 'retired',
      history: [
        { version: 1, change: 'created', state: 'active', origin: 'owner' },
        { version: 2, change: 'retired', state: 'retired', origin: 'lapse' },
      ],
    },
    {
      itemID: lasting.itemID,
      state: 'active',
      history: [{ version: 1, change: 'created', state: 'active', origin: 'owner' }],
    },
  ]);
});

test('it leaves an item whose end time is still to come active', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-19T22:59:58Z') - clock.now());

  const lapsed = await memory.store.lapse();
  const recalled = await memory.store.recall({ itemIDs: [item.itemID] });

  expect(lapsed).toBe(0);
  expect(recalled.items).toMatchObject([{ itemID: item.itemID, state: 'active', version: 1 }]);
});

test('it takes a pinned item that lapses out of the pinned core', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  await memory.store.lapse();

  const core = await memory.store.readPinnedCore();
  const recalled = await memory.store.recall({ itemIDs: [item.itemID], includeRetired: true });

  expect(core).toStrictEqual([]);

  expect(recalled.items).toMatchObject([
    { itemID: item.itemID, state: 'retired', isPinned: false },
  ]);
});

test('it skips an item that an edit changed after the sweep read it, and retires it on the next sweep', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  const hold = startFaultPointHold('memory.lapse.read');
  const sweeping = memory.store.lapse();

  await hold.reached;

  await memory.store.remember({
    target: item,
    text: 'Is in Lisbon until Sunday',
    provenance: buildMockProvenance(),
  });

  hold.release();

  const first = await sweeping;
  const second = await memory.store.lapse();
  const recalled = await memory.store.recall({ itemIDs: [item.itemID], includeRetired: true });

  expect(first).toBe(0);
  expect(second).toBe(1);

  expect(recalled.items).toMatchObject([
    { version: 3, state: 'retired', change: 'retired', origin: 'lapse' },
  ]);
});
