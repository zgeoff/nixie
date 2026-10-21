import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { startLapseSweep } from './start-lapse-sweep';
import { createProposal } from './test-utils/create-proposal';
import { startTestMemory } from './test-utils/start-test-memory';

test('it lapses a proposal past its lapse time on the next sweep', async () => {
  const clock = buildTestClock(1_000_000);

  const memory = await startTestMemory({
    gate: {
      clock,
      limits: { evidenceWindow: 20, proposalLapseMs: 5000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  await createProposal(memory.store, { text: 'Likes jazz' });

  clock.advance(5000);

  const sweep = startLapseSweep({ store: memory.store, intervalMs: 10, onError: () => {} });

  onTestFinished(() => sweep.stop());

  await waitForCondition(async () => {
    const pending = await memory.store.proposals.listPending();

    return pending.length === 0;
  });

  await sweep.stop();

  const pending = await memory.store.proposals.listPending();

  expect(pending).toStrictEqual([]);
});

test('it passes a failed sweep to onError, and sweeps again', async () => {
  const onError = mock<(error: unknown) => void>();

  const sweep = startLapseSweep({
    store: {
      proposals: { lapse: () => Promise.reject(new Error('the database is locked')) },
      consolidations: { lapse: () => Promise.resolve(0) },
    },
    intervalMs: 10,
    onError,
  });

  onTestFinished(() => sweep.stop());

  await waitForCondition(() => onError.mock.calls.length >= 2);

  expect(onError.mock.calls.slice(0, 2)).toStrictEqual([
    [new Error('the database is locked')],
    [new Error('the database is locked')],
  ]);
});

test('it lapses the consolidation changes when the proposal lapse fails', async () => {
  const lapseConsolidations = mock(() => Promise.resolve(0));

  const sweep = startLapseSweep({
    store: {
      proposals: { lapse: () => Promise.reject(new Error('the database is locked')) },
      consolidations: { lapse: lapseConsolidations },
    },
    intervalMs: 10,
    onError: () => {},
  });

  onTestFinished(() => sweep.stop());

  await waitForCondition(() => lapseConsolidations.mock.calls.length > 0);

  expect(lapseConsolidations).toHaveBeenCalled();
});

test('it sweeps again after onError throws', async () => {
  const lapseProposals = mock(() => Promise.reject(new Error('the database is locked')));

  const sweep = startLapseSweep({
    store: {
      proposals: { lapse: lapseProposals },
      consolidations: { lapse: () => Promise.resolve(0) },
    },
    intervalMs: 10,
    onError: () => {
      throw new Error('the log is closed');
    },
  });

  onTestFinished(() => sweep.stop());

  await waitForCondition(() => lapseProposals.mock.calls.length >= 2);

  expect(lapseProposals.mock.calls.length).toBeGreaterThanOrEqual(2);
});
