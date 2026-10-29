import { expect, test } from 'bun:test';
import { within } from '@testing-library/react';
import { store } from '../mocks/store';
import { writeMockForget } from '../mocks/write-mock-forget';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { MemoryItemHistory } from './memory-item-history';

test('it shows a version evidence quote marked inside its message', async () => {
  await createDeviceSession();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'Quick one: my sister Ana lives in Porto now.' },
  });

  await store.memoryItems.create({
    itemID: '6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f',
    versions: [
      {
        evidence: { end: 39, sequence: message.sequence, start: 11 },
        evidenceQuote: 'my sister Ana lives in Porto',
        text: 'Ana, the user’s sister, lives in Porto',
      },
    ],
  });

  const rendered = render(<MemoryItemHistory itemID="6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f" />);

  const evidence = await rendered.findByRole('figure', { name: 'Evidence' });

  expect(within(evidence).getByRole('blockquote')).toHaveTextContent(
    'Quick one: my sister Ana lives in Porto now.',
  );

  expect(evidence.querySelector('mark')).toHaveTextContent(/^my sister Ana lives in Porto$/u);
});

test('it shows the photo a version came from beside the version', async () => {
  await createDeviceSession();

  const photo = await store.records.create({
    kind: 'owner_message',
    message: { images: [{ data: '/9j/4A==', mediaType: 'image/jpeg' }], text: 'The new boat.' },
    thread: 'conversation',
  });

  await store.memoryItems.create({
    itemID: '3c8e1a5f-2b7d-4e9a-8f6c-1d0b5a7e2c94',
    versions: [
      {
        image: { position: 0, sequence: photo.sequence, thread: 'conversation' },
        origin: 'conversation',
        source: 'untrusted',
        text: 'Owns a red kayak',
      },
    ],
  });

  const rendered = render(<MemoryItemHistory itemID="3c8e1a5f-2b7d-4e9a-8f6c-1d0b5a7e2c94" />);

  const version = await rendered.findByRole('listitem', { name: 'Version 1' });
  const image = await within(version).findByRole('img', { name: 'Image 1' });

  expect(image.getAttribute('src')).toStartWith('blob:');

  expect(within(version).getByRole('figure', { name: 'Photo' })).toHaveTextContent(
    'From your photo',
  );
});

test("it shows a version's photo as unavailable once you forget the photo's message", async () => {
  await createDeviceSession();

  const photo = await store.records.create({
    kind: 'owner_message',
    message: { images: [{ data: '/9j/4A==', mediaType: 'image/jpeg' }], text: 'The new boat.' },
    thread: 'conversation',
  });

  await store.memoryItems.create({
    itemID: '3c8e1a5f-2b7d-4e9a-8f6c-1d0b5a7e2c94',
    versions: [
      {
        image: { position: 0, sequence: photo.sequence, thread: 'conversation' },
        text: 'Owns a red kayak',
      },
    ],
  });

  await writeMockForget({
    clientActionID: '2d6b9e41-5c3a-4f7e-b8d0-9a1c4e6f3b25',
    sequence: photo.sequence,
    thread: 'conversation',
  });

  const rendered = render(<MemoryItemHistory itemID="3c8e1a5f-2b7d-4e9a-8f6c-1d0b5a7e2c94" />);

  const photoFigure = await rendered.findByRole('figure', { name: 'Photo' });
  const gap = await within(photoFigure).findByText('Image unavailable');

  expect(gap).toBeInTheDocument();
  expect(within(photoFigure).queryByRole('img')).toBeNull();
});

test('it shows the quote alone when the message it came from was forgotten', async () => {
  await createDeviceSession();

  const message = await store.records.create({ kind: 'owner_message' });

  await store.memoryItems.create({
    itemID: '6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f',
    versions: [
      {
        evidence: { end: 9, sequence: message.sequence, start: 0 },
        evidenceQuote: 'oat milk',
        text: 'Drinks oat milk',
      },
    ],
  });

  const rendered = render(<MemoryItemHistory itemID="6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f" />);

  const evidence = await rendered.findByRole('figure', { name: 'Evidence' });

  expect(evidence).toHaveTextContent(/^oat milkThe message it came from was forgotten$/u);
});

test('it marks the words a version changed from the version before', async () => {
  await createDeviceSession();

  await store.memoryItems.create({
    itemID: '6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f',
    versions: [
      { text: 'Plays the cello on Thursdays' },
      { change: 'edited', text: 'Plays the viola on Thursdays' },
    ],
  });

  const rendered = render(<MemoryItemHistory itemID="6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f" />);

  const second = await rendered.findByRole('listitem', { name: 'Version 2' });

  const changes = within(second).getByLabelText('Changes');

  expect(changes.querySelector('del')).toHaveTextContent('cello');
  expect(changes.querySelector('ins')).toHaveTextContent('viola');

  expect(
    within(rendered.getByRole('listitem', { name: 'Version 1' })).queryByLabelText('Changes'),
  ).toBeNull();
});

test('it shows the writer and checker models with the checks they ran', async () => {
  await createDeviceSession();

  await store.memoryItems.create({
    itemID: '6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f',
    versions: [
      {
        checkerModel: 'stub-checker-1',
        checks: { quote: 'pass', checker: { model: 'stub-checker-1', verdict: 'asserted' } },
        origin: 'memory_writer',
        text: 'Rents a flat on Mill Lane',
        writerModel: 'stub-writer-2',
      },
    ],
  });

  const rendered = render(<MemoryItemHistory itemID="6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f" />);

  const version = await rendered.findByRole('listitem', { name: 'Version 1' });

  expect(version.querySelector('dl')).toHaveTextContent(
    'Checks:quote passed · checker assertedWriter model:stub-writer-2Checker model:stub-checker-1',
  );
});

test('it shows each version of a forgotten item as a gap', async () => {
  await createDeviceSession();

  await store.memoryItems.create({
    forgottenAt: new Date('2026-03-04T10:00:00Z'),
    itemID: '6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f',
    state: 'forgotten',
    versions: [{ text: 'Plays the cello on Thursdays' }],
  });

  const rendered = render(<MemoryItemHistory itemID="6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f" />);

  const version = await rendered.findByRole('listitem', { name: 'Version 1' });

  expect(within(version).getByText('(forgotten)')).toBeVisible();
  expect(rendered.queryByText(/cello/u)).toBeNull();
});

test('it shows a version whose text fails to open as unavailable, not as forgotten', async () => {
  await createDeviceSession();

  await store.memoryItems.create({
    itemID: '6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f',
    versions: [{ isUnreadable: true, text: 'Plays the cello on Thursdays' }],
  });

  const rendered = render(<MemoryItemHistory itemID="6f0c2d4e-8a1b-4c3d-9e5f-7a2b1c0d9e8f" />);

  const version = await rendered.findByRole('listitem', { name: 'Version 1' });

  expect(within(version).getByText('(text unavailable)')).toBeVisible();
  expect(within(version).queryByText('(forgotten)')).toBeNull();
});
