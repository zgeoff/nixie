import { expect, test } from 'bun:test';
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
    (image: HTMLElement) => image.getAttribute('src')?.startsWith('blob:') === true,
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

test('it shows a forgotten message as a gap with no control', () => {
  const rendered = render(<RecordItem record={buildMockLogRecord({ kind: 'owner_message' })} />);

  expect(rendered.getByRole('listitem')).toHaveTextContent('You Forgotten');
  expect(rendered.queryByRole('button')).toBeNull();
});

test('it offers no forget for a message of a kind the API cannot forget', () => {
  const rendered = render(
    <RecordItem
      record={buildMockLogRecord({ kind: 'assistant_message', message: { text: 'Hello.' } })}
    />,
  );

  expect(rendered.queryByRole('button')).toBeNull();
});

test('it shows the gap as soon as your forget succeeds', async () => {
  const user = userEvent.setup();

  // the API forgets a record only for a signed-in browser
  await createDeviceSession();

  const stored = await store.records.create({
    kind: 'model.reply',
    message: { text: 'Your shed code is 4417.' },
  });

  const rendered = render(<RecordItem record={toLogRecord(stored)} />);

  await user.click(rendered.getByRole('button', { name: 'Forget' }));
  await user.click(rendered.getByRole('button', { name: 'Forget for good' }));

  const gap = await rendered.findByText('Forgotten');

  expect(gap).toBeVisible();
  expect(rendered.getByRole('listitem')).not.toHaveTextContent('4417');
});
