import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { toLogRecord } from '../mocks/to-log-record';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { RoutingMark } from './routing-mark';

function setupTest() {
  return { user: userEvent.setup() };
}

test('it marks a moved message with its task and the move', () => {
  const rendered = render(
    <RoutingMark
      record={buildMockLogRecord({ kind: 'owner_message', message: { text: 'Order seed.' } })}
      route={{ isMove: true, taskID: 'p7hd2wq9zn' }}
      tasks={[
        {
          brief: 'Buys what the garden needs.',
          lastActivityAt: new Date('2026-10-14T09:00:00.000Z'),
          name: 'Seed order',
          state: 'waiting',
          taskID: 'p7hd2wq9zn',
        },
      ]}
    />,
  );

  expect(rendered.getByRole('link', { name: '→ Seed order (moved)' })).toHaveAttribute(
    'href',
    '/tasks/p7hd2wq9zn',
  );
});

test('it links a message routed to the conversation to the conversation page', () => {
  const rendered = render(
    <RoutingMark
      record={buildMockLogRecord({ kind: 'owner_message', message: { text: 'Order seed.' } })}
      route={{ isMove: true, taskID: 'conversation' }}
      tasks={[]}
    />,
  );

  expect(rendered.getByRole('link', { name: '→ task conversation (moved)' })).toHaveAttribute(
    'href',
    '/',
  );
});

test('it names a task the list does not hold by its ID', () => {
  const rendered = render(
    <RoutingMark
      record={buildMockLogRecord({ kind: 'owner_message', message: { text: 'Order seed.' } })}
      route={{ isMove: false, taskID: 'p7hd2wq9zn' }}
      tasks={[]}
    />,
  );

  expect(rendered.getByRole('link')).toHaveTextContent('→ task p7hd2wq9zn');
});

test('it offers only the open tasks other than the current one as places to move to', async () => {
  const ctx = setupTest();

  const rendered = render(
    <RoutingMark
      record={buildMockLogRecord({ kind: 'owner_message', message: { text: 'Order seed.' } })}
      route={{ isMove: false, taskID: 'p7hd2wq9zn' }}
      tasks={[
        {
          brief: 'Buys what the garden needs.',
          lastActivityAt: new Date('2026-10-14T09:00:00.000Z'),
          name: 'Seed order',
          state: 'waiting',
          taskID: 'p7hd2wq9zn',
        },
        {
          brief: 'Plans the vegetable beds.',
          lastActivityAt: new Date('2026-10-14T08:00:00.000Z'),
          name: 'Garden plan',
          state: 'ready',
          taskID: 'k3vq8m2xpa',
        },
        {
          brief: 'Booked the tiler.',
          lastActivityAt: new Date('2026-10-13T08:00:00.000Z'),
          name: 'Tiler booking',
          state: 'done',
          taskID: 'r5bn1cy6tf',
        },
      ]}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Move' }));

  const options = rendered.getAllByRole('option').map((option) => option.textContent);

  expect(options).toStrictEqual(['Garden plan', 'A new task']);
});

test('it moves the message to the task you pick', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const garden = await store.tasks.create({ name: 'Garden plan', state: 'waiting' });

  const stored = await store.records.create({
    kind: 'owner_message',
    message: { text: 'Order seed.' },
    thread: 'conversation',
  });

  const rendered = render(
    <RoutingMark
      record={toLogRecord(stored)}
      route={undefined}
      tasks={[
        {
          brief: garden.brief,
          lastActivityAt: garden.lastActivityAt,
          name: garden.name,
          state: garden.state,
          taskID: garden.taskID,
        },
      ]}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Move' }));
  await ctx.user.click(rendered.getByRole('button', { name: 'Move' }));

  await waitFor(() => {
    expect(rendered.queryByRole('form')).toBeNull();
  });

  const corrected = store.records.findFirst((query) =>
    query.where({ kind: 'task.route_corrected' }),
  );

  expect(corrected?.route).toStrictEqual({
    isMove: true,
    messages: [stored.sequence],
    taskID: garden.taskID,
  });
});

test('it moves the message to a new task with the name and brief you give', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const stored = await store.records.create({
    kind: 'owner_message',
    message: { text: 'Find a plumber for the outside tap.' },
    thread: 'conversation',
  });

  const rendered = render(
    <RoutingMark record={toLogRecord(stored)} route={undefined} tasks={[]} />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Move' }));
  await ctx.user.type(rendered.getByRole('textbox', { name: 'Name' }), 'Plumber');
  await ctx.user.type(rendered.getByRole('textbox', { name: 'Brief' }), 'Books a plumber.');
  await ctx.user.click(rendered.getByRole('button', { name: 'Move' }));

  await waitFor(() => {
    expect(rendered.queryByRole('form')).toBeNull();
  });

  const created = store.tasks.findFirst((query) => query.where({ name: 'Plumber' }));

  expect(created).toMatchObject({ brief: 'Books a plumber.', name: 'Plumber', state: 'ready' });
});

test('it tells you when the move does not finish', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(
    <RoutingMark
      record={buildMockLogRecord({
        kind: 'owner_message',
        message: { text: 'Order seed.' },
        sequence: 404,
        thread: 'conversation',
      })}
      route={undefined}
      tasks={[]}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Move' }));
  await ctx.user.type(rendered.getByRole('textbox', { name: 'Name' }), 'Plumber');
  await ctx.user.type(rendered.getByRole('textbox', { name: 'Brief' }), 'Books a plumber.');
  await ctx.user.click(rendered.getByRole('button', { name: 'Move' }));

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('The move did not finish. Try again.');
});
