import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryView } from '../components/memory-view';
import { store } from '../mocks/store';
import { createDeviceSession } from './create-device-session';
import { render } from './render';
import { runMemoryForget } from './run-memory-forget';

async function setupTest() {
  const user = userEvent.setup();

  // every memory read needs a signed-in browser
  await createDeviceSession();

  return { user };
}

test('it forgets the item in the row once the preview has read it', async () => {
  const ctx = await setupTest();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Keeps bees' }] });

  const rendered = render(<MemoryView />);

  const row = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await runMemoryForget(ctx.user, row);

  await waitFor(() => {
    expect(store.memoryItems.findFirst((query) => query.where({ shortID: 'k3m9qa' }))?.state).toBe(
      'forgotten',
    );
  });
});
