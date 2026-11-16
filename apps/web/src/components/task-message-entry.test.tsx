import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { TaskMessageEntry } from './task-message-entry';

test('it shows a received message as one line that links to it in the sender’s thread', () => {
  const rendered = render(
    <TaskMessageEntry
      layout="line"
      message={{
        direction: 'received',
        hop: 2,
        kind: 'report',
        messageID: 'm7q2x9k4pa',
        taskID: 'k3vq8m2xpa',
        taskName: 'Garden plan',
        text: 'The beans are in, and the peas go in next week.',
        woke: true,
      }}
    />,
  );

  expect(rendered.getByRole('listitem', { name: 'Message from Garden plan' })).toHaveTextContent(
    /^Received a message from Garden plan$/u,
  );

  expect(
    rendered.getByRole('link', { name: 'Received a message from Garden plan' }),
  ).toHaveAttribute('href', '/tasks/k3vq8m2xpa#task-message-m7q2x9k4pa');
});

test('it shows a sent message as one line that names its receiver and links to it in the receiver’s thread', async () => {
  await createDeviceSession();

  await store.tasks.create({ name: 'Seed order', taskID: 'p7hd2wq9zn' });

  const rendered = render(
    <TaskMessageEntry
      layout="line"
      message={{
        direction: 'sent',
        hop: 1,
        kind: 'request',
        messageID: 'r4t8w2qz6n',
        taskID: 'p7hd2wq9zn',
        text: 'Order the runner beans.',
        woke: true,
      }}
    />,
  );

  const line = await rendered.findByRole('link', { name: 'Sent a message to Seed order' });

  expect(line).toHaveAttribute('href', '/tasks/p7hd2wq9zn#task-message-r4t8w2qz6n');
});

test('it frames a received message with its sender, kind, hop and whole text', () => {
  const rendered = render(
    <TaskMessageEntry
      layout="block"
      message={{
        direction: 'received',
        hop: 2,
        kind: 'question',
        messageID: 'm7q2x9k4pa',
        taskID: 'k3vq8m2xpa',
        taskName: 'Garden plan',
        text: 'Which bed gets the beans?',
        woke: true,
      }}
    />,
  );

  expect(rendered.getByRole('listitem', { name: 'Message from Garden plan' })).toHaveTextContent(
    'From Garden plan · question · hop 2Which bed gets the beans?',
  );
});

test('it frames a sent message with its receiver, kind, hop and whole text', async () => {
  await createDeviceSession();

  await store.tasks.create({ name: 'Conversation', taskID: 'conversation' });

  const rendered = render(
    <TaskMessageEntry
      layout="block"
      message={{
        direction: 'sent',
        hop: 1,
        kind: 'report',
        messageID: 'r4t8w2qz6n',
        taskID: 'conversation',
        text: 'The bean bed is planned:\nrunner beans along the north fence.',
        woke: true,
      }}
    />,
  );

  const block = await rendered.findByRole('listitem', { name: 'Message to Conversation' });

  expect(block).toHaveTextContent(
    'To Conversation · report · hop 1The bean bed is planned: runner beans along the north fence.',
  );
});

test('it marks a message that did not wake its receiver, and one since forgotten', () => {
  const rendered = render(
    <TaskMessageEntry
      layout="block"
      message={{
        direction: 'received',
        hop: 21,
        kind: 'report',
        messageID: 'm7q2x9k4pa',
        taskID: 'k3vq8m2xpa',
        taskName: 'Garden plan',
        woke: false,
      }}
    />,
  );

  expect(rendered.getByRole('listitem')).toHaveTextContent(
    'From Garden plan · report · hop 21 · did not wake its receiverThis message was forgotten.',
  );
});

test('it loads the whole text of a sent message that the server cut, in place of the cut one', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const call = await store.records.create({
    kind: 'tool_called',
    thread: 'p7hd2wq9zn',
    toolCall: {
      callID: 'call-1',
      input: { to: 'k3vq8m2xpa', kind: 'chat', body: 'the whole text of the message' },
      tool: 'task.message',
    },
  });

  const rendered = render(
    <TaskMessageEntry
      layout="block"
      message={{
        cut: { sequence: call.sequence, thread: 'p7hd2wq9zn' },
        direction: 'sent',
        hop: 1,
        kind: 'chat',
        messageID: 'm7q2x9k4pa',
        taskID: 'k3vq8m2xpa',
        taskName: 'Garden plan',
        text: 'the cut start of the message',
        woke: true,
      }}
    />,
  );

  await user.click(rendered.getByRole('button', { name: 'Load the whole value' }));

  await waitFor(() => {
    expect(rendered.getByRole('listitem', { name: 'Message to Garden plan' })).toHaveTextContent(
      'the whole text of the message',
    );
  });
});
