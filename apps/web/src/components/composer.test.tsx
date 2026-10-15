import { expect, mock, test } from 'bun:test';
import type { SpanState } from '@heynixie/contract';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test-utils/render';
import type { ComposedMessage } from './composer';
import { Composer } from './composer';

test('it labels typed and pasted text with their own spans', async () => {
  const user = userEvent.setup();
  const onSend = mock<(message: SpanState) => void>();
  const rendered = render(<Composer onSend={onSend} />);

  await user.type(rendered.getByRole('textbox', { name: 'Message' }), 'see ');
  await user.paste('this link');
  await user.click(rendered.getByRole('button', { name: 'Send' }));

  expect(onSend).toHaveBeenCalledExactlyOnceWith({
    spans: [
      { end: 4, source: 'typed', start: 0 },
      { end: 13, source: 'pasted', start: 4 },
    ],
    text: 'see this link',
  });
});

test('it sends the message when you press Enter', async () => {
  const user = userEvent.setup();
  const onSend = mock<(message: SpanState) => void>();
  const rendered = render(<Composer onSend={onSend} />);

  await user.type(rendered.getByRole('textbox', { name: 'Message' }), 'hello{Enter}');

  expect(onSend).toHaveBeenCalledExactlyOnceWith({
    spans: [{ end: 5, source: 'typed', start: 0 }],
    text: 'hello',
  });
});

test('it sends only the spans and the text after a delete', async () => {
  const user = userEvent.setup();
  const onSend = mock<(message: SpanState) => void>();
  const rendered = render(<Composer onSend={onSend} />);

  await user.type(rendered.getByRole('textbox', { name: 'Message' }), 'hello{Backspace}{Enter}');

  expect(onSend).toHaveBeenCalledExactlyOnceWith({
    spans: [{ end: 4, source: 'typed', start: 0 }],
    text: 'hell',
  });
});

test('it clears the box once the message is sent', async () => {
  const user = userEvent.setup();
  const rendered = render(<Composer onSend={mock<(message: SpanState) => void>()} />);

  await user.type(rendered.getByRole('textbox', { name: 'Message' }), 'hello{Enter}');

  expect(rendered.getByRole('textbox', { name: 'Message' })).toHaveValue('');
});

test('it sends nothing when the box holds only whitespace', async () => {
  const user = userEvent.setup();
  const onSend = mock<(message: SpanState) => void>();
  const rendered = render(<Composer onSend={onSend} />);

  await user.type(rendered.getByRole('textbox', { name: 'Message' }), '   {Enter}');

  expect(onSend).not.toHaveBeenCalled();
});

test('it attaches an image from the photo picker, shows it, and sends the scaled copy with the message', async () => {
  const user = userEvent.setup();
  const onSend = mock<(message: ComposedMessage) => void>();

  const scaled = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'image.jpg', {
    type: 'image/jpeg',
  });

  const normalizeImage = mock<(image: File) => Promise<File>>(() => Promise.resolve(scaled));
  const rendered = render(<Composer normalizeImage={normalizeImage} onSend={onSend} />);

  await user.upload(
    rendered.getByLabelText('Photos'),
    new File([new Uint8Array([1, 2, 3])], 'balcony.png', { type: 'image/png' }),
  );

  await user.type(rendered.getByRole('textbox', { name: 'Message' }), 'Plants?{Enter}');

  expect(normalizeImage.mock.calls.map((call) => call[0].name)).toStrictEqual(['balcony.png']);

  expect(onSend).toHaveBeenCalledExactlyOnceWith({
    images: [scaled],
    spans: [{ end: 7, source: 'typed', start: 0 }],
    text: 'Plants?',
  });
});

test('it holds the send, the message and its text while an attached image still scales', async () => {
  const user = userEvent.setup();
  const onSend = mock<(message: ComposedMessage) => void>();
  const scaling = Promise.withResolvers<File>();
  const rendered = render(<Composer normalizeImage={() => scaling.promise} onSend={onSend} />);

  await user.upload(
    rendered.getByLabelText('Photos'),
    new File([new Uint8Array([1, 2, 3])], 'balcony.png', { type: 'image/png' }),
  );

  await user.type(rendered.getByRole('textbox', { name: 'Message' }), 'Plants?{Enter}');

  expect(onSend).not.toHaveBeenCalled();
  expect(rendered.getByRole('button', { name: 'Send' })).toBeDisabled();
  expect(rendered.getByRole('textbox', { name: 'Message' })).toHaveValue('Plants?');
});

test('it attaches a photo from the camera', async () => {
  const user = userEvent.setup();

  const scaled = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'image.jpg', {
    type: 'image/jpeg',
  });

  const rendered = render(
    <Composer normalizeImage={() => Promise.resolve(scaled)} onSend={mock()} />,
  );

  await user.upload(
    rendered.getByLabelText('Camera'),
    new File([new Uint8Array([1, 2, 3])], 'capture.jpg', { type: 'image/jpeg' }),
  );

  const thumbnails = await rendered.findAllByRole('img', { name: /^Attached image/u });

  expect(thumbnails.map((thumbnail) => thumbnail.getAttribute('alt'))).toStrictEqual([
    'Attached image 1',
  ]);
});

test('it attaches a pasted image and leaves the box as it was', async () => {
  const scaled = new File([new Uint8Array([0x89, 0x50])], 'image.png', { type: 'image/png' });

  const rendered = render(
    <Composer normalizeImage={() => Promise.resolve(scaled)} onSend={mock()} />,
  );

  // happy-dom's DataTransfer takes only its own File, so the paste carries a plain clipboard
  fireEvent.paste(rendered.getByRole('textbox', { name: 'Message' }), {
    clipboardData: {
      files: [new File([new Uint8Array([1])], 'screenshot.png', { type: 'image/png' })],
      types: ['Files'],
    },
  });

  const thumbnails = await rendered.findAllByRole('img', { name: /^Attached image/u });

  expect(thumbnails).toHaveLength(1);
  expect(rendered.getByRole('textbox', { name: 'Message' })).toHaveValue('');
});

test('it attaches a dropped image', async () => {
  const scaled = new File([new Uint8Array([0x89, 0x50])], 'image.png', { type: 'image/png' });

  const rendered = render(
    <Composer normalizeImage={() => Promise.resolve(scaled)} onSend={mock()} />,
  );

  fireEvent.drop(rendered.getByRole('textbox', { name: 'Message' }), {
    dataTransfer: {
      files: [new File([new Uint8Array([1])], 'mockup.png', { type: 'image/png' })],
      types: ['Files'],
    },
  });

  const thumbnails = await rendered.findAllByRole('img', { name: /^Attached image/u });

  expect(thumbnails).toHaveLength(1);
});

test('it takes no more than 4 images and says why it left the rest out', async () => {
  const user = userEvent.setup();

  const scaled = new File([new Uint8Array([0x89, 0x50])], 'image.png', { type: 'image/png' });

  const rendered = render(
    <Composer normalizeImage={() => Promise.resolve(scaled)} onSend={mock()} />,
  );

  await user.upload(
    rendered.getByLabelText('Photos'),
    Array.from(
      { length: 5 },
      (_, index) => new File([new Uint8Array([index])], `room-${index}.png`, { type: 'image/png' }),
    ),
  );

  const notice = await rendered.findByRole('status');

  expect(notice).toHaveTextContent('A message takes up to 4 images.');
  expect(rendered.getAllByRole('img', { name: /^Attached image/u })).toHaveLength(4);
});

test('it leaves out an image the browser cannot read and says so', async () => {
  const user = userEvent.setup();

  const rendered = render(
    <Composer
      normalizeImage={() => Promise.reject(new Error('no HEIC decoder'))}
      onSend={mock()}
    />,
  );

  await user.upload(
    rendered.getByLabelText('Photos'),
    new File([new Uint8Array([1])], 'beach.heic', { type: 'image/heic' }),
  );

  const notice = await rendered.findByRole('status');

  expect(notice).toHaveTextContent('This browser could not read an image, so it was left out.');
  expect(rendered.queryAllByRole('img')).toStrictEqual([]);
});

test('it takes off an image you remove before sending', async () => {
  const user = userEvent.setup();
  const onSend = mock<(message: ComposedMessage) => void>();

  const scaled = new File([new Uint8Array([0x89, 0x50])], 'image.png', { type: 'image/png' });

  const rendered = render(
    <Composer normalizeImage={() => Promise.resolve(scaled)} onSend={onSend} />,
  );

  await user.upload(
    rendered.getByLabelText('Photos'),
    new File([new Uint8Array([1])], 'draft.png', { type: 'image/png' }),
  );

  const remove = await rendered.findByRole('button', { name: 'Remove image 1' });

  await user.click(remove);
  await user.type(rendered.getByRole('textbox', { name: 'Message' }), 'Never mind{Enter}');

  expect(onSend).toHaveBeenCalledExactlyOnceWith({
    spans: [{ end: 10, source: 'typed', start: 0 }],
    text: 'Never mind',
  });
});
