import { expect, test } from 'bun:test';
import { render } from '../test-utils/render';
import { TaskMessageBlock } from './task-message-block';

test('it frames a message from another task with its sender, kind and hop', () => {
  const rendered = render(
    <TaskMessageBlock
      message={{
        from: 'k3vq8m2xpa',
        fromName: 'Garden plan',
        hop: 2,
        kind: 'question',
        messageID: 'm7q2x9k4pa',
        text: 'Which bed gets the beans?',
        to: 'conversation',
        woke: true,
      }}
    />,
  );

  expect(rendered.getByRole('listitem', { name: 'Message from Garden plan' })).toHaveTextContent(
    'From Garden plan · question · hop 2Which bed gets the beans?',
  );
});

test('it marks a message that did not wake its receiver, and one since forgotten', () => {
  const rendered = render(
    <TaskMessageBlock
      message={{
        from: 'k3vq8m2xpa',
        fromName: 'Garden plan',
        hop: 21,
        kind: 'report',
        messageID: 'm7q2x9k4pa',
        to: 'conversation',
        woke: false,
      }}
    />,
  );

  expect(rendered.getByRole('listitem')).toHaveTextContent(
    'From Garden plan · report · hop 21 · did not wake its receiverThis message was forgotten.',
  );
});
