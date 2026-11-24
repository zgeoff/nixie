import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { buildQueryUtils } from '@heynixie/contract';
import { waitFor } from '@testing-library/react';
import { buildBrowserClient } from '../client/build-browser-client';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderRoute } from '../test-utils/render-route';

test('it scrolls a task page to the message that its link names, behind 120 later records', async () => {
  const scrolls = spyOn(HTMLElement.prototype, 'scrollIntoView');

  onTestFinished(() => {
    scrolls.mockRestore();
  });

  await createDeviceSession();

  await store.tasks.create({ name: 'Seed order', state: 'waiting', taskID: 'p7hd2wq9zn' });

  await store.records.create({
    kind: 'task_message',
    taskMessage: {
      from: 'k3vq8m2xpa',
      fromName: 'Garden plan',
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

  const rendered = renderRoute('/tasks/p7hd2wq9zn#task-message-m7q2x9k4pa');

  const message = await rendered.findByRole(
    'listitem',
    { name: 'Message from Garden plan' },
    { timeout: 4000 },
  );

  await waitFor(() => {
    expect(scrolls.mock.contexts).toContain(message);
  });
});

test('it renders a task page around a record of a kind the page does not know, without throwing', async () => {
  await createDeviceSession();

  await store.tasks.create({ name: 'Seed order', state: 'waiting', taskID: 'p7hd2wq9zn' });

  await store.records.create({
    kind: 'owner_message',
    message: { text: 'Check the seed order.' },
    thread: 'p7hd2wq9zn',
  });

  await store.records.create({ kind: 'harbour.unknown_kind', thread: 'p7hd2wq9zn' });

  const rendered = renderRoute('/tasks/p7hd2wq9zn');

  const message = await rendered.findByText('Check the seed order.', {}, { timeout: 4000 });

  expect(message).toBeTruthy();
});

test('it reads the task once for the route and the page, and once more when the live stream opens', async () => {
  const queryUtils = buildQueryUtils(buildBrowserClient());

  await createDeviceSession();

  await store.tasks.create({ name: 'Seed order', state: 'waiting', taskID: 'p7hd2wq9zn' });

  const rendered = renderRoute('/tasks/p7hd2wq9zn');

  await rendered.findByText('Seed order', {}, { timeout: 4000 });

  const key = queryUtils.tasks.read.queryKey({ input: { taskID: 'p7hd2wq9zn' } });

  await waitFor(() => {
    expect(rendered.queryClient.getQueryState(key)?.dataUpdateCount).toBe(2);
  });

  expect(rendered.queryClient.getQueryState(key)?.fetchStatus).toBe('idle');
});
