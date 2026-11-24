import { expect, test } from 'bun:test';
import { waitForProposals } from './wait-for-proposals';

test('#waitForProposals returns the list once the call is held', async () => {
  const lists = [[], [{ proposalID: 'p1', tool: 'computer.run' }]];

  const listed = await waitForProposals(() => Promise.resolve({ proposals: lists.shift() ?? [] }), {
    tool: 'computer.run',
    waiting: 'pending',
    waitMs: 5000,
  });

  expect(listed.proposals).toHaveLength(1);
});

test('#waitForProposals checks once when it is given no wait', () => {
  const result = waitForProposals(() => Promise.resolve({ proposals: [] }), {
    tool: 'computer.run',
    waiting: 'pending',
  });

  expect(result).rejects.toMatchObject({ code: 'check-failed' });
});

test('#waitForProposals fails with check-failed when the call is never held', () => {
  const result = waitForProposals(() => Promise.resolve({ proposals: [] }), {
    tool: 'computer.run',
    waiting: 'pending',
    waitMs: 1,
  });

  expect(result).rejects.toMatchObject({ code: 'check-failed' });
});
