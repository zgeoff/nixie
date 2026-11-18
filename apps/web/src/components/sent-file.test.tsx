import { expect, onTestFinished, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { SentFile } from './sent-file';

// happy-dom follows a clicked download link as a page load, so the test records each click instead.
function setupTest() {
  const user = userEvent.setup();
  const downloads: { name: string }[] = [];

  const onDocumentClick = (event: MouseEvent): void => {
    if (event.target instanceof HTMLAnchorElement && event.target.download !== '') {
      event.preventDefault();
      downloads.push({ name: event.target.download });
    }
  };

  document.addEventListener('click', onDocumentClick, { capture: true });

  onTestFinished(() => {
    document.removeEventListener('click', onDocumentClick, { capture: true });
  });

  return { user, downloads };
}

test('it shows an image inline with its name, size and caption', async () => {
  setupTest();

  await createDeviceSession();

  await store.files.create({
    file: 'p3n8x2c7ke',
    name: 'revenue.png',
    mediaType: 'image/png',
    data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toBase64(),
  });

  const rendered = render(
    <ol>
      <SentFile
        file={{
          callID: 'call-1',
          file: 'p3n8x2c7ke',
          name: 'revenue.png',
          bytes: 48_213,
          mediaType: 'image/png',
          caption: 'Revenue by region',
        }}
      />
    </ol>,
  );

  const image = await rendered.findByRole('img', { name: 'revenue.png' });

  expect(image).toHaveAttribute('src', expect.stringMatching(/^blob:/u));

  expect(rendered.getByRole('listitem')).toHaveTextContent(
    'revenue.png · 47.1 KiBRevenue by region',
  );
});

test('it shows a file that is not an image as a chip that downloads it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.files.create({
    file: 'k7w2m9qa4x',
    name: 'orders.csv',
    mediaType: 'text/csv',
    data: new TextEncoder().encode('a,b\n').toBase64(),
  });

  const rendered = render(
    <ol>
      <SentFile
        file={{
          callID: 'call-1',
          file: 'k7w2m9qa4x',
          name: 'orders.csv',
          bytes: 4,
          mediaType: 'text/csv',
        }}
      />
    </ol>,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'orders.csv · 4 B' }));
  await rendered.findByRole('button', { name: 'orders.csv · 4 B' });

  expect({ downloads: ctx.downloads, images: rendered.queryAllByRole('img') }).toStrictEqual({
    downloads: [{ name: 'orders.csv' }],
    images: [],
  });
});

test('it shows the name and size of an image that a forget made unreadable, with no image', async () => {
  setupTest();

  await createDeviceSession();

  await store.files.create({
    file: 'r4t8w2qz6n',
    name: 'revenue.png',
    mediaType: 'image/png',
    isForgotten: true,
  });

  const rendered = render(
    <ol>
      <SentFile
        file={{
          callID: 'call-1',
          file: 'r4t8w2qz6n',
          name: 'revenue.png',
          bytes: 48_213,
          mediaType: 'image/png',
        }}
      />
    </ol>,
  );

  const note = await rendered.findByText('revenue.png · 47.1 KiB · Forgotten');

  expect(note).toBeVisible();
  expect(rendered.queryAllByRole('img')).toStrictEqual([]);
});

test('it shows a file that no longer exists as unavailable', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(
    <ol>
      <SentFile
        file={{
          callID: 'call-1',
          file: 'zzzzzzzzzz',
          name: 'orders.csv',
          bytes: 4,
          mediaType: 'text/csv',
        }}
      />
    </ol>,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'orders.csv · 4 B' }));

  const note = await rendered.findByText('orders.csv · 4 B · Unavailable');

  expect(note).toBeVisible();
});

test('it opens an image full size in a dialog on a tap', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.files.create({
    file: 'p3n8x2c7ke',
    name: 'revenue.png',
    mediaType: 'image/png',
    data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toBase64(),
  });

  const rendered = render(
    <ol>
      <SentFile
        file={{
          callID: 'call-1',
          file: 'p3n8x2c7ke',
          name: 'revenue.png',
          bytes: 48_213,
          mediaType: 'image/png',
        }}
      />
    </ol>,
  );

  const open = await rendered.findByRole('button', { name: 'Open revenue.png full size' });

  await ctx.user.click(open);

  expect(rendered.container.querySelector('dialog')).toHaveAttribute('open');
});
