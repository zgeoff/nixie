import { expect, test } from 'bun:test';
import { store } from '../mocks/store';
import { createDeviceSession } from './create-device-session';
import { renderRoute } from './render-route';

test('it renders the route that a path names, signed in', async () => {
  await createDeviceSession();

  await store.records.create({
    kind: 'owner_message',
    message: { text: 'Plant the beans.' },
    thread: 'conversation',
  });

  const rendered = renderRoute('/');

  const message = await rendered.findByText('Plant the beans.', {}, { timeout: 4000 });

  expect(message).toBeVisible();
});
