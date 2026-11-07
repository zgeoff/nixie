import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { RuleProposals } from './rule-proposals';

function setupTest() {
  return { user: userEvent.setup() };
}

test('it lists a pending rule change with the sentence before and after each rule', async () => {
  await createDeviceSession();

  await store.ruleProposals.create({
    proposalID: 'p7rk2m9x4q',
    changes: [
      {
        ruleID: 'ask-mail',
        before: { ruleHash: 'sha256:aa11', sentence: 'Deny sending mail.' },
        after: { ruleHash: 'sha256:bb22', sentence: 'Ask before sending mail.' },
      },
    ],
    lapseAt: new Date(2099, 2, 1),
  });

  const rendered = render(<RuleProposals />);

  const card = await rendered.findByRole('listitem', { name: 'Rule change p7rk2m9x4q' });

  expect(card).toHaveTextContent('Now: Deny sending mail.After: Ask before sending mail.');
});

test('it says when no rule change waits', async () => {
  await createDeviceSession();

  const rendered = render(<RuleProposals />);

  const empty = await rendered.findByText('No rule change waits for you.');

  expect(empty).toBeInTheDocument();
});

test('it removes a rule change from the list once you approve it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.ruleProposals.create({
    proposalID: 'p7rk2m9x4q',
    changes: [
      {
        ruleID: 'allow-web',
        before: null,
        after: { ruleHash: 'sha256:cc33', sentence: 'Allow fetching web pages.' },
      },
    ],
  });

  const rendered = render(<RuleProposals />);

  await rendered.findByRole('listitem', { name: 'Rule change p7rk2m9x4q' });
  await ctx.user.click(rendered.getByRole('button', { name: 'Approve' }));

  await waitFor(() => {
    expect(rendered.queryByRole('listitem', { name: 'Rule change p7rk2m9x4q' })).toBeNull();
  });

  const answered = store.ruleProposals.findFirst((query) =>
    query.where({ proposalID: 'p7rk2m9x4q' }),
  );

  expect(answered?.status).toBe('approved');
});

test('it rejects a rule change with your reason', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.ruleProposals.create({
    proposalID: 'p7rk2m9x4q',
    changes: [
      {
        ruleID: 'allow-web',
        before: null,
        after: { ruleHash: 'sha256:cc33', sentence: 'Allow fetching web pages.' },
      },
    ],
  });

  const rendered = render(<RuleProposals />);

  await rendered.findByRole('listitem', { name: 'Rule change p7rk2m9x4q' });
  await ctx.user.type(rendered.getByLabelText('Reason to reject'), 'Not this month.');
  await ctx.user.click(rendered.getByRole('button', { name: 'Reject' }));

  await waitFor(() => {
    expect(rendered.queryByRole('listitem', { name: 'Rule change p7rk2m9x4q' })).toBeNull();
  });

  const answered = store.ruleProposals.findFirst((query) =>
    query.where({ proposalID: 'p7rk2m9x4q' }),
  );

  expect(answered?.reason).toBe('Not this month.');
});

test('it keeps Reject off until you give a reason', async () => {
  await createDeviceSession();

  await store.ruleProposals.create({
    proposalID: 'p7rk2m9x4q',
    changes: [
      {
        ruleID: 'allow-web',
        before: null,
        after: { ruleHash: 'sha256:cc33', sentence: 'Allow fetching web pages.' },
      },
    ],
  });

  const rendered = render(<RuleProposals />);

  await rendered.findByRole('listitem', { name: 'Rule change p7rk2m9x4q' });

  expect(rendered.getByRole('button', { name: 'Reject' })).toBeDisabled();
});

test('it says a rule change closed when another device answered it first', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.ruleProposals.create({
    proposalID: 'p7rk2m9x4q',
    changes: [
      {
        ruleID: 'allow-web',
        before: null,
        after: { ruleHash: 'sha256:cc33', sentence: 'Allow fetching web pages.' },
      },
    ],
  });

  const rendered = render(<RuleProposals />);

  await rendered.findByRole('listitem', { name: 'Rule change p7rk2m9x4q' });

  await store.ruleProposals.update((query) => query.where({ proposalID: 'p7rk2m9x4q' }), {
    data(draft) {
      draft.status = 'rejected';
    },
  });

  await ctx.user.click(rendered.getByRole('button', { name: 'Approve' }));

  const notice = await rendered.findByRole('alert');

  expect(notice).toHaveTextContent(
    'That rule change is answered, withdrawn or lapsed, so nothing changed.',
  );
});
