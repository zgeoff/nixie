import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { createProposal } from '../test-utils/create-proposal';
import { startTestMemory } from '../test-utils/start-test-memory';
import type { LapseSweepOptions } from './start-lapse-sweep';
import { startLapseSweep } from './start-lapse-sweep';

async function setupTest() {
  const clock = createFakeClock({ startMs: 0 });

  const memory = await startTestMemory({
    gate: {
      clock,
      limits: { evidenceWindow: 20, proposalLapseMs: 5000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  const start = (options: Partial<LapseSweepOptions> = {}) => {
    const sweep = startLapseSweep({ store: memory.store, clock, onError: () => {}, ...options });

    onTestFinished(() => sweep.stop());

    return sweep;
  };

  return { clock, memory, start };
}

test('it retires a memory item past its end time on the next sweep', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(Date.parse('2026-10-19T09:00:00Z'));

  const item = await ctx.memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  ctx.clock.advance(Date.parse('2026-10-20T00:41:00Z') - ctx.clock.now());

  const sweep = ctx.start();

  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.clock.advance(3_600_000);

  await waitForCondition(async () => {
    const recalled = await ctx.memory.store.recall({
      itemIDs: [item.itemID],
      includeRetired: true,
    });

    return recalled.items.at(0)?.version === 2;
  });

  await sweep.stop();

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID], includeRetired: true });

  expect(recalled.items).toMatchObject([{ version: 2, change: 'retired', origin: 'lapse' }]);
});

test('it lapses a proposal past its lapse time on the next sweep', async () => {
  const ctx = await setupTest();

  await createProposal(ctx.memory.store, { text: 'Likes jazz' });

  ctx.clock.advance(5000);

  const sweep = ctx.start();

  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.clock.advance(3_600_000);

  await waitForCondition(async () => {
    const pending = await ctx.memory.store.proposals.listPending();

    return pending.length === 0;
  });

  await sweep.stop();

  const pending = await ctx.memory.store.proposals.listPending();

  expect(pending).toStrictEqual([]);
});

test('it passes a failed sweep to onError, and sweeps again', async () => {
  const ctx = await setupTest();

  const onError = mock<(error: unknown) => void>();

  ctx.start({
    store: {
      lapse: () => Promise.resolve(0),
      proposals: { lapse: () => Promise.reject(new Error('the database is locked')) },
    },
    onError,
  });

  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.clock.advance(3_600_000);

  await waitForCondition(() => onError.mock.calls.length === 1 && ctx.clock.countPending() === 1);

  ctx.clock.advance(3_600_000);

  await waitForCondition(() => onError.mock.calls.length === 2);

  expect(onError.mock.calls).toStrictEqual([
    [new Error('the database is locked')],
    [new Error('the database is locked')],
  ]);
});

test('it reports a failed lapse once and sweeps again after onError throws', async () => {
  const ctx = await setupTest();

  const lapseProposals = mock(() => Promise.reject(new Error('the database is locked')));

  const onError = mock<(error: unknown) => void>(() => {
    throw new Error('the log is closed');
  });

  ctx.start({
    store: { lapse: () => Promise.resolve(0), proposals: { lapse: lapseProposals } },
    onError,
  });

  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.clock.advance(3_600_000);

  await waitForCondition(
    () => lapseProposals.mock.calls.length === 1 && ctx.clock.countPending() === 1,
  );

  expect(onError).toHaveBeenCalledTimes(1);

  ctx.clock.advance(3_600_000);

  await expect(waitForCondition(() => lapseProposals.mock.calls.length === 2)).toResolve();
});

test('it ends the pass after one report when the item lapse fails and onError throws', async () => {
  const ctx = await setupTest();

  const lapseProposals = mock(() => Promise.resolve(0));

  const onError = mock<(error: unknown) => void>(() => {
    throw new Error('the log is closed');
  });

  ctx.start({
    store: {
      lapse: () => Promise.reject(new Error('the database is locked')),
      proposals: { lapse: lapseProposals },
    },
    onError,
  });

  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.clock.advance(3_600_000);

  await waitForCondition(() => onError.mock.calls.length === 1 && ctx.clock.countPending() === 1);

  expect(lapseProposals).toHaveBeenCalledTimes(0);
  expect(onError).toHaveBeenCalledTimes(1);
});
