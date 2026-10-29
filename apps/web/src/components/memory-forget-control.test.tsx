import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/node';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { runMemoryForget } from '../test-utils/run-memory-forget';
import { MemoryView } from './memory-view';

function setupTest() {
  const user = userEvent.setup();

  return { user };
}

test('it shows the item with every version in the confirmation', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    shortID: 'k3m9qa',
    versions: [{ text: 'Keeps bees on the roof' }, { change: 'edited', text: 'Keeps two hives' }],
  });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Forget' }));

  const confirmation = within(item).getByRole('group', { name: 'Forget this item' });

  const history = await within(confirmation).findByRole('list', { name: 'History' });

  expect(
    within(history)
      .getAllByRole('listitem')
      .map((entry) => entry.getAttribute('aria-label')),
  ).toStrictEqual(['Version 1', 'Version 2']);
});

test('it lists what the forget destroys, the messages it came from included', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    shortID: 'k3m9qa',
    versions: [{ text: 'Keeps bees on the roof', evidence: { sequence: 4, start: 0, end: 10 } }],
  });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Forget' }));

  const losses = await within(item).findByRole('list', { name: 'What the forget destroys' });

  expect(
    within(losses)
      .getAllByRole('listitem')
      .map((loss) => loss.textContent),
  ).toStrictEqual([
    'The text of every version',
    'Its place in recall and in the pinned core',
    'The conversation summaries that hold it',
    "The conversation's session, which nixie rebuilds without it",
    'Recall of the 1 message it came from',
  ]);
});

test('it names the disk snapshots the forget cannot reach, and links to the conversation for the messages that stay', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Keeps bees' }] });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Forget' }));

  const confirmation = within(item).getByRole('group', { name: 'Forget this item' });

  const link = await within(confirmation).findByRole('link', { name: 'the conversation' });

  expect(confirmation).toHaveTextContent(
    /A disk snapshot that you took by hand of nixie's host or its volumes still holds this item\. nixie cannot reach it, so delete it yourself\.Your messages and nixie's replies that state the same fact stay\./u,
  );

  expect(link).toHaveAttribute('href', '/');
});

test('it forgets an item once the user confirms, which then shows as a dated gap', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Keeps bees' }] });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Forget' }));

  const confirmation = within(item).getByRole('group', { name: 'Forget this item' });

  await within(confirmation).findByRole('list', { name: 'What the forget destroys' });

  await ctx.user.click(within(confirmation).getByRole('button', { name: 'Forget for good' }));

  const gap = await within(rendered.getByRole('region', { name: 'Forgotten' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  expect(gap).toHaveTextContent(/^Forgotten item · created .+ · forgotten .+$/u);
});

test('it closes the confirmation with the reason when the item changed after it opened', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Keeps bees' }] });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Forget' }));

  await within(item).findByRole('list', { name: 'What the forget destroys' });

  await store.memoryItems.update((query) => query.where({ shortID: 'k3m9qa' }), {
    data(draft) {
      draft.versions.push({
        change: 'edited',
        checkerModel: null,
        checks: null,
        evidence: null,
        evidenceQuote: null,
        image: null,
        isUnreadable: false,
        origin: 'owner',
        proposalID: null,
        recordedAt: new Date(),
        source: 'owner',
        state: 'active',
        taskID: null,
        text: 'Keeps two hives',
        writerModel: null,
      });
    },
  });

  await ctx.user.click(within(item).getByRole('button', { name: 'Forget for good' }));

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent(
    'Item k3m9qa: This item changed after you opened it, so nothing was forgotten. Check it, then try again.',
  );
});

test('it shows the reason in place of the preview when the item moved on before the confirmation opened', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Keeps bees' }] });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await store.memoryItems.update((query) => query.where({ shortID: 'k3m9qa' }), {
    data(draft) {
      draft.versions.push({
        change: 'edited',
        checkerModel: null,
        checks: null,
        evidence: null,
        evidenceQuote: null,
        image: null,
        isUnreadable: false,
        origin: 'owner',
        proposalID: null,
        recordedAt: new Date(),
        source: 'owner',
        state: 'active',
        taskID: null,
        text: 'Keeps two hives',
        writerModel: null,
      });
    },
  });

  await ctx.user.click(within(item).getByRole('button', { name: 'Forget' }));

  const confirmation = within(item).getByRole('group', { name: 'Forget this item' });

  const notice = await within(confirmation).findByRole('alert');

  expect(notice).toHaveTextContent(
    'This item changed after the list loaded. Check it, then try again.',
  );

  expect(within(confirmation).getByRole('button', { name: 'Forget for good' })).toBeDisabled();
});

test('it keeps the confirmation open to retry once the forget start commits and its cleanup fails', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    failsForgetCleanup: true,
    shortID: 'k3m9qa',
    versions: [{ text: 'Keeps bees' }],
  });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await runMemoryForget(ctx.user, item);
  await within(item).findByText('The forget did not finish. Try again.');

  expect(within(item).getByRole('button', { name: 'Forget for good' })).toBeEnabled();
});

test('it offers to finish a forget whose cleanup failed once a refresh moves the item to the forgotten list', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    failsForgetCleanup: true,
    shortID: 'k3m9qa',
    versions: [{ text: 'Keeps bees' }],
  });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await runMemoryForget(ctx.user, item);
  await within(item).findByText('The forget did not finish. Try again.');

  rendered.rerender(<MemoryView key="refreshed" />);

  const finish = await within(rendered.getByRole('region', { name: 'Forgotten' })).findByRole(
    'button',
    { name: 'Finish the forget' },
  );

  expect(finish).toBeEnabled();
});

test('it completes a forget whose cleanup failed when the user finishes it from the forgotten list', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({
    failsForgetCleanup: true,
    shortID: 'k3m9qa',
    versions: [{ text: 'Keeps bees' }],
  });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await runMemoryForget(ctx.user, item);
  await within(item).findByText('The forget did not finish. Try again.');

  rendered.rerender(<MemoryView key="refreshed" />);

  const finish = await within(rendered.getByRole('region', { name: 'Forgotten' })).findByRole(
    'button',
    { name: 'Finish the forget' },
  );

  await ctx.user.click(finish);

  await waitFor(() => {
    const forgotten = rendered.getByRole('region', { name: 'Forgotten' });

    expect(within(forgotten).getByRole('listitem', { name: 'k3m9qa' })).toHaveTextContent(
      /^Forgotten item · created .+ · forgotten .+$/u,
    );
  });
});

test('it forgets the item once a failed confirm goes again', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Keeps bees' }] });

  server.use(http.post('*/rpc/memory/forget', () => HttpResponse.error(), { once: true }));

  const item = await within(
    render(<MemoryView />).getByRole('region', { name: 'Active' }),
  ).findByRole('listitem', { name: 'k3m9qa' });

  await ctx.user.click(within(item).getByRole('button', { name: 'Forget' }));

  await within(item).findByRole('list', { name: 'What the forget destroys' });

  await ctx.user.click(within(item).getByRole('button', { name: 'Forget for good' }));

  await within(item).findByText('The forget did not finish. Try again.');

  await ctx.user.click(within(item).getByRole('button', { name: 'Forget for good' }));

  await waitFor(() => {
    expect(store.memoryItems.findFirst((query) => query.where({ shortID: 'k3m9qa' }))?.state).toBe(
      'forgotten',
    );
  });
});

test('it keeps the item when the user keeps it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Keeps bees' }] });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Active' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  await ctx.user.click(within(item).getByRole('button', { name: 'Forget' }));
  await ctx.user.click(within(item).getByRole('button', { name: 'Keep it' }));

  expect(within(item).queryByRole('group', { name: 'Forget this item' })).toBeNull();

  expect(store.memoryItems.findFirst((query) => query.where({ shortID: 'k3m9qa' }))?.state).toBe(
    'active',
  );
});

test('it offers no forget for an item whose forget began elsewhere, even while its text still opens', async () => {
  await createDeviceSession();

  await store.memoryItems.create({
    isShredded: false,
    shortID: 'k3m9qa',
    state: 'forgetting',
    versions: [{ text: 'Keeps bees' }],
  });

  const rendered = render(<MemoryView />);

  const item = await within(rendered.getByRole('region', { name: 'Forgotten' })).findByRole(
    'listitem',
    { name: 'k3m9qa' },
  );

  expect(within(item).queryByRole('button', { name: 'Forget' })).toBeNull();
});
