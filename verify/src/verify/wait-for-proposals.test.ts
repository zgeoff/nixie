import { expect, test } from 'bun:test';
import { waitForProposals } from './wait-for-proposals';

function setupTest() {
  const sleptMs: number[] = [];
  const state = { nowMs: 0, reads: 0, sleptMs };

  const clock = {
    nowMs: () => state.nowMs,
    sleep: (durationMs: number) => {
      state.sleptMs.push(durationMs);

      state.nowMs += durationMs;

      return Promise.resolve();
    },
  };

  return { state, clock };
}

test('#waitForProposals returns the list once the call is held', async () => {
  const ctx = setupTest();
  const lists = [[], [{ proposalID: 'p1', tool: 'computer.run' }]];

  const listed = await waitForProposals(
    () => {
      ctx.state.reads += 1;

      return Promise.resolve({ proposals: lists.shift() ?? [] });
    },
    { tool: 'computer.run', waiting: 'pending', waitMs: 5000 },
    ctx.clock,
  );

  expect([listed.proposals.length, ctx.state.reads]).toStrictEqual([1, 2]);
});

test('#waitForProposals reads once when it is given no wait, even when the clock moves back', async () => {
  const ctx = setupTest();

  const clock = {
    ...ctx.clock,
    nowMs: () => {
      ctx.state.nowMs -= 1000;

      return ctx.state.nowMs;
    },
  };

  const result = waitForProposals(
    () => {
      ctx.state.reads += 1;

      return Promise.resolve({ proposals: [] });
    },
    { tool: 'computer.run', waiting: 'pending' },
    clock,
  );

  expect(result).rejects.toMatchObject({ code: 'check-failed' });

  await Promise.allSettled([result]);

  expect([ctx.state.reads, ctx.state.sleptMs]).toStrictEqual([1, []]);
});

test('#waitForProposals fails without a re-read once a short wait is spent', async () => {
  const ctx = setupTest();
  const lists = [[], [{ proposalID: 'p1', tool: 'computer.run' }]];

  const result = waitForProposals(
    () => {
      ctx.state.reads += 1;

      return Promise.resolve({ proposals: lists.shift() ?? [] });
    },
    { tool: 'computer.run', waiting: 'pending', waitMs: 1 },
    ctx.clock,
  );

  expect(result).rejects.toMatchObject({ code: 'check-failed' });

  await Promise.allSettled([result]);

  expect([ctx.state.reads, ctx.state.sleptMs]).toStrictEqual([1, [1]]);
});
