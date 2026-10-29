import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { toLogRecord } from '../mocks/to-log-record';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { RecordItem } from './record-item';

test('it shows your message as typed with the controls that move and forget it', () => {
  const rendered = render(
    <RecordItem
      record={buildMockLogRecord({
        kind: 'owner_message',
        message: { text: 'The shed code is 4417.' },
      })}
      route={undefined}
      taskList={{ isFailed: false, onRetry: () => {}, tasks: [] }}
    />,
  );

  expect(rendered.getByRole('listitem')).toHaveTextContent('You The shed code is 4417.MoveForget');
});

test('it marks your message with the task it went to', () => {
  const rendered = render(
    <RecordItem
      record={buildMockLogRecord({
        kind: 'owner_message',
        message: { text: 'Plan the bean rows.' },
        thread: 'conversation',
      })}
      route={{ isMove: false, taskID: 'k3vq8m2xpa' }}
      taskList={{
        isFailed: false,
        onRetry: () => {},
        tasks: [
          {
            brief: 'Plans the vegetable beds.',
            isPauseRequested: false,
            isTakingMessages: true,
            lastActivityAt: new Date('2026-10-14T09:00:00.000Z'),
            name: 'Garden plan',
            state: 'waiting',
            taskID: 'k3vq8m2xpa',
          },
        ],
      }}
    />,
  );

  expect(rendered.getByRole('link', { name: '→ Garden plan' })).toHaveAttribute(
    'href',
    '/tasks/k3vq8m2xpa',
  );
});

test('it shows the images of your message, each read from the API', async () => {
  await createDeviceSession();

  const stored = await store.records.create({
    kind: 'owner_message',
    message: {
      images: [
        { data: 'iVBORw==', mediaType: 'image/png' },
        { data: '/9j/4A==', mediaType: 'image/jpeg' },
      ],
      text: 'Which tile?',
    },
    thread: 'conversation',
  });

  const rendered = render(
    <RecordItem
      record={toLogRecord(stored)}
      route={undefined}
      taskList={{ isFailed: false, onRetry: () => {}, tasks: [] }}
    />,
  );

  const images = await rendered.findAllByRole('img');

  expect(images.map((image) => image.getAttribute('alt'))).toStrictEqual(['Image 1', 'Image 2']);

  expect(images).toSatisfyAll(
    (image: Element) => image.getAttribute('src')?.startsWith('blob:') === true,
  );
});

test('it shows an image the API no longer holds as unavailable', async () => {
  await createDeviceSession();

  const rendered = render(
    <RecordItem
      record={buildMockLogRecord({
        kind: 'owner_message',
        message: { images: [{ mediaType: 'image/png' }], text: 'Which tile?' },
        sequence: 404,
        thread: 'conversation',
      })}
      route={undefined}
      taskList={{ isFailed: false, onRetry: () => {}, tasks: [] }}
    />,
  );

  const gap = await rendered.findByText('Image unavailable');

  expect(gap).toBeInTheDocument();
});

test('it shows nothing for a message whose text is shredded', () => {
  const rendered = render(
    <RecordItem
      record={buildMockLogRecord({ kind: 'owner_message' })}
      route={undefined}
      taskList={{ isFailed: false, onRetry: () => {}, tasks: [] }}
    />,
  );

  expect(rendered.container).toBeEmptyDOMElement();
});

test('it offers no forget for a message of a kind the API cannot forget', () => {
  const rendered = render(
    <RecordItem
      record={buildMockLogRecord({ kind: 'assistant_message', message: { text: 'Hello.' } })}
      route={undefined}
      taskList={{ isFailed: false, onRetry: () => {}, tasks: [] }}
    />,
  );

  expect(rendered.queryByRole('button')).toBeNull();
});

test('it takes the message out of the view as soon as your forget succeeds', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const stored = await store.records.create({
    kind: 'model.reply',
    message: { text: 'Your shed code is 4417.' },
  });

  const rendered = render(
    <RecordItem
      record={toLogRecord(stored)}
      route={undefined}
      taskList={{ isFailed: false, onRetry: () => {}, tasks: [] }}
    />,
  );

  await user.click(rendered.getByRole('button', { name: 'Forget' }));
  await user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  await waitFor(() => {
    expect(rendered.container).toBeEmptyDOMElement();
  });
});
