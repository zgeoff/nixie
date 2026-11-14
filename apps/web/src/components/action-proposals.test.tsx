import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { ActionProposals } from './action-proposals';

function setupTest() {
  return { user: userEvent.setup() };
}

test('it lists a pending action with its sentence and says nixie does not run it yet', async () => {
  await createDeviceSession();

  await store.actionProposals.create({
    proposalID: 'a7rk2m9x4q',
    sentence: 'Send to sam@example.org (send).',
    lapseAt: new Date(2099, 2, 1),
  });

  const rendered = render(<ActionProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Action a7rk2m9x4q' });

  expect(card).toHaveTextContent('Send to sam@example.org (send).');
  expect(card).toHaveTextContent('nixie runs approved actions in a later release');
});

test('it says when no action waits', async () => {
  await createDeviceSession();

  const rendered = render(<ActionProposals />);

  const empty = await rendered.findByText('No action waits for you.');

  expect(empty).toBeInTheDocument();
});

test('it removes an action from the list once you approve it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.actionProposals.create({ proposalID: 'a7rk2m9x4q' });

  const rendered = render(<ActionProposals />);

  await rendered.findByRole('listitem', { name: 'Action a7rk2m9x4q' });
  await ctx.user.click(rendered.getByRole('button', { name: 'Approve action' }));

  await waitFor(() => {
    expect(rendered.queryByRole('listitem', { name: 'Action a7rk2m9x4q' })).toBeNull();
  });

  const answered = store.actionProposals.findFirst((query) =>
    query.where({ proposalID: 'a7rk2m9x4q' }),
  );

  expect(answered?.status).toBe('approved');
});

test('it declines an action with your reason', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.actionProposals.create({ proposalID: 'a7rk2m9x4q' });

  const rendered = render(<ActionProposals />);

  await rendered.findByRole('listitem', { name: 'Action a7rk2m9x4q' });
  await ctx.user.type(rendered.getByLabelText('Reason to decline'), 'Not this week.');
  await ctx.user.click(rendered.getByRole('button', { name: 'Decline action' }));

  await waitFor(() => {
    expect(rendered.queryByRole('listitem', { name: 'Action a7rk2m9x4q' })).toBeNull();
  });

  const answered = store.actionProposals.findFirst((query) =>
    query.where({ proposalID: 'a7rk2m9x4q' }),
  );

  expect([answered?.status, answered?.reason]).toStrictEqual(['rejected', 'Not this week.']);
});
