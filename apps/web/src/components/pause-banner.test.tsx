import { expect, test } from 'bun:test';
import { act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pauseStore } from '../mocks/pause-store';
import { store } from '../mocks/store';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { PauseBanner } from './pause-banner';
import { TaskDashboard } from './task-dashboard';

function setupTest() {
  return { user: userEvent.setup(), timer: buildStubTimer() };
}

test('it shows nothing while nixie runs', async () => {
  await createDeviceSession();

  const rendered = render(<PauseBanner />);

  await waitFor(() => {
    expect(rendered.container).toBeEmptyDOMElement();
  });
});

test('it says that you paused nixie, and since when', async () => {
  await createDeviceSession();

  await pauseStore.pauses.create({ cause: 'owner', since: new Date('2026-11-02T08:00:00Z') });

  const rendered = render(<PauseBanner />);

  const banner = await rendered.findByRole('region', { name: 'nixie is paused' });

  expect(within(banner).getByRole('status')).toHaveTextContent(
    /^nixie is paused by you since .+\. No task takes a new step until you resume it\.$/u,
  );

  expect(within(banner).queryByRole('list')).toBeNull();
});

test('it says that the spending limit paused nixie', async () => {
  await createDeviceSession();

  await pauseStore.pauses.create({ cause: 'spending' });

  const rendered = render(<PauseBanner />);

  const banner = await rendered.findByRole('region', { name: 'nixie is paused' });

  expect(within(banner).getByRole('status')).toHaveTextContent(
    /^nixie is paused by the spending limit since /u,
  );
});

test('it lists each task that a restore left to check, beside the resume', async () => {
  await createDeviceSession();

  await pauseStore.pauses.create({ cause: 'restore' });

  await pauseStore.recoveries.create({
    toCheck: [
      {
        taskID: 'k3vq8m2xpa',
        name: 'Garden plan',
        stateAtBackup: 'running',
        wasRunning: true,
        pendingActions: 2,
      },
      {
        taskID: 'p7hd2wq9zn',
        name: 'Seed order',
        stateAtBackup: 'waiting',
        wasRunning: false,
        pendingActions: 0,
      },
    ],
  });

  const rendered = render(<PauseBanner />);

  const list = await rendered.findByRole('list', { name: 'Tasks to check' });

  const items = within(list).getAllByRole('listitem');

  expect(items.map((item) => item.textContent)).toStrictEqual([
    'Garden plan was running at the backup, and a step was running, with 2 actions waiting for an outcome',
    'Seed order was waiting at the backup',
  ]);

  expect(within(items[0] ?? list).getByRole('link', { name: 'Garden plan' })).toHaveAttribute(
    'href',
    '/tasks/k3vq8m2xpa',
  );

  expect(rendered.getByRole('button', { name: 'Resume nixie' })).toBeVisible();
});

test('it resumes nixie from the banner, and the banner goes', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await pauseStore.pauses.create({ cause: 'owner' });

  const rendered = render(<PauseBanner />);

  const resume = await rendered.findByRole('button', { name: 'Resume nixie' });

  await ctx.user.click(resume);

  await waitFor(() => {
    expect(rendered.queryByRole('region', { name: 'nixie is paused' })).toBeNull();
  });

  expect(pauseStore.pauses.all()).toStrictEqual([]);
});

test('it shows each task as paused when the pause begins after the list loaded', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'waiting', taskID: 'k3vq8m2xpa' });

  const rendered = render(
    <>
      <PauseBanner />
      <TaskDashboard startTimer={ctx.timer.startTimer} />
    </>,
  );

  await rendered.findByRole('listitem', { name: 'Garden plan' });
  await pauseStore.pauses.create({ cause: 'owner' });

  act(() => {
    globalThis.dispatchEvent(new Event('visibilitychange'));
  });

  const row = await rendered.findByRole('listitem', { name: 'Garden plan' });

  await waitFor(() => {
    expect(row).toHaveTextContent('Paused by nixie');
  });
});
