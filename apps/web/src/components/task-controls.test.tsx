import { expect, mock, test } from 'bun:test';
import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { renderToString } from 'react-dom/server';
import { buildBrowserClient } from '../client/build-browser-client';
import { pauseStore } from '../mocks/pause-store';
import { probeMockTaskPaused } from '../mocks/probe-mock-task-paused';
import { server } from '../mocks/server';
import { store } from '../mocks/store';
import { buildMockListedTask } from '../test-utils/build-mock-listed-task';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { NixieClientContext } from '../utils/nixie-client-context';
import { TaskControls } from './task-controls';

function setupTest() {
  return { user: userEvent.setup() };
}

test('it offers only the controls the state of a stopped task allows', () => {
  const rendered = render(
    <TaskControls task={buildMockListedTask({ name: 'Garden plan', state: 'stopped' })} />,
  );

  expect(rendered.getAllByRole('button').map((button) => button.textContent)).toStrictEqual([
    'Restart',
    'Close',
  ]);
});

test.each([
  ['resume', 'paused', ['stop', 'close'], ['Stop', 'Close']],
  ['restart', 'stopped', ['close'], ['Close']],
  ['stop', 'running', ['pause', 'close', 'interrupt'], ['Pause', 'Close', 'Interrupt']],
] as const)('it hides %s from a %s task whose runner lacks it', (_, state, controls, labels) => {
  const rendered = render(
    <TaskControls
      task={buildMockListedTask({ controls: [...controls], name: 'Garden plan', state })}
    />,
  );

  expect(rendered.getAllByRole('button').map((button) => button.textContent)).toStrictEqual([
    ...labels,
  ]);
});

test('it offers no close of the conversation', () => {
  const rendered = render(
    <TaskControls
      task={buildMockListedTask({ name: 'Conversation', state: 'waiting', taskID: 'conversation' })}
    />,
  );

  expect(rendered.getAllByRole('button').map((button) => button.textContent)).toStrictEqual([
    'Pause',
    'Stop',
  ]);
});

test('it restarts a stopped task', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ state: 'stopped', taskID: 'k3vq8m2xpa' });

  const rendered = render(
    <TaskControls
      task={buildMockListedTask({ name: 'Garden plan', state: 'stopped', taskID: 'k3vq8m2xpa' })}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Restart' }));

  await waitFor(() => {
    expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
      'ready',
    );
  });
});

test('it says a control did not finish, and sends it again under the same action ID', async () => {
  const ctx = setupTest();
  const sent = mock<(body: unknown) => void>();

  await createDeviceSession();

  await store.tasks.create({ state: 'waiting', taskID: 'k3vq8m2xpa' });

  server.use(
    http.post('*/rpc/tasks/pause', async (info) => {
      const body: unknown = await info.request.clone().json();

      sent(body);
    }),
    http.post('*/rpc/tasks/pause', () => HttpResponse.error(), { once: true }),
  );

  const rendered = render(
    <TaskControls
      task={buildMockListedTask({ name: 'Garden plan', state: 'waiting', taskID: 'k3vq8m2xpa' })}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Pause' }));

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('The pause did not finish. Try again.');

  await ctx.user.click(rendered.getByRole('button', { name: 'Pause' }));

  await waitFor(() => {
    expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
      'paused',
    );
  });

  const [first, second] = sent.mock.calls.map(([body]) => body);

  expect(second).toStrictEqual(first);
});

test('it holds the stop until the actions it cancels load, and loads them again after a failure', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ state: 'running', taskID: 'k3vq8m2xpa' });
  await store.taskActions.create({ taskID: 'k3vq8m2xpa', tool: 'mail.send' });

  server.use(http.post('*/rpc/tasks/readActions', () => HttpResponse.error(), { once: true }));

  const rendered = render(
    <TaskControls
      task={buildMockListedTask({ name: 'Garden plan', state: 'running', taskID: 'k3vq8m2xpa' })}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Stop' }));

  const reload = await rendered.findByRole('button', { name: 'Load them again' });

  const heldStop = rendered.getByRole('button', { name: 'Stop the task' });

  expect(heldStop).toBeDisabled();

  await ctx.user.click(reload);

  const preview = await rendered.findByText(
    'The stop cancels 1 action not yet started: mail.send.',
  );

  expect(preview).toBeVisible();
  expect(rendered.getByRole('button', { name: 'Stop the task' })).toBeEnabled();
});

test('it keeps a task running when you turn the stop down', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ state: 'running', taskID: 'k3vq8m2xpa' });

  const rendered = render(
    <TaskControls
      task={buildMockListedTask({ name: 'Garden plan', state: 'running', taskID: 'k3vq8m2xpa' })}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Stop' }));

  const keep = await rendered.findByRole('button', { name: 'Keep it running' });

  await ctx.user.click(keep);

  expect(rendered.queryByRole('group', { name: 'Stop the task' })).toBeNull();

  expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
    'running',
  );
});

test('it runs a task that nixie pauses with its own resume, and leaves the other task paused', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.tasks.create({ state: 'waiting', taskID: 'k3vq8m2xpa' });
  await store.tasks.create({ state: 'waiting', taskID: 'p7hd2wq9zn' });
  await pauseStore.pauses.create({ cause: 'restore' });

  const rendered = render(
    <TaskControls
      task={buildMockListedTask({
        isPausedByNixie: true,
        name: 'Garden plan',
        state: 'waiting',
        taskID: 'k3vq8m2xpa',
      })}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Resume' }));

  await waitFor(() => {
    expect(probeMockTaskPaused('k3vq8m2xpa')).toBeFalse();
  });

  expect(probeMockTaskPaused('p7hd2wq9zn')).toBeTrue();
});

test('it renders each control disabled on the server, before React can take the click', () => {
  const client = buildBrowserClient();

  const markup = renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <NixieClientContext value={{ client, queryUtils: buildQueryUtils(client) }}>
        <TaskControls task={buildMockListedTask({ name: 'Garden plan', state: 'stopped' })} />
      </NixieClientContext>
    </QueryClientProvider>,
  );

  expect(markup.match(/<button[^>]*disabled=""/gu)).toHaveLength(2);
});
