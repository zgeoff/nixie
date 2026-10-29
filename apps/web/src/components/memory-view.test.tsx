import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { setupBrowserTimeZone } from '../test-utils/setup-browser-time-zone';
import { MemoryView } from './memory-view';

test('it finds an active item by a word in its text', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await Promise.all([
    store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] }),
    store.memoryItems.create({ shortID: 'p7x2rd', versions: [{ text: 'Drinks oat milk' }] }),
  ]);

  const rendered = render(<MemoryView />);

  await user.type(rendered.getByRole('searchbox', { name: 'Search memory' }), 'cello');
  await user.click(rendered.getByRole('button', { name: 'Search' }));

  const results = await rendered.findByRole('region', { name: 'Search results' });

  await within(results).findByRole('listitem', { name: 'k3m9qa' });

  expect(within(results).getAllByRole('listitem')).toHaveLength(1);
});

test('it shows every active item again when the search is cleared', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await Promise.all([
    store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] }),
    store.memoryItems.create({ shortID: 'p7x2rd', versions: [{ text: 'Drinks oat milk' }] }),
  ]);

  const rendered = render(<MemoryView />);

  await user.type(rendered.getByRole('searchbox', { name: 'Search memory' }), 'cello');
  await user.click(rendered.getByRole('button', { name: 'Search' }));
  await user.click(rendered.getByRole('button', { name: 'Clear' }));

  const active = rendered.getByRole('region', { name: 'Active' });

  await within(active).findByRole('listitem', { name: 'p7x2rd' });

  expect(within(active).getAllByRole('listitem')).toHaveLength(2);
});

test('it opens the item a notice linked to at the top of the page', async () => {
  await createDeviceSession();

  const item = await store.memoryItems.create({
    shortID: 'k3m9qa',
    versions: [{ text: 'Plays the cello' }],
  });

  const rendered = render(<MemoryView openItemID={item.itemID} />);

  const opened = await rendered.findByRole('region', { name: 'Opened item' });
  const row = await within(opened).findByRole('listitem', { name: 'k3m9qa' });

  expect(row).toHaveTextContent('Plays the cello');
});

test('it says so when the item a notice linked to is gone', async () => {
  await createDeviceSession();

  const rendered = render(<MemoryView openItemID="d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a" />);

  const opened = await rendered.findByRole('region', { name: 'Opened item' });
  const alert = await within(opened).findByRole('alert');

  expect(alert).toHaveTextContent('This item did not load. It may be gone.');
});

test('it lists retired items apart from the active ones', async () => {
  await createDeviceSession();

  await Promise.all([
    store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] }),
    store.memoryItems.create({
      shortID: 'p7x2rd',
      state: 'retired',
      versions: [
        { text: 'Drinks oat milk' },
        { change: 'retired', state: 'retired', text: 'Drinks oat milk' },
      ],
    }),
  ]);

  const rendered = render(<MemoryView />);
  const retired = rendered.getByRole('region', { name: 'Retired' });

  await within(retired).findByRole('listitem', { name: 'p7x2rd' });

  expect(within(retired).getAllByRole('listitem')).toHaveLength(1);

  expect(
    within(rendered.getByRole('region', { name: 'Active' })).queryByRole('listitem', {
      name: 'p7x2rd',
    }),
  ).toBeNull();
});

test('it lists self-notes apart from facts', async () => {
  await createDeviceSession();

  await Promise.all([
    store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Plays the cello' }] }),
    store.memoryItems.create({
      subject: 'self',
      shortID: 'p7x2rd',
      versions: [{ origin: 'conversation', text: 'Enjoys a slow morning question' }],
    }),
  ]);

  const rendered = render(<MemoryView />);
  const active = rendered.getByRole('region', { name: 'Active' });
  const selfNotes = rendered.getByRole('region', { name: 'Self-notes' });

  await within(selfNotes).findByRole('listitem', { name: 'p7x2rd' });
  await within(active).findByRole('listitem', { name: 'k3m9qa' });

  expect(within(selfNotes).getAllByRole('listitem')).toHaveLength(1);
  expect(within(active).getAllByRole('listitem')).toHaveLength(1);
});

test('it lists a newly approved shared item first in Active, ahead of 50 older facts', async () => {
  await createDeviceSession();

  await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      store.memoryItems.create({ versions: [{ text: `Owns bicycle number ${index}` }] }),
    ),
  );

  await store.memoryItems.create({
    subject: 'shared',
    shortID: 'k3m9qa',
    versions: [{ origin: 'memory_writer', text: 'Calls the kettle Captain Steam' }],
  });

  const rendered = render(<MemoryView />);
  const active = rendered.getByRole('region', { name: 'Active' });

  await within(active).findByRole('listitem', { name: 'k3m9qa' });

  expect(within(active).getAllByRole('listitem').at(0)).toHaveAccessibleName('k3m9qa');
});

test('it lists a self-note on the first page when 50 newer facts follow it', async () => {
  await createDeviceSession();

  await store.memoryItems.create({
    subject: 'self',
    shortID: 'p7x2rd',
    versions: [{ origin: 'conversation', text: 'Enjoys hearing about bicycles' }],
  });

  await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      store.memoryItems.create({ versions: [{ text: `Owns bicycle number ${index}` }] }),
    ),
  );

  const rendered = render(<MemoryView />);
  const selfNotes = rendered.getByRole('region', { name: 'Self-notes' });

  const note = await within(selfNotes).findByRole('listitem', { name: 'p7x2rd' });

  expect(note).toBeInTheDocument();
});

test('it shows Show more only under the list that has another page', async () => {
  await createDeviceSession();

  await Promise.all(
    Array.from({ length: 51 }, (_, index) =>
      store.memoryItems.create({ versions: [{ text: `Owns bicycle number ${index}` }] }),
    ),
  );

  await store.memoryItems.create({
    subject: 'self',
    shortID: 'p7x2rd',
    versions: [{ origin: 'conversation', text: 'Enjoys hearing about bicycles' }],
  });

  const rendered = render(<MemoryView />);
  const active = rendered.getByRole('region', { name: 'Active' });
  const selfNotes = rendered.getByRole('region', { name: 'Self-notes' });

  await within(selfNotes).findByRole('listitem', { name: 'p7x2rd' });

  const showMore = await within(active).findByRole('button', { name: 'Show more' });

  expect(rendered.getAllByRole('button', { name: 'Show more' })).toStrictEqual([showMore]);
});

test('it loads the next page of Active into Active only', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await Promise.all(
    Array.from({ length: 51 }, (_, index) =>
      store.memoryItems.create({ versions: [{ text: `Owns bicycle number ${index}` }] }),
    ),
  );

  await store.memoryItems.create({
    subject: 'self',
    shortID: 'p7x2rd',
    versions: [{ origin: 'conversation', text: 'Enjoys hearing about bicycles' }],
  });

  const rendered = render(<MemoryView />);
  const active = rendered.getByRole('region', { name: 'Active' });
  const selfNotes = rendered.getByRole('region', { name: 'Self-notes' });

  await within(selfNotes).findByRole('listitem', { name: 'p7x2rd' });

  const showMore = await within(active).findByRole('button', { name: 'Show more' });

  await user.click(showMore);

  await waitFor(() => {
    expect(within(active).queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  expect(within(active).getAllByRole('listitem')).toHaveLength(51);
  expect(within(selfNotes).getAllByRole('listitem')).toHaveLength(1);
});

test('it finds self-notes apart from facts', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await Promise.all([
    store.memoryItems.create({ shortID: 'k3m9qa', versions: [{ text: 'Walks by the river' }] }),
    store.memoryItems.create({
      subject: 'self',
      shortID: 'p7x2rd',
      versions: [{ origin: 'conversation', text: 'Likes hearing about the river' }],
    }),
  ]);

  const rendered = render(<MemoryView />);

  await user.type(rendered.getByRole('searchbox', { name: 'Search memory' }), 'river');
  await user.click(rendered.getByRole('button', { name: 'Search' }));

  const results = await rendered.findByRole('region', { name: 'Search results' });

  await within(results).findByRole('listitem', { name: 'k3m9qa' });

  expect(within(results).getAllByRole('listitem')).toHaveLength(1);

  expect(
    within(rendered.getByRole('region', { name: 'Self-notes' })).getByRole('listitem'),
  ).toHaveAccessibleName('p7x2rd');
});

test('it marks a retired self-note with a self-note badge', async () => {
  await createDeviceSession();

  await store.memoryItems.create({
    subject: 'self',
    shortID: 'p7x2rd',
    state: 'retired',
    versions: [
      { origin: 'conversation', text: 'Enjoys a slow morning question' },
      { change: 'retired', state: 'retired', text: 'Enjoys a slow morning question' },
    ],
  });

  const rendered = render(<MemoryView />);
  const retired = rendered.getByRole('region', { name: 'Retired' });

  const row = await within(retired).findByRole('listitem', { name: 'p7x2rd' });

  expect(within(row).getByText('self-note')).toBeInTheDocument();
});

test('it shows a forgotten item as a dated gap with no text', async () => {
  setupBrowserTimeZone('UTC');

  await createDeviceSession();

  await store.memoryItems.create({
    forgottenAt: new Date('2026-03-04T10:00:00Z'),
    shortID: 'p7x2rd',
    state: 'forgotten',
    versions: [{ recordedAt: new Date('2026-02-01T08:00:00Z'), text: 'Drinks oat milk' }],
  });

  const rendered = render(<MemoryView />);
  const forgotten = rendered.getByRole('region', { name: 'Forgotten' });

  const gap = await within(forgotten).findByRole('listitem', { name: 'p7x2rd' });

  expect(gap).toHaveTextContent(/^Forgotten item · created Feb 1, 2026 · forgotten Mar 4, 2026$/u);
});

test('it shows the pinned core with its size against its budget', async () => {
  await createDeviceSession();

  await Promise.all([
    store.memoryItems.create({
      isPinned: true,
      shortID: 'k3m9qa',
      versions: [{ text: 'Plays the cello on Thursdays' }],
    }),
    store.memoryItems.create({ shortID: 'p7x2rd', versions: [{ text: 'Drinks oat milk' }] }),
  ]);

  const rendered = render(<MemoryView />);
  const core = rendered.getByRole('region', { name: 'Pinned core' });

  await within(core).findByText('7 of 2,000 tokens');

  expect(within(core).getAllByRole('listitem', { name: 'k3m9qa' })).toHaveLength(1);
  expect(within(core).queryByRole('listitem', { name: 'p7x2rd' })).toBeNull();
});

test('it shows the writer catch-up with its cursor, backlog and last error', async () => {
  setupBrowserTimeZone('UTC');

  await createDeviceSession();

  await store.memoryWriter.create({
    backlog: 1240,
    cursor: 5310,
    isCatchingUp: true,
    lastError: {
      at: new Date('2026-03-02T09:15:00Z'),
      code: 'model_timeout',
      message: 'no answer',
    },
  });

  const rendered = render(<MemoryView />);

  const writer = await rendered.findByRole('region', { name: 'Memory writer' });

  expect(writer).toHaveTextContent(
    'Memory writer: catching up on earlier conversation · at record 5,310 · 1,240 messages wait',
  );

  expect(writer).toHaveTextContent('Last error: model_timeout (no answer) at Mar 2, 9:15 AM');
});

test('it shows the writer as off when the deployment turns it off', async () => {
  await createDeviceSession();

  await store.memoryWriter.create({ isEnabled: false, cursor: 5310, backlog: 1240 });

  const rendered = render(<MemoryView />);

  const writer = await rendered.findByRole('region', { name: 'Memory writer' });

  expect(writer).toHaveTextContent(/^Memory writer: off$/u);
});

test('it shows the consolidation as off when the deployment turns it off', async () => {
  await createDeviceSession();

  await store.memoryConsolidator.create({ isEnabled: false });

  const rendered = render(<MemoryView />);

  const consolidation = await rendered.findByRole('region', { name: 'Memory consolidation' });

  expect(consolidation).toHaveTextContent(/^Memory consolidation: off$/u);
});

test('it shows no consolidation line while the consolidator is on', async () => {
  await createDeviceSession();

  const rendered = render(<MemoryView />);

  await rendered.findByRole('region', { name: 'Memory writer' });

  expect(rendered.queryByRole('region', { name: 'Memory consolidation' })).toBeNull();
});

test('it shows an item with who wrote it, from what, and when', async () => {
  setupBrowserTimeZone('UTC');

  await createDeviceSession();

  await store.memoryItems.create({
    shortID: 'k3m9qa',
    versions: [
      {
        origin: 'memory_writer',
        recordedAt: new Date('2026-02-01T08:00:00Z'),
        source: 'owner',
        text: 'Plays the cello',
      },
    ],
  });

  const rendered = render(<MemoryView />);
  const active = rendered.getByRole('region', { name: 'Active' });

  const item = await within(active).findByRole('listitem', { name: 'k3m9qa' });

  expect(item).toHaveTextContent(
    /^Plays the celloby the memory writer, from your own words · created Feb 1, 2026RetirePinMark sensitiveForgetHistory$/u,
  );
});
