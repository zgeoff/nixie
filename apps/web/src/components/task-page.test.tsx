import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/node';
import { store } from '../mocks/store';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { TaskPage } from './task-page';

function setupTest() {
  return { user: userEvent.setup(), timer: buildStubTimer() };
}

test('it heads the thread of a task with its name, state and controls', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({
    brief: 'Plans the vegetable beds.',
    name: 'Garden plan',
    state: 'running',
    taskID: 'k3vq8m2xpa',
  });

  const rendered = render(
    <TaskPage navigation={null} startTimer={ctx.timer.startTimer} taskID="k3vq8m2xpa" />,
  );

  const controls = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  expect(rendered.getByRole('banner')).toHaveTextContent('Garden planRunning');
  expect(controls).toHaveTextContent('PauseStopCloseInterrupt');
});

test('it heads the thread of a task that the task list leaves out', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'closed', taskID: 'k3vq8m2xpa' });

  server.use(
    http.post('*/rpc/tasks/list', () =>
      HttpResponse.json({ json: { readAtSequence: 0, tasks: [] } }),
    ),
  );

  const rendered = render(
    <TaskPage navigation={null} startTimer={ctx.timer.startTimer} taskID="k3vq8m2xpa" />,
  );

  const banner = await rendered.findByRole('banner');

  await waitFor(() => {
    expect(banner).toHaveTextContent('Garden planClosed');
  });

  expect(rendered.queryByRole('textbox')).toBeNull();
});

test('it says the task did not load, offers no composer, and loads it again on request', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'waiting', taskID: 'k3vq8m2xpa' });

  server.use(http.post('*/rpc/tasks/read', () => HttpResponse.error(), { once: true }));

  const rendered = render(
    <TaskPage navigation={null} startTimer={ctx.timer.startTimer} taskID="k3vq8m2xpa" />,
  );

  const alert = await rendered.findByRole('alert');

  const composer = rendered.queryByRole('textbox');

  await ctx.user.click(rendered.getByRole('button', { name: 'Load it again' }));

  const controls = await rendered.findByRole('group', { name: 'Controls for Garden plan' });

  expect(alert).toHaveTextContent('The task did not load.');
  expect(composer).toBeNull();
  expect(controls).toBeVisible();
});

test('it reads earlier records until the thread shows the linked message', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Seed order', state: 'waiting', taskID: 'p7hd2wq9zn' });

  await store.records.create({
    kind: 'task_message',
    taskMessage: {
      from: 'k3vq8m2xpa',
      fromName: 'Garden plan',
      kind: 'question',
      messageID: 'm7q2x9k4pa',
      text: 'Which seeds came?',
      to: 'p7hd2wq9zn',
    },
    thread: 'p7hd2wq9zn',
  });

  await Promise.all(
    Array.from({ length: 120 }, () =>
      store.records.create({ kind: 'task.step_started', thread: 'p7hd2wq9zn' }),
    ),
  );

  const rendered = render(
    <TaskPage
      messageID="m7q2x9k4pa"
      navigation={null}
      startTimer={ctx.timer.startTimer}
      taskID="p7hd2wq9zn"
    />,
  );

  const message = await rendered.findByRole(
    'listitem',
    { name: 'Message from Garden plan' },
    { timeout: 4000 },
  );

  expect(message).toHaveTextContent('Which seeds came?');
});

test('it sends a message written on the task page to that task', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'waiting', taskID: 'k3vq8m2xpa' });

  const rendered = render(
    <TaskPage navigation={null} startTimer={ctx.timer.startTimer} taskID="k3vq8m2xpa" />,
  );

  const composer = await rendered.findByRole('textbox');

  await ctx.user.type(composer, 'Put the beans in the north bed.');
  await ctx.user.click(rendered.getByRole('button', { name: 'Send' }));

  await waitFor(() => {
    expect(
      store.records.findFirst((query) => query.where({ kind: 'owner_message' })),
    ).toMatchObject({ message: { text: 'Put the beans in the north bed.' }, thread: 'k3vq8m2xpa' });
  });
});

test('it leaves a closed task readable with no composer', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ name: 'Garden plan', state: 'closed', taskID: 'k3vq8m2xpa' });

  const rendered = render(
    <TaskPage navigation={null} startTimer={ctx.timer.startTimer} taskID="k3vq8m2xpa" />,
  );

  const closed = await rendered.findByText('This task is closed, so it takes no more messages.');

  expect(closed).toBeVisible();
  expect(rendered.queryByRole('textbox')).toBeNull();
});
