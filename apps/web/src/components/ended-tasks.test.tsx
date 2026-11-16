import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockViewStore } from '../mocks/mock-view-store';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { EndedTasks } from './ended-tasks';

test('it lists the ended runs newest first, each linking to its task', async () => {
  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });
  await mockViewStore.endedRuns.create({ taskID: 'k3vq8m2xpa', cause: 'finished' });
  await mockViewStore.endedRuns.create({ taskID: 'k3vq8m2xpa', cause: 'stopped' });

  const rendered = render(<EndedTasks />);

  await waitFor(() => {
    expect(rendered.getAllByRole('link', { name: 'Garden plan' })).toHaveLength(2);
  });

  expect(rendered.getAllByRole('link', { name: 'Garden plan' })[0]).toHaveAttribute(
    'href',
    '/tasks/k3vq8m2xpa',
  );

  expect(rendered.getByRole('region', { name: 'Ended runs' }).textContent).toMatch(
    /stopped.*finished/u,
  );
});

test('it shows a skipped fire of the trigger report with its reason', async () => {
  await createDeviceSession();

  await mockViewStore.reportEntries.create({
    definitionID: 'water-the-tomatoes',
    kind: 'skipped',
    name: 'Water the tomatoes',
    reason: 'task_held',
    scheduledFor: '2099-01-01T08:00:00.000Z',
  });

  const rendered = render(<EndedTasks />);

  await waitFor(() => {
    expect(rendered.getByRole('region', { name: 'Trigger report' })).toHaveTextContent(
      'Water the tomatoes: skipped, because its task was held',
    );
  });
});

test('it loads the next page of ended runs on request', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });

  await Promise.all(
    Array.from({ length: 51 }, () =>
      mockViewStore.endedRuns.create({ taskID: 'k3vq8m2xpa', cause: 'finished' }),
    ),
  );

  const rendered = render(<EndedTasks />);

  const more = await rendered.findByRole('button', { name: 'Show older runs' });

  await user.click(more);

  await waitFor(() => {
    expect(rendered.getAllByRole('link', { name: 'Garden plan' })).toHaveLength(51);
  });

  expect(rendered.queryByRole('button', { name: 'Show older runs' })).toBeNull();
});

test('it says that no task run has ended on an empty list', async () => {
  await createDeviceSession();

  const rendered = render(<EndedTasks />);

  const empty = await rendered.findByText('No task run has ended.');

  expect(empty).toBeVisible();
});

test('it names the fire that started an ended run, and marks a catch-up', async () => {
  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });

  await mockViewStore.endedRuns.create({
    fire: {
      scheduledFor: '2026-11-13T08:00:00.000Z',
      firedAt: '2026-11-13T08:45:00.000Z',
      isCatchUp: true,
    },
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(<EndedTasks />);

  const run = await rendered.findByRole('link', { name: 'Garden plan' });

  expect(run.parentElement).toHaveTextContent(
    'started by the fire of 2026-11-13T08:00:00.000Z (a catch-up)',
  );
});
