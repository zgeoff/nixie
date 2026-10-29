import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/node';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { MemoryView } from './memory-view';

function setupTest() {
  const user = userEvent.setup();

  return { user };
}

test('it retires an active item once the user confirms', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Retire' }));

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Retire this item' })).getByRole('button', {
      name: 'Retire',
    }),
  );

  await within(rendered.getByRole('region', { name: 'Retired' })).findByRole('listitem', {
    name: 'k3m9qa',
  });

  expect(store.memoryItems.findFirst((query) => query.where({ shortID: 'k3m9qa' }))?.state).toBe(
    'retired',
  );
});

test('it restores a retired item once the user confirms', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    shortID: 'k3m9qa',
    state: 'retired',
    versions: [
      { text: 'Plays the cello' },
      { change: 'retired', state: 'retired', text: 'Plays the cello' },
    ],
  });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Retired' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Restore' }));

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Restore this item' })).getByRole('button', {
      name: 'Restore',
    }),
  );

  await within(rendered.getByRole('region', { name: 'Active' })).findByRole('listitem', {
    name: 'k3m9qa',
  });

  expect(store.memoryItems.findFirst((query) => query.where({ shortID: 'k3m9qa' }))?.state).toBe(
    'active',
  );
});

test('it pins an item into the pinned core once the user confirms', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Pin' }));

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Pin this item' })).getByRole('button', {
      name: 'Pin',
    }),
  );

  await within(rendered.getByRole('region', { name: 'Pinned core' })).findByRole('listitem', {
    name: 'k3m9qa',
  });

  expect(
    store.memoryItems.findFirst((query) => query.where({ shortID: 'k3m9qa' }))?.isPinned,
  ).toBeTrue();
});

test('it unpins an item from the pinned core once the user confirms', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    isPinned: true,
    shortID: 'k3m9qa',
    versions: [{ text: 'Plays the cello' }],
  });

  const rendered = render(<MemoryView />);
  const core = rendered.getByRole('region', { name: 'Pinned core' });

  const item = await within(core).findByRole('listitem', { name: 'k3m9qa' });

  await ctx.user.click(within(item).getByRole('button', { name: 'Unpin' }));

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Unpin this item' })).getByRole('button', {
      name: 'Unpin',
    }),
  );

  await within(core).findByText('No item is pinned.');

  expect(
    store.memoryItems.findFirst((query) => query.where({ shortID: 'k3m9qa' }))?.isPinned,
  ).toBeFalse();
});

test('it marks an item sensitive once the user confirms, and the row shows the mark', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    shortID: 'k3m9qa',
    versions: [{ text: 'Lives at 14 Larkspur Lane, flat 3' }],
  });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Mark sensitive' }));

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Mark this item sensitive' })).getByRole(
      'button',
      { name: 'Mark sensitive' },
    ),
  );

  await within(item).findByText(/· sensitive/u);

  expect(
    store.memoryItems.findFirst((query) => query.where({ shortID: 'k3m9qa' }))?.isSensitive,
  ).toBeTrue();
});

test('it clears the sensitive mark of an item once the user confirms', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    isSensitive: true,
    shortID: 'k3m9qa',
    versions: [{ text: 'Lives at 14 Larkspur Lane, flat 3' }],
  });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Clear sensitive' }));

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Clear the sensitive mark' })).getByRole(
      'button',
      { name: 'Clear sensitive' },
    ),
  );

  await within(item).findByRole('button', { name: 'Mark sensitive' });

  expect(
    store.memoryItems.findFirst((query) => query.where({ shortID: 'k3m9qa' }))?.isSensitive,
  ).toBeFalse();
});

test('it changes nothing and says why when the item changed after the confirmation opened', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Retire' }));

  await store.memoryItems.update((query) => query.where({ shortID: 'k3m9qa' }), {
    data(draft) {
      draft.versions.push({
        change: 'edited',
        checkerModel: null,
        checks: null,
        evidence: null,
        evidenceQuote: null,
        isUnreadable: false,
        origin: 'owner',
        proposalID: null,
        recordedAt: new Date(),
        source: 'owner',
        state: 'active',
        taskID: null,
        text: 'Plays the viola',
        writerModel: null,
      });
    },
  });

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Retire this item' })).getByRole('button', {
      name: 'Retire',
    }),
  );

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent(
    'Item k3m9qa: This item changed after you opened it, so nothing changed. Check it, then try again.',
  );

  expect(store.memoryItems.findFirst((query) => query.where({ shortID: 'k3m9qa' }))?.state).toBe(
    'active',
  );
});

test('it shows the item new text once a stale confirmation closes', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] });

  const rendered = render(<MemoryView />);
  const active = rendered.getByRole('region', { name: 'Active' });

  const item = await within(active).findByRole('listitem', { name: 'k3m9qa' });

  await ctx.user.click(within(item).getByRole('button', { name: 'Retire' }));

  await store.memoryItems.update((query) => query.where({ shortID: 'k3m9qa' }), {
    data(draft) {
      draft.versions.push({
        change: 'edited',
        checkerModel: null,
        checks: null,
        evidence: null,
        evidenceQuote: null,
        isUnreadable: false,
        origin: 'owner',
        proposalID: null,
        recordedAt: new Date(),
        source: 'owner',
        state: 'active',
        taskID: null,
        text: 'Plays the viola',
        writerModel: null,
      });
    },
  });

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Retire this item' })).getByRole('button', {
      name: 'Retire',
    }),
  );

  const text = await within(active).findByText('Plays the viola');

  expect(text).toBeVisible();
});

test('it retires the item once when a failed confirm goes again', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] });

  server.use(http.post('*/rpc/memory/retire', () => HttpResponse.error(), { once: true }));

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Retire' }));

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Retire this item' })).getByRole('button', {
      name: 'Retire',
    }),
  );

  await within(item).findByText('The change did not finish. Try again.');

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Retire this item' })).getByRole('button', {
      name: 'Retire',
    }),
  );

  await waitFor(() => {
    expect(
      store.memoryItems.findFirst((query) => query.where({ shortID: 'k3m9qa' }))?.versions,
    ).toHaveLength(2);
  });
});

test('it keeps the item as it is when the user steps back from the confirmation', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Retire' }));
  await ctx.user.click(within(item).getByRole('button', { name: 'Keep as it is' }));

  expect(within(item).queryByRole('group', { name: 'Retire this item' })).toBeNull();
  expect(store.memoryActions.all()).toHaveLength(0);
});

test('it says the pinned core is full when a pin finds no room', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await Promise.all([
    store.memoryItems.create({
      isPinned: true,
      shortID: 'p7x2rd',
      versions: [{ text: 'x'.repeat(7998) }],
    }),
    store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] }),
  ]);

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Pin' }));

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Pin this item' })).getByRole('button', {
      name: 'Pin',
    }),
  );

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent(
    'Item k3m9qa: The pinned core has no room for this item. Unpin another item first.',
  );
});

test('it keeps the reason for a refusal after the refreshed item moves to another list', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Retire' }));

  await store.memoryItems.update((query) => query.where({ shortID: 'k3m9qa' }), {
    data(draft) {
      draft.state = 'forgotten';
    },
  });

  await ctx.user.click(
    within(within(item).getByRole('group', { name: 'Retire this item' })).getByRole('button', {
      name: 'Retire',
    }),
  );

  await within(rendered.getByRole('region', { name: 'Forgotten' })).findByRole('listitem', {
    name: 'k3m9qa',
  });

  expect(rendered.getByRole('alert')).toHaveTextContent(
    'Item k3m9qa: This item is gone. It was forgotten after the list loaded.',
  );
});

test('it offers no change for an item a forget began, even while its text still opens', async () => {
  await createDeviceSession();

  await store.memoryItems.create({
    isShredded: false,
    shortID: 'k3m9qa',
    state: 'forgetting',
    versions: [{ text: 'Plays the cello' }],
  });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Forgotten' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  expect(
    within(item).queryByRole('button', {
      name: /^(?:Retire|Restore|Pin|Unpin|Mark sensitive|Clear sensitive)$/u,
    }),
  ).toBeNull();
});

test('it offers a pin on a self-note', async () => {
  await createDeviceSession();

  await store.memoryItems.create({ subject: 'self', shortID: 'k3m9qa', versions: [{}] });

  const rendered = render(<MemoryView />);

  const item = await rendered.findByRole('listitem', { name: 'k3m9qa' });

  expect(within(item).getByRole('button', { name: 'Pin' })).toBeInTheDocument();
});
