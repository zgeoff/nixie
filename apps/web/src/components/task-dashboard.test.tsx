import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { TaskDashboard } from './task-dashboard';

function setupTest() {
  return { user: userEvent.setup(), timer: buildStubTimer() };
}

test('it lists the conversation, then the working and the held tasks, with who waits on whom', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Conversation', state: 'waiting', taskID: 'conversation' });

  await store.tasks.create({
    brief: 'Plans the vegetable beds.',
    name: 'Garden plan',
    state: 'running',
    taskID: 'k3vq8m2xpa',
    waitingOn: 'p7hd2wq9zn',
  });

  await store.tasks.create({ name: 'Seed order', state: 'paused', taskID: 'p7hd2wq9zn' });
  await store.tasks.create({ name: 'Tiler booking', state: 'done', taskID: 'r5bn1cy6tf' });

  const rendered = render(<TaskDashboard startTimer={ctx.timer.startTimer} />);

  const working = await rendered.findByRole('region', { name: 'Working' });

  const held = rendered.getByRole('region', { name: 'Held' });

  expect(rendered.getByRole('region', { name: 'Conversation' })).toHaveTextContent('Conversation');

  expect(within(working).getByRole('listitem', { name: 'Garden plan' })).toHaveTextContent(
    'Plans the vegetable beds.Waiting on Seed order',
  );

  expect(within(held).getByRole('listitem', { name: 'Seed order' })).toHaveTextContent(
    'Garden plan is waiting on this task',
  );

  expect(rendered.queryByText('Tiler booking')).toBeNull();
});

test('it pauses a task from the dashboard', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'waiting', taskID: 'k3vq8m2xpa' });

  const rendered = render(<TaskDashboard startTimer={ctx.timer.startTimer} />);

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Pause' }));

  await waitFor(() => {
    expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
      'paused',
    );
  });

  const held = rendered.getByRole('region', { name: 'Held' });

  const resume = await within(held).findByRole('button', { name: 'Resume' });

  expect(resume).toBeEnabled();
});

test('it shows a pause of a running task as requested until the step ends', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'running', taskID: 'k3vq8m2xpa' });

  const rendered = render(<TaskDashboard startTimer={ctx.timer.startTimer} />);

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Pause' }));

  const requested = await within(row).findByRole('status');

  expect(requested).toHaveTextContent('Pause requested');
});

test('it lists what a stop cancels, and stops the task once you confirm', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'running', taskID: 'k3vq8m2xpa' });
  await store.taskActions.create({ taskID: 'k3vq8m2xpa', tool: 'mail.send' });
  await store.taskActions.create({ attempts: 1, taskID: 'k3vq8m2xpa', tool: 'web.fetch' });

  const rendered = render(<TaskDashboard startTimer={ctx.timer.startTimer} />);

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Stop' }));

  const confirmation = within(row).getByRole('group', { name: 'Stop the task' });

  const cancels = await within(confirmation).findByText(
    'The stop cancels 1 action not yet started: mail.send.',
  );

  expect(cancels).toBeVisible();

  expect(
    within(confirmation).getByText('Already started, so it runs to its outcome: web.fetch.'),
  ).toBeVisible();

  await ctx.user.click(within(confirmation).getByRole('button', { name: 'Stop the task' }));

  await waitFor(() => {
    expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
      'stopped',
    );
  });

  expect(
    store.taskActions
      .all()
      .map((action) => ({ isCancelled: action.isCancelled, tool: action.tool })),
  ).toIncludeSameMembers([
    { isCancelled: true, tool: 'mail.send' },
    { isCancelled: false, tool: 'web.fetch' },
  ]);
});

test('it closes a task only once you confirm', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'waiting', taskID: 'k3vq8m2xpa' });

  const rendered = render(<TaskDashboard startTimer={ctx.timer.startTimer} />);

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Close' }));

  const asked = store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state;

  await ctx.user.click(within(row).getByRole('button', { name: 'Close the task' }));

  await waitFor(() => {
    expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
      'closed',
    );
  });

  expect(asked).toBe('waiting');
});

test('it interrupts the turn of a running task', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'running', taskID: 'k3vq8m2xpa' });

  const rendered = render(<TaskDashboard startTimer={ctx.timer.startTimer} />);

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  await ctx.user.click(within(row).getByRole('button', { name: 'Interrupt' }));

  await waitFor(() => {
    expect(store.taskControlActions.all().map((action) => action.control)).toStrictEqual([
      'interrupt',
    ]);
  });
});

test('it offers only the controls the runner of a task offers', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({
    controls: ['stop'],
    name: 'Garden plan',
    state: 'running',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(<TaskDashboard startTimer={ctx.timer.startTimer} />);

  const row = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  expect(
    within(row)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toStrictEqual(['Stop']);
});

test('it reads the list again when a task record arrives on the live stream', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const garden = await store.tasks.create({
    name: 'Garden plan',
    state: 'running',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(<TaskDashboard startTimer={ctx.timer.startTimer} />);

  await rendered.findByRole('listitem', { name: 'Garden plan' });

  await store.tasks.update(garden, {
    data(draft) {
      draft.state = 'paused';
    },
  });

  await store.records.create({ kind: 'task.paused', thread: 'k3vq8m2xpa' });

  const held = rendered.getByRole('region', { name: 'Held' });

  const paused = await within(held).findByRole('listitem', { name: 'Garden plan' });

  expect(paused).toHaveTextContent('Paused');
});

test('it reads the list again when a message of yours arrives on the live stream', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const garden = await store.tasks.create({
    name: 'Garden plan',
    state: 'waiting',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(<TaskDashboard startTimer={ctx.timer.startTimer} />);

  const row = await rendered.findByRole('listitem', { name: 'Garden plan' });

  await store.tasks.update(garden, {
    data(draft) {
      draft.state = 'ready';
    },
  });

  await store.records.create({ kind: 'owner_message', thread: 'k3vq8m2xpa' });

  await waitFor(() => {
    expect(row).toHaveTextContent('Ready');
  });
});
