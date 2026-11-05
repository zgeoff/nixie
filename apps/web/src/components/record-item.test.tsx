import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { toLogRecord } from '../mocks/to-log-record';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { RecordItem } from './record-item';

test('it shows your message as typed with the control that forgets it', () => {
  const rendered = render(
    <RecordItem
      record={buildMockLogRecord({
        kind: 'owner_message',
        message: { text: 'The shed code is 4417.' },
      })}
    />,
  );

  expect(rendered.getByRole('listitem')).toHaveTextContent('You The shed code is 4417.Forget');
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

  const rendered = render(<RecordItem record={toLogRecord(stored)} />);

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
    />,
  );

  const gap = await rendered.findByText('Image unavailable');

  expect(gap).toBeInTheDocument();
});

test('it shows nothing for a message whose text is shredded', () => {
  const rendered = render(<RecordItem record={buildMockLogRecord({ kind: 'owner_message' })} />);

  expect(rendered.container).toBeEmptyDOMElement();
});

test('it offers no forget for a message of a kind the API cannot forget', () => {
  const rendered = render(
    <RecordItem
      record={buildMockLogRecord({ kind: 'assistant_message', message: { text: 'Hello.' } })}
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

  const rendered = render(<RecordItem record={toLogRecord(stored)} />);

  await user.click(rendered.getByRole('button', { name: 'Forget' }));
  await user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  await waitFor(() => {
    expect(rendered.container).toBeEmptyDOMElement();
  });
});
