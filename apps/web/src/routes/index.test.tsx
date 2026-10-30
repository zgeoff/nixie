import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderRoute } from '../test-utils/render-route';

test('it scrolls the conversation to the message that its link names, behind 120 later records', async () => {
  const scrolls = spyOn(HTMLElement.prototype, 'scrollIntoView');

  onTestFinished(() => {
    scrolls.mockRestore();
  });

  await createDeviceSession();

  await store.records.create({
    kind: 'task_message',
    taskMessage: {
      from: 'k3vq8m2xpa',
      fromName: 'Garden plan',
      messageID: 'm7q2x9k4pa',
      text: 'Which bed gets the beans?',
      to: 'conversation',
    },
    thread: 'conversation',
  });

  await Promise.all(
    Array.from({ length: 120 }, () =>
      store.records.create({ kind: 'task.step_started', thread: 'conversation' }),
    ),
  );

  const rendered = renderRoute('/#task-message-m7q2x9k4pa');

  const message = await rendered.findByRole(
    'listitem',
    { name: 'Message from Garden plan' },
    { timeout: 4000 },
  );

  await waitFor(() => {
    expect(scrolls.mock.contexts).toContain(message);
  });
});
