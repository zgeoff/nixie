import { expect, test } from 'bun:test';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { MemoryView } from './memory-view';

function setupTest() {
  const user = userEvent.setup();

  return { user };
}

test('it lists each retired item at its version, all selected, and says the chat records stay', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    shortID: 'r7tq2w',
    state: 'retired',
    versions: [{ text: 'Owns a red canoe' }, { change: 'retired', text: 'Owns a red canoe' }],
  });

  await store.memoryItems.create({ shortID: 'a4kd9x', versions: [{ text: 'Grows chillies' }] });

  const rendered = render(<MemoryView />);
  const retired = rendered.getByRole('region', { name: 'Retired' });

  await ctx.user.click(within(retired).getByRole('button', { name: 'Delete retired items' }));

  const list = await within(retired).findByRole('list', { name: 'Retired items to delete' });

  expect(
    within(list).getByRole('checkbox', { name: 'r7tq2w: Owns a red canoe (version 2)' }),
  ).toBeChecked();

  expect(within(list).getAllByRole('checkbox')).toHaveLength(1);

  expect(within(retired).getByRole('group', { name: 'Delete retired items' })).toHaveTextContent(
    /You cannot undo it\..*Your messages and nixie's replies stay\./u,
  );
});

test('it deletes only the selected retired items and reports how many went', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    shortID: 'r7tq2w',
    state: 'retired',
    versions: [{ text: 'Owns a red canoe' }],
  });

  await store.memoryItems.create({
    shortID: 'p2vb8m',
    state: 'retired',
    versions: [{ text: 'Plays the oboe badly' }],
  });

  const rendered = render(<MemoryView />);
  const retired = rendered.getByRole('region', { name: 'Retired' });

  await ctx.user.click(within(retired).getByRole('button', { name: 'Delete retired items' }));

  const kept = await within(retired).findByRole('checkbox', {
    name: 'p2vb8m: Plays the oboe badly (version 1)',
  });

  await ctx.user.click(kept);
  await ctx.user.click(within(retired).getByRole('button', { name: 'Delete 1 item for good' }));

  const alert = await rendered.findByRole('alert');

  const left = store.memoryItems.findMany((query) => query.where({ state: 'retired' }));

  expect(alert).toHaveTextContent('Deleted 1 item for good.');
  expect(left.map((item) => item.shortID)).toStrictEqual(['p2vb8m']);
});

test('it deletes nothing and says why when an item was restored after the list loaded', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    shortID: 'r7tq2w',
    state: 'retired',
    versions: [{ text: 'Owns a red canoe' }],
  });

  await store.memoryItems.create({
    shortID: 'p2vb8m',
    state: 'retired',
    versions: [{ text: 'Plays the oboe badly' }],
  });

  const rendered = render(<MemoryView />);
  const retired = rendered.getByRole('region', { name: 'Retired' });

  await ctx.user.click(within(retired).getByRole('button', { name: 'Delete retired items' }));

  await within(retired).findByRole('list', { name: 'Retired items to delete' });

  await store.memoryItems.update((query) => query.where({ shortID: 'p2vb8m' }), {
    data(draft) {
      draft.state = 'active';

      draft.versions.push({
        change: 'restored',
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
        text: 'Plays the oboe badly',
        writerModel: null,
      });
    },
  });

  await ctx.user.click(within(retired).getByRole('button', { name: 'Delete 2 items for good' }));

  const alert = await rendered.findByRole('alert');

  const forgotten = store.memoryItems.findMany((query) => query.where({ state: 'forgotten' }));

  expect(alert).toHaveTextContent(
    'An item changed after the list loaded, so nothing was deleted. Check the retired items, then try again.',
  );

  expect(forgotten).toStrictEqual([]);
});

test('it shows the deleted and pending counts after a run fails, and finishes the run on request', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    shortID: 'r7tq2w',
    state: 'retired',
    versions: [{ text: 'Owns a red canoe' }],
  });

  await store.memoryItems.create({
    failsForgetCleanup: true,
    shortID: 'p2vb8m',
    state: 'retired',
    versions: [{ text: 'Plays the oboe badly' }],
  });

  const rendered = render(<MemoryView />);
  const retired = rendered.getByRole('region', { name: 'Retired' });

  await ctx.user.click(within(retired).getByRole('button', { name: 'Delete retired items' }));

  await within(retired).findByRole('list', { name: 'Retired items to delete' });

  await ctx.user.click(within(retired).getByRole('button', { name: 'Delete 2 items for good' }));

  const progress = await within(retired).findByRole('alert');

  await within(progress).findByText('1 item deleted, 1 item still pending.');

  await ctx.user.click(within(retired).getByRole('button', { name: 'Finish the deletion' }));

  const alert = await rendered.findByRole('alert');

  const forgotten = store.memoryItems.findMany((query) => query.where({ state: 'forgotten' }));

  expect(alert).toHaveTextContent('Deleted 2 items for good.');
  expect(forgotten.map((item) => item.shortID)).toIncludeSameMembers(['r7tq2w', 'p2vb8m']);
});

test('it still offers to finish a failed run after the page is left and opened again', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    shortID: 'r7tq2w',
    state: 'retired',
    versions: [{ text: 'Owns a red canoe' }],
  });

  await store.memoryItems.create({
    failsForgetCleanup: true,
    shortID: 'p2vb8m',
    state: 'retired',
    versions: [{ text: 'Plays the oboe badly' }],
  });

  const rendered = render(<MemoryView />);

  await ctx.user.click(
    within(rendered.getByRole('region', { name: 'Retired' })).getByRole('button', {
      name: 'Delete retired items',
    }),
  );

  await rendered.findByRole('list', { name: 'Retired items to delete' });
  await ctx.user.click(rendered.getByRole('button', { name: 'Delete 2 items for good' }));
  await rendered.findByText('1 item deleted, 1 item still pending.');

  rendered.rerender(<p>Elsewhere</p>);
  rendered.rerender(<MemoryView />);

  const finish = await within(rendered.getByRole('region', { name: 'Retired' })).findByRole(
    'group',
    { name: 'Finish the deletion' },
  );

  await within(finish).findByText('1 item deleted, 1 item still pending.');

  await ctx.user.click(within(finish).getByRole('button', { name: 'Finish the deletion' }));

  const alert = await rendered.findByRole('alert');

  const forgotten = store.memoryItems.findMany((query) => query.where({ state: 'forgotten' }));

  expect(alert).toHaveTextContent('Deleted 2 items for good.');
  expect(forgotten.map((item) => item.shortID)).toIncludeSameMembers(['r7tq2w', 'p2vb8m']);
});

test('it closes the confirmation and deletes nothing when the user keeps the items', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    shortID: 'r7tq2w',
    state: 'retired',
    versions: [{ text: 'Owns a red canoe' }],
  });

  const rendered = render(<MemoryView />);
  const retired = rendered.getByRole('region', { name: 'Retired' });

  await ctx.user.click(within(retired).getByRole('button', { name: 'Delete retired items' }));

  await within(retired).findByRole('list', { name: 'Retired items to delete' });

  await ctx.user.click(within(retired).getByRole('button', { name: 'Keep them' }));

  const left = store.memoryItems.findMany((query) => query.where({ state: 'retired' }));

  expect(within(retired).queryByRole('group', { name: 'Delete retired items' })).toBeNull();
  expect(left.map((item) => item.shortID)).toStrictEqual(['r7tq2w']);
});
