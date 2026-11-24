import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockViewStore } from '../mocks/mock-view-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { ForgetStuckNotice } from './forget-stuck-notice';

function setupTest() {
  return { user: userEvent.setup() };
}

test('it shows each stuck forget with its kind, short ID and minutes open', async () => {
  await createDeviceSession();

  await mockViewStore.stuckForgets.create({ kind: 'note', shortID: 'n7', openForMs: 400_000 });
  await mockViewStore.stuckForgets.create({ kind: 'moment', shortID: null, openForMs: 61_000 });

  const rendered = render(<ForgetStuckNotice />);

  const list = await rendered.findByRole('list', { name: 'Stuck forgets' });

  expect(
    within(list)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toStrictEqual(['A note (n7), open for 6 min', 'A moment, open for 1 min']);
});

test('it clears the notice once a retry finishes the forget', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await mockViewStore.stuckForgets.create({ kind: 'note', shortID: 'n7' });

  const rendered = render(<ForgetStuckNotice />);

  const retry = await rendered.findByRole('button', { name: 'Retry the forget now' });

  await ctx.user.click(retry);

  await waitFor(() => {
    expect(rendered.queryByRole('region', { name: 'A forget is stuck' })).toBeNull();
  });
});

test('it keeps the notice when the retry leaves the forget stuck', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await mockViewStore.stuckForgets.create({ kind: 'note', shortID: 'n7', staysStuck: true });

  const rendered = render(<ForgetStuckNotice />);

  const retry = await rendered.findByRole('button', { name: 'Retry the forget now' });

  await ctx.user.click(retry);

  await waitFor(() => {
    expect(rendered.getByRole('button', { name: 'Retry the forget now' })).toBeEnabled();
  });

  expect(rendered.getByRole('list', { name: 'Stuck forgets' })).toBeInTheDocument();
});
