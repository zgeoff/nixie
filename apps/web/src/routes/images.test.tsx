import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockViewStore } from '../mocks/mock-view-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderRoute } from '../test-utils/render-route';

test('it lists only the pinned images until Show all is ticked', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.images.create({
    image: 'k3x9m2p7qa',
    name: 'harbour at dusk',
    isPinned: true,
  });

  await mockViewStore.images.create({ image: 'n8w2c5r4tz', name: 'a rough sketch' });

  const rendered = renderRoute('/images');

  await rendered.findByRole('button', { name: 'Open harbour at dusk' });

  expect(rendered.queryByRole('button', { name: 'Open a rough sketch' })).toBeNull();

  await user.click(rendered.getByRole('checkbox', { name: 'Show all' }));
  await rendered.findByRole('button', { name: 'Open a rough sketch' });

  expect(rendered.getByRole('button', { name: 'Open harbour at dusk' })).toBeVisible();
});

test('it keeps Show all in the address', async () => {
  await createDeviceSession();

  await mockViewStore.images.create({ image: 'k3x9m2p7qa', name: 'a rough sketch' });

  const rendered = renderRoute('/images?all=true');

  await rendered.findByRole('button', { name: 'Open a rough sketch' });

  expect(rendered.getByRole('checkbox', { name: 'Show all' })).toBeChecked();
});

test('it says that no image is pinned and points at Show all', async () => {
  await createDeviceSession();

  await mockViewStore.images.create({ image: 'k3x9m2p7qa', name: 'a rough sketch' });

  const rendered = renderRoute('/images');

  await rendered.findByText(/No image is pinned/u);

  expect(rendered.getByText(/Tick Show all/u)).toBeVisible();
});

test('it says that images appear when the assistant draws one, with Show all ticked and no image', async () => {
  await createDeviceSession();

  const rendered = renderRoute('/images?all=true');

  await rendered.findByText(/Images appear here when the assistant draws or imports one/u);
});

test('it shows the name, prompt and edit source of an image in the lightbox', async () => {
  await createDeviceSession();

  await mockViewStore.images.create({ image: 'k3x9m2p7qa', name: 'harbour at dusk' });

  await mockViewStore.images.create({
    image: 'n8w2c5r4tz',
    name: 'harbour in oil paint',
    prompt: 'the harbour, in oil paint',
    from: 'k3x9m2p7qa',
  });

  const rendered = renderRoute('/images?all=true&image=n8w2c5r4tz');

  await rendered.findByText('the harbour, in oil paint');

  const link = await rendered.findByRole('link', { name: 'harbour at dusk' });

  expect(link).toBeVisible();
  expect(rendered.getByRole('heading', { name: 'harbour in oil paint' })).toBeVisible();
  expect(rendered.getByText(/Edited from/u)).toBeVisible();
});

test('it walks back through the edit chain with the link to the earlier image', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.images.create({
    image: 'k3x9m2p7qa',
    name: 'first pass',
    prompt: 'a harbour',
  });

  await mockViewStore.images.create({
    image: 'n8w2c5r4tz',
    name: 'second pass',
    prompt: 'a harbour in oil paint',
    from: 'k3x9m2p7qa',
  });

  const rendered = renderRoute('/images?all=true&image=n8w2c5r4tz');

  const link = await rendered.findByRole('link', { name: 'first pass' });

  await user.click(link);
  await rendered.findByText('a harbour');

  expect(rendered.queryByText('a harbour in oil paint')).toBeNull();
  expect(rendered.getByRole('heading', { name: 'first pass' })).toBeVisible();
});

test.each([
  ['file', 'Imported from a file'],
  ['photo', 'Imported from a photo'],
] as const)('it shows "%s" imports with no link to an earlier image', async (source, line) => {
  await createDeviceSession();

  await mockViewStore.images.create({ image: 'k3x9m2p7qa', name: 'a scan', source });

  const rendered = renderRoute('/images?all=true&image=k3x9m2p7qa');

  await rendered.findByText(line);

  expect(rendered.queryByRole('link', { name: /scan/u })).toBeNull();
});

test('it shows Forgotten in place of the picture, name and prompt and keeps the edit link', async () => {
  await createDeviceSession();

  await mockViewStore.images.create({ image: 'k3x9m2p7qa', name: 'first pass' });

  await mockViewStore.images.create({
    image: 'n8w2c5r4tz',
    name: 'second pass',
    prompt: 'a harbour in oil paint',
    from: 'k3x9m2p7qa',
    isForgotten: true,
  });

  const rendered = renderRoute('/images?all=true&image=n8w2c5r4tz');

  await rendered.findByText('Forgotten');

  expect(rendered.queryByText('a harbour in oil paint')).toBeNull();

  const link = await rendered.findByRole('link', { name: 'first pass' });

  expect(link).toBeVisible();
});

test('it forgets an image from the lightbox, shows the backup state and drops its tile', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.images.create({
    image: 'k3x9m2p7qa',
    name: 'harbour at dusk',
    prompt: 'a harbour',
  });

  const rendered = renderRoute('/images?all=true&image=k3x9m2p7qa');

  const forget = await rendered.findByRole('button', { name: 'Forget' });

  await user.click(forget);

  expect(rendered.getByText(/Edits made from it keep their pictures/u)).toBeVisible();

  await user.click(rendered.getByRole('button', { name: 'Forget for good' }));
  await rendered.findByText(/Key backups: pending/u);

  await waitFor(() => {
    expect(rendered.queryByText('a harbour')).toBeNull();
  });

  expect(rendered.getByText('Forgotten')).toBeVisible();
  expect(rendered.queryByRole('button', { name: 'Open harbour at dusk' })).toBeNull();
});

test('it keeps the image when the forget is not confirmed', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.images.create({
    image: 'k3x9m2p7qa',
    name: 'harbour at dusk',
    prompt: 'a harbour',
  });

  const rendered = renderRoute('/images?all=true&image=k3x9m2p7qa');

  const forget = await rendered.findByRole('button', { name: 'Forget' });

  await user.click(forget);
  await user.click(rendered.getByRole('button', { name: 'Keep' }));

  expect(rendered.getByText('a harbour')).toBeVisible();
  expect(mockViewStore.images.all().map((row) => row.isForgotten)).toStrictEqual([false]);
});
