import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pauseStore } from '../mocks/pause-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { PauseNixieButton } from './pause-nixie-button';

function setupTest() {
  return { user: userEvent.setup() };
}

test('it pauses nixie from the button, and takes the button away', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<PauseNixieButton />);

  const pauseButton = await rendered.findByRole('button', { name: 'Pause nixie' });

  await ctx.user.click(pauseButton);

  await waitFor(() => {
    expect(pauseStore.pauses.all().map((pause) => pause.cause)).toStrictEqual(['owner']);
  });

  await waitFor(() => {
    expect(rendered.queryByRole('button', { name: 'Pause nixie' })).toBeNull();
  });
});

test('it offers no pause while nixie is paused', async () => {
  await createDeviceSession();

  await pauseStore.pauses.create({ cause: 'restore' });

  const rendered = render(<PauseNixieButton />);

  await waitFor(() => {
    expect(rendered.queryByRole('button')).toBeNull();
  });

  expect(pauseStore.pauses.all()).toHaveLength(1);
});
